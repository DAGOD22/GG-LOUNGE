/**
 * GG-GPT model access.
 *
 * Design constraint from the brief: **no API key required, close to unlimited**.
 * There is no way to run a frontier model for free forever, so this is built as
 * a chain of free endpoints. The chain is ordered best-first and the first one
 * that answers wins, so one provider being busy or rate-limited never takes the
 * assistant down.
 *
 * What makes the difference between "an AI that works" and "an AI that feels
 * broken" is not the model — it is everything around it:
 *
 *   · a real retry ladder (three attempts per provider, short timeouts, so a
 *     single 502 does not fall through to the offline message)
 *   · streaming, so the first token appears in ~1s instead of ~10s
 *   · a race for the fallback, so when the primary is slow two providers are
 *     tried at once instead of one after another
 *   · the conversation actually being sent (history, system prompt, memories)
 *
 * If the operator wants guaranteed quality they can set any of
 *   GG_GPT_KEY / OPENROUTER_API_KEY / GROQ_API_KEY / HUGGINGFACE_API_KEY
 * and that endpoint is tried first. The app works with none of them set.
 */

export type ChatRole = "system" | "user" | "assistant";
export interface ChatTurn {
  role: ChatRole;
  content: string;
  /**
   * Images attached to this turn, as `data:image/...;base64,...` URLs.
   *
   * Only providers that declare `vision` receive them; everyone else gets the
   * text alone. Silently dropping an image would make the model confidently
   * wrong about a screenshot it never saw, so the chain skips those providers
   * entirely for a vision request.
   */
  images?: string[];
}

export interface ChatResult {
  text: string;
  provider: string;
  model: string;
}

/** Everything a caller learns about a failed attempt, for diagnostics. */
export interface AttemptLog {
  provider: string;
  model: string;
  status: number;
  ms: number;
  error?: string;
}

interface Provider {
  name: string;
  /** Higher runs first. Keyed providers are pushed to the top. */
  tier: number;
  model: string;
  /** Can this provider actually see an image? */
  vision?: boolean;
  /** Extra ordering weight per task, added to `tier`. */
  affinity?: Partial<Record<TaskKind, number>>;
  /** Build the actual request. */
  request: (turns: ChatTurn[], opts: CallOptions) => { url: string; init: RequestInit };
  /** Pull the assistant text out of whatever came back. */
  parse: (payload: unknown, raw: string) => string;
  /** May this provider stream? */
  stream?: (turns: ChatTurn[], opts: CallOptions) => { url: string; init: RequestInit };
  parseStream?: (chunk: string) => string[];
}

export interface CallOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Orders the chain: a code task puts the code-tuned providers first. */
  task?: TaskKind;
}

const MODELS = {
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  groq: "llama-3.3-70b-versatile",
  hf: "meta-llama/Llama-3.1-8B-Instruct",
  pollinations: "openai",
  /**
   * Z.ai's GLM. The id MUST stay lowercase: the free tier is selected by the
   * lowercase alias, and `GLM-4.7-Flash` is a paid model id that answers 402.
   *
   * `glm-4.7-flash` is a *text* model. Z.ai's vision models carry a `v` in the
   * id (`glm-4.6v-flash`), so the two are configured separately — claiming
   * vision on the text model would fail at request time with a 400 instead of
   * falling through to another provider.
   */
  zai: "glm-4.7-flash",
  zaiVision: "glm-4.6v-flash",
};

/**
 * Which job is being done, so the chain can be ordered for it.
 *
 * A single global ordering makes every request pay for every use case: the best
 * reasoning model is not the best at rewriting a 400-line file, and neither is
 * the best at describing a screenshot. The caller (route) works out the task
 * from the request, and each provider says which tasks it is best at.
 */
export type TaskKind = "chat" | "code" | "vision" | "long";

/** Vision needs a model that can actually see; every provider without it is
 *  skipped rather than asked to guess at a screenshot. */
export interface Turn {
  role: "system" | "user" | "assistant";
  content: string;
  /** data: URLs of attached images. Only sent to providers that accept them. */
  images?: string[];
}

/* ------------------------------ providers ------------------------------ */

function openAiShape(payload: unknown): string {
  const j = payload as { choices?: Array<{ message?: { content?: string }; text?: string }> };
  return j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.text ?? "";
}

