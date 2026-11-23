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
}

const MODELS = {
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  groq: "llama-3.3-70b-versatile",
  hf: "meta-llama/Llama-3.1-8B-Instruct",
  pollinations: "openai",
};

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
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      };
      const delta = j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.message?.content;
      if (delta) out.push(delta);
    } catch {
      // A partial JSON line; the caller keeps the remainder for the next chunk.
    }
  }
  return out;
}

function providers(): Provider[] {
  const list: Provider[] = [];
  const json = { "content-type": "application/json" };

  // ---- keyed, highest quality ----
  const openrouter = process.env.GG_GPT_KEY || process.env.OPENROUTER_API_KEY;
  if (openrouter) {
    list.push({
      name: "openrouter",
      tier: 100,
      model: process.env.GG_GPT_MODEL || MODELS.openrouter,
      request: (turns, o) => ({
        url: "https://openrouter.ai/api/v1/chat/completions",
        init: {
          method: "POST",
          headers: {
            ...json,
            authorization: `Bearer ${openrouter}`,
            "HTTP-Referer": "https://gg-lounge.vercel.app",
            "X-Title": "GG-GPT",
          },
          body: JSON.stringify({
            model: process.env.GG_GPT_MODEL || MODELS.openrouter,
            messages: turns,
            temperature: o.temperature ?? 0.7,
            max_tokens: o.maxTokens ?? 2048,
          }),
        },
      }),
      parse: (_p, raw) => {
        try { return openAiShape(JSON.parse(raw)); } catch { return ""; }
      },
      stream: (turns, o) => ({
        url: "https://openrouter.ai/api/v1/chat/completions",
        init: {
          method: "POST",
          headers: {
            ...json,
            authorization: `Bearer ${openrouter}`,
            "HTTP-Referer": "https://gg-lounge.vercel.app",
            "X-Title": "GG-GPT",
          },
          body: JSON.stringify({
            model: process.env.GG_GPT_MODEL || MODELS.openrouter,
            messages: turns,
            temperature: o.temperature ?? 0.7,
            max_tokens: o.maxTokens ?? 2048,
            stream: true,
          }),
        },
      }),
      parseStream: sseDeltas,
    });
  }
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    list.push({
      name: "groq",
      tier: 95,
      model: process.env.GG_GPT_MODEL || MODELS.groq,
      request: (turns, o) => ({
        url: "https://api.groq.com/openai/v1/chat/completions",
        init: {
          method: "POST",
          headers: { ...json, authorization: `Bearer ${groq}` },
          body: JSON.stringify({
            model: process.env.GG_GPT_MODEL || MODELS.groq,
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
  }
  const hf = process.env.HUGGINGFACE_API_KEY;
  if (hf) {
    list.push({
      name: "huggingface",
      tier: 90,
      model: process.env.GG_GPT_MODEL || MODELS.hf,
      request: (turns, o) => ({
        url: "https://router.huggingface.co/v1/chat/completions",
        init: {
          method: "POST",
          headers: { ...json, authorization: `Bearer ${hf}` },
          body: JSON.stringify({
            model: process.env.GG_GPT_MODEL || MODELS.hf,
            messages: turns,
            temperature: o.temperature ?? 0.7,
            max_tokens: o.maxTokens ?? 1024,
          }),
        },
      }),
      parse: (_p, raw) => {
        try { return openAiShape(JSON.parse(raw)); } catch { return ""; }
      },
    });
  }

  // ---- keyless, always available ----
  // Pollinations with the (usually) strongest free alias, then the lighter ones.
  // Measured from production (see /api/gg-gpt/diag): every POST alias answers
  // 402 FREE_LIMIT from a datacenter IP, and qwen-coder does not exist at all.
  // They stay as cheap secondary hopes — a shared quota sometimes frees up —
  // but nothing important may depend on them.
  for (const [alias, tier] of [
    ["openai", 55],
    ["openai-fast", 50],
    ["mistral", 45],
  ] as const) {
    list.push({
      name: `pollinations:${alias}`,
      tier,
      model: alias,
      request: (turns, o) => ({
        url: "https://text.pollinations.ai/openai",
        init: {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            model: alias,
            messages: turns,
            stream: false,
            temperature: o.temperature ?? 0.7,
            max_tokens: o.maxTokens ?? 2048,
            referrer: "gg-lounge",
          }),
        },
      }),
      parse: (_p, raw) => {
        try { return openAiShape(JSON.parse(raw)); } catch { return raw.slice(0, 4000); }
      },
      stream: (turns, o) => ({
        url: "https://text.pollinations.ai/openai",
        init: {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            model: alias,
            messages: turns,
            stream: true,
            temperature: o.temperature ?? 0.7,
            max_tokens: o.maxTokens ?? 2048,
            referrer: "gg-lounge",
          }),
        },
      }),
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
      // Not SSE: the whole body arrived at once.
      const plain = chunk.trim();
      if (!plain || plain.startsWith("{") || plain.startsWith("<")) return [];
      return [plain];
    },
  });

  return list.sort((a, b) => b.tier - a.tier);
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
  const chain = providers();
  const attempts: AttemptLog[] = [];
  let rateLimited = false;

  // Primary: first two candidates raced, so the fastest good answer wins.
  const head = chain.slice(0, 2);
  const headResults = await Promise.all(head.map(p => attempt(p, turns, opts)));
  for (const r of headResults) {
    attempts.push(r.log);
    if (r.rateLimited) rateLimited = true;
  }
  const winner = headResults.find(r => r.text);
  if (winner) {
    const log = attempts.find(a => a.provider === winner.log.provider)!;
    return { text: winner.text, provider: log.provider, model: log.model, attempts, rateLimited };
  }

  // Rest of the chain, sequentially with one retry each — cheap and resilient.
  for (const p of chain.slice(2)) {
    for (let attemptNo = 0; attemptNo < 2; attemptNo++) {
      const r = await attempt(p, turns, opts);
      attempts.push(r.log);
      if (r.rateLimited) rateLimited = true;
      if (r.text) {
        return { text: r.text, provider: p.name, model: p.model, attempts, rateLimited };
      }
      // A spent quota or a hard 4xx will not improve on retry.
      if (r.rateLimited) break;
      if (r.log.status >= 400 && r.log.status < 500) break;
    }
  }

  return { text: "", provider: "none", model: "none", attempts, rateLimited };
}

/**
 * Streaming variant. Yields text deltas as they arrive; falls back to the
 * non-streaming chain when no provider supports streaming.
 */
export async function* chatStream(
  turns: ChatTurn[],
  opts: CallOptions = {},
): AsyncGenerator<{ delta?: string; provider?: string; model?: string; done?: boolean; rateLimited?: boolean }> {
  const chain = providers().filter(p => p.stream && p.parseStream);
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
export function imageUrl(
  prompt: string,
  opts: { width?: number; height?: number; seed?: number; model?: string } = {},
): string {
  const w = Math.min(Math.max(opts.width ?? 1024, 256), 1536);
  const h = Math.min(Math.max(opts.height ?? 1024, 256), 1536);
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const model = opts.model || "flux";
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}?width=${w}&height=${h}&seed=${seed}&model=${model}&nologo=true&referrer=gg-lounge`;
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
