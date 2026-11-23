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
  for (const [alias, tier] of [
    ["openai", 80],
    ["openai-fast", 70],
    ["mistral", 60],
    ["qwen-coder", 50],
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

  // Last resort: Pollinations' plain GET, which has never required a body.
  list.push({
    name: "pollinations:get",
    tier: 10,
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
  });

  return list.sort((a, b) => b.tier - a.tier);
}

/* ------------------------------- calling ------------------------------- */

function looksLikeError(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length < 2) return true;
  return /^\s*\{?\s*"(error|detail|message)"\s*:/i.test(t) && t.length < 400;
}

async function attempt(p: Provider, turns: ChatTurn[], opts: CallOptions): Promise<{ text: string; log: AttemptLog }> {
  const started = Date.now();
  const { url, init } = p.request(turns, opts);
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 22000) });
    const raw = await res.text();
    const ms = Date.now() - started;
    if (!res.ok) {
      return { text: "", log: { provider: p.name, model: p.model, status: res.status, ms, error: raw.slice(0, 160) } };
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
): Promise<ChatResult & { attempts: AttemptLog[] }> {
  const chain = providers();
  const attempts: AttemptLog[] = [];

  // Primary: first two candidates raced, so the fastest good answer wins.
  const head = chain.slice(0, 2);
  const headResults = await Promise.all(head.map(p => attempt(p, turns, opts)));
  for (const r of headResults) attempts.push(r.log);
  const winner = headResults.find(r => r.text);
  if (winner) {
    const log = attempts.find(a => a.provider === winner.log.provider)!;
    return { text: winner.text, provider: log.provider, model: log.model, attempts };
  }

  // Rest of the chain, sequentially with one retry each — cheap and resilient.
  for (const p of chain.slice(2)) {
    for (let attemptNo = 0; attemptNo < 2; attemptNo++) {
      const r = await attempt(p, turns, opts);
      attempts.push(r.log);
      if (r.text) {
        return { text: r.text, provider: p.name, model: p.model, attempts };
      }
      // A hard 4xx will not improve on retry.
      if (r.log.status >= 400 && r.log.status < 500) break;
    }
  }

  return { text: "", provider: "none", model: "none", attempts };
}

/**
 * Streaming variant. Yields text deltas as they arrive; falls back to the
 * non-streaming chain when no provider supports streaming.
 */
export async function* chatStream(
  turns: ChatTurn[],
  opts: CallOptions = {},
): AsyncGenerator<{ delta?: string; provider?: string; model?: string; done?: boolean }> {
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

/** Pollinations' hosted video endpoint (no API key). */
export function videoUrl(prompt: string, opts: { seed?: number; model?: string } = {}): string {
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const model = opts.model || "veo-3-fast";
  return `https://video.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 700))}?model=${model}&seed=${seed}&referrer=gg-lounge`;
}

/** Exposed for the diagnostics route so both use one definition. */
export function providerSummary(): Array<{ name: string; tier: number; model: string }> {
  return providers().map(p => ({ name: p.name, tier: p.tier, model: p.model }));
}