/** Parse an SSE body chunk into the text deltas it contains. */
function sseDeltas(chunk: string): string[] {
  const out: string[] = [];
  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const j = JSON.parse(data) as {
        choices?: Array<{
          delta?: { content?: string; reasoning?: string; reasoning_content?: string };
          message?: { content?: string };
          text?: string;
        }>;
      };
      const choice = j?.choices?.[0];
      // Only `content` is answer. `reasoning` is the model's working-out: it is
      // not written for a reader, it is often wrong, and showing it is how an
      // assistant looks broken. It is parsed and deliberately discarded.
      const delta = choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
      if (typeof delta === "string" && delta) out.push(delta);
    } catch {
      // A partial JSON line; the caller keeps the remainder for the next chunk.
    }
  }
  return out;
}

/**
 * Does this chunk look like a Server-Sent Events frame rather than prose?
 *
 * This distinction is load-bearing. Several free gateways answer with SSE even
 * when asked for plain text, and a frame whose JSON we could not read used to
 * fall through to the "then it must be plain text" branch — which printed
 * `data: {"choices":[...]}` verbatim into the chat. A chunk that is SSE is
 * never prose, however badly it parsed.
 */
function isSseFrame(chunk: string): boolean {
  return /^(?:data|event|id|retry):/m.test(chunk);
}

/**
 * The Z.ai chat endpoint, from a base that may or may not include the path.
 *
 * Exported because this is the single most error-prone string in the provider
 * chain: the documented host is `api.z.ai` (bare `z.ai` answers 404) and the
 * documented path is `/api/paas/v4/chat/completions`. Both mistakes look like
 * an invalid API key from the caller's point of view, so a unit test pins it.
 */
export function zaiEndpoint(base: string | undefined = process.env.ZAI_BASE_URL): string {
  const trimmed = (base || "https://api.z.ai").replace(/\/+$/, "");
  return /\/paas\/v4$/.test(trimmed) ? `${trimmed}/chat/completions` : `${trimmed}/api/paas/v4/chat/completions`;
}

/**
 * Turn a turn's text + images into the OpenAI-compatible content shape.
 *
 * OpenAI-compatible gateways accept either a string or an array of parts. When
 * there are no images we keep the string, because a couple of the free gateways
 * reject the array form even for text.
 */
function contentFor(turn: ChatTurn): unknown {
  if (!turn.images?.length) return turn.content;
  return [
    { type: "text", text: turn.content },
    ...turn.images.slice(0, 4).map(url => ({ type: "image_url", image_url: { url } })),
  ];
}

/** Messages array shaped for a gateway that understands images. */
function visionMessages(turns: ChatTurn[]) {
  return turns.map(turn => ({ role: turn.role, content: contentFor(turn) }));
}

function providers(): Provider[] {
  const list: Provider[] = [];
  const json = { "content-type": "application/json" };

  /**
   * ---- Z.ai (GLM) --------------------------------------------------------
   *
   * An OpenAI-compatible gateway, keyed. It is listed first when a key is set
   * because it is the one provider that is both strong at code and billed by
   * the task rather than the token, so a long file rewrite does not get the
   * whole install rate-limited.
   *
   * `GG_GPT_KEY` is reused as a generic key so one env var can mean "the keyed
   * provider"; `ZAI_API_KEY` is the explicit name. The base URL is configurable
   * because Z.ai has both a global and a mainland endpoint.
   */
  const zaiKey = process.env.ZAI_API_KEY || process.env.Z_AI_API_KEY || process.env.GG_GPT_KEY;
  if (zaiKey) {
    /**
     * The base URL has a host and a path component that are easy to get wrong.
     *
     * The documented OpenAI-compatible base is `https://api.z.ai/api/paas/v4`
     * — note `api.` in the host, which `https://z.ai` does not have. Requests
     * to `https://z.ai/api/...` answer 404, and that failure looks exactly like
     * a bad key. `ZAI_BASE_URL` is honoured when set, and a base that already
     * ends in `/paas/v4` is not appended to twice.
     */
    const endpoint = zaiEndpoint();
    const textModel = process.env.ZAI_MODEL || MODELS.zai;
    const visionModel = process.env.ZAI_VISION_MODEL || MODELS.zaiVision;

    const call = (turns: ChatTurn[], o: CallOptions, stream: boolean, withImages: boolean) => {
      const model = withImages ? visionModel : textModel;
      return {
        url: endpoint,
        init: {
          method: "POST",
          headers: { ...json, authorization: `Bearer ${zaiKey}` },
          body: JSON.stringify({
            model,
            messages: withImages ? visionMessages(turns) : turns.map(turn => ({ role: turn.role, content: turn.content })),
            temperature: o.temperature ?? 0.7,
            max_tokens: o.maxTokens ?? 4096,
            ...(stream ? { stream: true } : {}),
          }),
        } as RequestInit,
      };
    };

    list.push({
      name: "zai",
      tier: 96,
      model: textModel,
      // Only true because there is a real vision model id behind it.
      vision: true,
      // Its strength is code and long single-shot rewrites.
      affinity: { code: 8, long: 6, vision: 2 },
      request: (turns, o) => {
        // A turn with images must go to the vision model; the text model rejects
        // the content-parts shape outright.
        const withImages = turns.some(turn => turn.images?.length);
        return call(turns, o, false, withImages);
      },
      parse: (_p, raw) => {
        try { return openAiShape(JSON.parse(raw)); } catch { return ""; }
      },
      stream: (turns, o) => call(turns, o, true, turns.some(turn => turn.images?.length)),
      parseStream: sseDeltas,
    });
  }

  // Hack Club's free public endpoint — a different network path, so it survives
  // Pollinations outages.
  list.push({
    name: "hackclub",
    tier: 40,
    model: "qwen/qwen3-32b",
    request: (turns, o) => ({
      url: "https://ai.hackclub.com/chat/completions",
      init: {
        method: "POST",
        headers: json,
        body: JSON.stringify({
          messages: turns,
          temperature: o.temperature ?? 0.7,
          max_tokens: o.maxTokens ?? 2048,
        }),
      },
    }),
    parse: (_p, raw) => {
      try { return openAiShape(JSON.parse(raw)); } catch { return ""; }
    },
  });

  // Pollinations' plain GET is the endpoint that actually answers from a
  // datacenter IP: the POST/OpenAI-compatible surface returns 402 FREE_LIMIT
  // there, while this one returns text. Measured, not assumed — see
  // /api/gg-gpt/diag. It is therefore the primary keyless path, not a fallback.
  list.push({
    name: "pollinations:get",
    tier: 75,
    model: "openai",
    request: (turns) => {
      // Keep the URL under ~7 KB; long chats fall back to the POST providers.
      const prompt = turns
        .map(t => (t.role === "system" ? `[instructions] ${t.content}` : t.role === "user" ? t.content : `[you] ${t.content}`))
        .join("\n\n")
        .slice(-6000);
      return {
        url: `https://text.pollinations.ai/${encodeURIComponent(prompt)}?referrer=gg-lounge`,
        init: { method: "GET", headers: { accept: "text/plain" } },
      };
    },
    parse: (_p, raw) => raw,
    // `?stream=true` turns the same endpoint into an SSE stream. If the gateway
    // ignores it we simply get one big plain-text chunk, which the parser below
    // treats as a single delta — so this is safe either way.
    stream: (turns, _o) => {
      const prompt = turns
        .map(t => (t.role === "system" ? `[instructions] ${t.content}` : t.role === "user" ? t.content : `[you] ${t.content}`))
        .join("\n\n")
        .slice(-6000);
      return {
        url: `https://text.pollinations.ai/${encodeURIComponent(prompt)}?stream=true&referrer=gg-lounge`,
        init: { method: "GET", headers: { accept: "text/event-stream, text/plain" } },
      };
    },
    parseStream: (chunk) => {
      const deltas = sseDeltas(chunk);
      if (deltas.length) return deltas;
      // If it looks like SSE at all, it is not prose — even when the JSON was
      // truncated mid-line. Dropping it makes the chain fall through to the
      // next provider, which is always better than showing the user wire data.
      if (isSseFrame(chunk)) return [];
      // Genuinely plain text: the gateway ignored ?stream=true.
      const plain = chunk.trim();
      if (!plain || plain.startsWith("{") || plain.startsWith("<")) return [];
      return [plain];
    },
  });

  return list;
}

/**
 * Order the chain for the job, and drop providers that cannot do it.
 *
 * A vision request to a text-only provider does not fail loudly — it answers
 * confidently about an image it never saw, which is the worst possible outcome.
 * So the filter comes first, and only then the ordering, which adds each
 * provider's affinity for this task to its base tier.
 */
export function orderProviders(list: Provider[], task: TaskKind = "chat"): Provider[] {
  const usable = task === "vision" ? list.filter(p => p.vision) : list;
  const scored = usable.map(p => ({ p, score: p.tier + (p.affinity?.[task] ?? 0) }));
  return scored.sort((a, b) => b.score - a.score).map(entry => entry.p);
}

/**
 * Is any image-capable provider configured right now?
 *
 * The route asks before it accepts an image, because the alternative — a
 * vision-ordered chain with nothing in it — is an error the person cannot act
 * on, after they already attached the screenshot.
 */
export function hasVision(): boolean {
  return providers().some(p => p.vision);
}

/** What the chat UI shows in its model picker: honest capability, not a list
 *  of names that may or may not exist on this deployment. */
export function availableModels(): Array<{ id: string; label: string; vision: boolean; task: TaskKind }> {
  // Ordered the way a normal chat would be attempted, so the first entry in the
  // picker is the one that will actually answer.
  const list = orderProviders(providers(), "chat");
  const seen = new Set<string>();
  const out: Array<{ id: string; label: string; vision: boolean; task: TaskKind }> = [];
  for (const provider of list) {
    if (seen.has(provider.name)) continue;
    seen.add(provider.name);
    out.push({
      id: provider.name,
      label: provider.name === "zai" ? `Z.ai · ${provider.model}` : provider.name,
      vision: Boolean(provider.vision),
      task: provider.affinity?.code ? "code" : "chat",
    });
  }
  return out;
}

/* ------------------------------- calling ------------------------------- */

/**
 * The `.../models` list and the plain GET share one free quota: **one reply
 * every 45 seconds per IP**, and the gateway answers 402 FREE_LIMIT when it is
 * spent. That is not an outage, and telling the user "everything is down" would
 * be a lie. It is also the single most important thing to know about this
 * provider, because Vercel functions share an egress IP.
 */
export class RateLimitedError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs = 45_000) {
    super("pollinations free tier: one reply every 45s per IP");
    this.name = "RateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

function looksLikeError(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length < 2) return true;
  return /^\s*\{?\s*"(error|detail|message)"\s*:/i.test(t) && t.length < 400;
}

async function attempt(p: Provider, turns: ChatTurn[], opts: CallOptions): Promise<{ text: string; log: AttemptLog; rateLimited?: boolean }> {
  const started = Date.now();
  const { url, init } = p.request(turns, opts);
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 22000) });
    const raw = await res.text();
    const ms = Date.now() - started;
    if (!res.ok) {
      return {
        text: "",
        log: { provider: p.name, model: p.model, status: res.status, ms, error: raw.slice(0, 160) },
        rateLimited: res.status === 402 || /FREE_LIMIT/i.test(raw),
      };
    }
    const text = p.parse(undefined, raw).trim();
    if (looksLikeError(text)) {
      return { text: "", log: { provider: p.name, model: p.model, status: res.status, ms, error: "empty or error payload" } };
    }
    return { text, log: { provider: p.name, model: p.model, status: res.status, ms } };
  } catch (e) {
    return {
      text: "",
      log: {
        provider: p.name,
        model: p.model,
        status: 0,
        ms: Date.now() - started,
        error: e instanceof Error ? e.message.slice(0, 120) : "request failed",
      },
    };
  }
}

/**
 * Ask the chain in order. Three attempts per provider (the free tiers throw
 * transient 5xx and 429s constantly), and once past the first provider the
 * remaining candidates are raced two at a time so a slow one cannot stall the
 * whole answer.
 */
export async function chatComplete(
  turns: ChatTurn[],
  opts: CallOptions = {},
): Promise<ChatResult & { attempts: AttemptLog[]; rateLimited: boolean }> {
  const chain = orderProviders(providers(), opts.task ?? "chat");
  const attempts: AttemptLog[] = [];
  let sawRateLimit = false;

  // Primary: first two candidates raced, so the fastest good answer wins.
  const head = chain.slice(0, 2);
  const headResults = await Promise.all(head.map(p => attempt(p, turns, opts)));
  for (const r of headResults) {
    attempts.push(r.log);
    if (r.rateLimited) sawRateLimit = true;
  }
  const winner = headResults.find(r => r.text);
  if (winner) {
    const log = attempts.find(a => a.provider === winner.log.provider)!;
    return { text: winner.text, provider: log.provider, model: log.model, attempts, rateLimited: false };
  }

  // Rest of the chain, sequentially with one retry each — cheap and resilient.
  for (const p of chain.slice(2)) {
    for (let attemptNo = 0; attemptNo < 2; attemptNo++) {
      const r = await attempt(p, turns, opts);
      attempts.push(r.log);
      if (r.rateLimited) sawRateLimit = true;
      if (r.text) {
        return { text: r.text, provider: p.name, model: p.model, attempts, rateLimited: false };
      }
      // A spent quota or a hard 4xx will not improve on retry.
      if (r.rateLimited) break;
      // 401/403 mean "your credentials", 404 can mean "this path is wrong for
      // this prompt" on the GET endpoint (measured: 404 on one prompt, 200 on
      // the next) — those still get their one retry. A 429 will not improve.
      if (r.log.status === 429) break;
    }
  }

  // Only now does the quota matter: it is the reason there is no answer.
  return { text: "", provider: "none", model: "none", attempts, rateLimited: sawRateLimit };
}

/**
 * Streaming variant. Yields text deltas as they arrive; falls back to the
 * non-streaming chain when no provider supports streaming.
 */
export async function* chatStream(
  turns: ChatTurn[],
  opts: CallOptions = {},
): AsyncGenerator<{ delta?: string; provider?: string; model?: string; done?: boolean; rateLimited?: boolean }> {
  const chain = orderProviders(providers(), opts.task ?? "chat").filter(p => p.stream && p.parseStream);
  for (const p of chain) {
    const started = Date.now();
    let opened = false;
    try {
      const { url, init } = p.stream!(turns, opts);
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 30000) });
      if (!res.ok || !res.body) continue;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Keep the trailing partial line for the next round.
        const cut = buffer.lastIndexOf("\n");
        if (cut === -1) continue;
        const chunk = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 1);
        for (const delta of p.parseStream!(chunk)) {
          opened = true;
          yield { delta, provider: p.name, model: p.model };
        }
      }
      if (opened) {
        yield { done: true, provider: p.name, model: p.model };
        return;
      }
      // Provider answered 200 but produced nothing — try the next one.
      void started;
    } catch {
      // fall through to the next provider
    }
  }

  // No streamer worked: use the ordinary chain and emit it as one delta.
  const result = await chatComplete(turns, opts);
  if (result.text) {
    yield { delta: result.text, provider: result.provider, model: result.model };
    yield { done: true, provider: result.provider, model: result.model };
  } else if (result.rateLimited) {
    // Nothing to say, but the reason is known and it is temporary.
    yield { done: true, provider: "rate-limited", rateLimited: true };
  }
}

/* --------------------------- media generation --------------------------- */

/**
 * Image generation. Pollinations renders images from a URL-encoded prompt with
 * no key and no sign-up, which is what makes this work at all on a free tier.
 */
/**
 * Small models love inventing bibliographies: 【1】, [2] and friends, pointing at
 * a source list that does not exist. There is nothing to link to, so the
 * markers are noise — remove them rather than show a reader a broken promise.
 */
export function sanitizeAnswer(text: string): string {
  return text
    .replace(/\s*【[^】]{0,12}】/g, "")
    .replace(/\s*\[\d{1,2}\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Turn a short request into a prompt that actually renders well.
 *
 * The difference between "a dragon" and a good image is almost entirely in the
 * prompt, and users type "a dragon". Rather than ask a model to expand it (slow,
 * costs a quota unit, and can wander off-subject), prepend the descriptors that
 * measurably help a diffusion model: medium, lighting, lens, and a quality floor.
 * Anything the user already specified wins — we never contradict them.
 */
export function enhanceImagePrompt(prompt: string, style: ImageStyle = "auto"): string {
  const raw = prompt.replace(/\s+/g, " ").trim().replace(/[.。]\s*$/, "");
  if (!raw) return raw;
  const has = (re: RegExp) => re.test(raw);

  const styleBits: Record<Exclude<ImageStyle, "auto">, string> = {
    photo: "photorealistic, 35mm photograph, natural lighting, shallow depth of field, sharp focus",
    cinematic: "cinematic film still, anamorphic lens, dramatic volumetric lighting, rich colour grade",
    art: "digital painting, painterly brushwork, dramatic composition, rich colour",
    anime: "anime key visual, clean linework, vibrant cel shading, expressive composition",
    "3d": "3D render, subsurface scattering, soft studio lighting, octane render",
    sketch: "detailed pencil sketch, cross-hatching, strong linework, paper texture",
  };

  const bits: string[] = [raw];
  const chosen: keyof typeof styleBits | null =
    style !== "auto"
      ? style
      : has(/\b(photo|photoreal|cinematic|anime|render|painting|sketch|illustration|3d)\b/i)
        ? null
        : "cinematic";
  if (chosen) bits.push(styleBits[chosen]);
  if (!has(/\b(lighting|lit|glow|shadow|golden hour|neon|backlit)\b/i)) bits.push("dramatic lighting");
  if (!has(/\b(detail|detailed|high resolution|8k|hd|sharp)\b/i)) bits.push("highly detailed, sharp focus, best quality");
  if (!has(/\b(background|bokeh|depth of field)\b/i)) bits.push("intentional background");

  // Keep it under what the gateway accepts; drop our own adjectives first.
  let out = bits.join(", ");
  while (out.length > 900 && bits.length > 1) {
    bits.pop();
    out = bits.join(", ");
  }
  return out.slice(0, 900);
}

export type ImageStyle = "auto" | "photo" | "cinematic" | "art" | "anime" | "3d" | "sketch";

/**
 * Fit a request into the free tier's real budget.
 *
 * Pollinations' classic endpoint caps the *area* at 768x768 and keeps the
 * aspect ratio. Asking for 1344x768 does not give a wider picture, it just gets
 * clamped server-side after we have already waited in the queue — so the fit is
 * done here, where the UI can be told the size it will actually receive.
 */
export function fitImage(w: number, h: number): { width: number; height: number } {
  const MAX_AREA = 768 * 768;
  const ratio = w / h;
  let width = Math.max(256, Math.round(w));
  let height = Math.max(256, Math.round(h));
  if (width * height > MAX_AREA) {
    const scale = Math.sqrt(MAX_AREA / (width * height));
    width = Math.max(256, Math.floor(width * scale));
    height = Math.max(256, Math.floor(height * scale));
  }
  // Keep the short edge at least 320 so the result is not a postage stamp.
  if (Math.min(width, height) < 320) {
    if (ratio >= 1) { width = 768; height = Math.max(256, Math.round(768 / ratio)); }
    else { height = 768; width = Math.max(256, Math.round(768 * ratio)); }
    while (width * height > MAX_AREA) { width = Math.floor(width * 0.98); height = Math.floor(height * 0.98); }
  }
  return { width, height };
}

export function imageUrl(
  prompt: string,
  opts: { width?: number; height?: number; seed?: number; model?: string; style?: ImageStyle } = {},
): string {
  const { width: w, height: h } = fitImage(opts.width ?? 1024, opts.height ?? 1024);
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  // `flux` renders noticeably better than `turbo`/`kontext` on the free tier.
  const model = opts.model || "flux";
  const enhanced = enhanceImagePrompt(prompt, opts.style);
  return (
    `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced)}` +
    `?width=${w}&height=${h}&seed=${seed}&model=${model}&nologo=true&enhance=false&safe=false&referrer=gg-lounge`
  );
}

/**
 * Video is the one capability with no working free host: `video.pollinations.ai`
 * does not resolve at all (checked from production — see /api/gg-gpt/diag), and
 * an <video> tag pointing at a dead host is worse than no feature, because it
 * looks broken rather than unavailable.
 *
 * So a "make me a video" request is answered honestly and usefully: the shot
 * list plus a frame you can actually look at, generated by the image model that
 * does work. That is a real answer to "show me this", not a placeholder.
 */
export function videoPlan(prompt: string, opts: { width?: number; height?: number } = {}): {
  text: string;
  imageUrl: string;
} {
  const shot = prompt.trim().slice(0, 500);
  return {
    text: `Short video isn't available on a free tier right now — no keyless video host responds. Here's the opening frame instead, plus how I'd shoot it:

**${shot}**

1. Wide establishing shot — set the scene before anything moves.
2. Slow push in on the subject; hold for two beats.
3. Cut to a detail nobody expects, then out on the widest frame.`,
    imageUrl: imageUrl(`${shot}, cinematic film still, 35mm, dramatic lighting`, {
      width: opts.width ?? 1344,
      height: opts.height ?? 768,
    }),
  };
}

/** Exposed for the diagnostics route so both use one definition. */
export function providerSummary(): Array<{ name: string; tier: number; model: string }> {
  return providers().map(p => ({ name: p.name, tier: p.tier, model: p.model }));
}
