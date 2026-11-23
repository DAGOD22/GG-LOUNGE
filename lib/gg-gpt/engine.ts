/**
 * GG-GPT model access.
 *
 * Design constraint from the brief: **no API key required, close to unlimited**.
 * There is no way to run a frontier model for free forever, so this is built as
 * a chain of free-tier endpoints. The chain is tried in order and the first one
 * that answers wins, which means one provider being busy or rate-limited never
 * takes the assistant down.
 *
 * If the operator *does* want guaranteed quality they can set any of
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

const DEFAULT_MODELS: Record<string, string> = {
  pollinations: "openai",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  groq: "llama-3.3-70b-versatile",
  hackclub: "qwen/qwen3-32b",
  workers: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  hf: "meta-llama/Llama-3.1-8B-Instruct",
};

/** Providers that need no account at all. */
function keylessProviders(temperature: number, maxTokens: number) {
  return [
    {
      name: "pollinations",
      url: "https://text.pollinations.ai/openai",
      headers: { "content-type": "application/json" } as Record<string, string>,
      body: (turns: ChatTurn[], model: string) =>
        JSON.stringify({ model, messages: turns, stream: false, temperature, max_tokens: maxTokens, referrer: "gg-lounge" }),
      parse: (j: Record<string, any>) =>
        j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.text ?? "",
    },
    {
      // Hack Club's free public AI endpoint — no account, no key.
      name: "hackclub",
      url: "https://ai.hackclub.com/chat/completions",
      headers: { "content-type": "application/json" } as Record<string, string>,
      body: (turns: ChatTurn[], model: string) =>
        JSON.stringify({ model, messages: turns, max_tokens: maxTokens, temperature }),
      parse: (j: Record<string, any>) => j?.choices?.[0]?.message?.content ?? "",
    },
    {
      // Pollinations' plain GET endpoint. No JSON body, no auth, no quota page.
      name: "pollinations-get",
      url: "https://text.pollinations.ai/",
      headers: {} as Record<string, string>,
      body: (turns: ChatTurn[], model: string) =>
        JSON.stringify({ model, messages: turns, referrer: "gg-lounge" }),
      // GET variant is handled separately in callProvider.
      parse: (j: any) => (typeof j === "string" ? j : j?.choices?.[0]?.message?.content ?? ""),
      get: (turns: ChatTurn[], model: string) => {
        const prompt = turns
          .map(t => (t.role === "system" ? `[instructions] ${t.content}` : t.role === "user" ? t.content : `[you] ${t.content}`))
          .join("\n\n");
        return `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&referrer=gg-lounge`;
      },
    },
  ];
}

/** Providers that only run when the operator supplied a key. */
function keyedProviders() {
  const out: Array<{
    name: string;
    url: string;
    headers: Record<string, string>;
    model: string;
    body: (t: ChatTurn[], m: string) => string;
    parse: (j: Record<string, any>) => string;
  }> = [];

  const openrouter = process.env.GG_GPT_KEY || process.env.OPENROUTER_API_KEY;
  if (openrouter) {
    out.push({
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openrouter}`,
        "HTTP-Referer": "https://gg-lounge.vercel.app",
        "X-Title": "GG-GPT",
      },
      model: process.env.GG_GPT_MODEL || DEFAULT_MODELS.openrouter,
      body: (turns, model) => JSON.stringify({ model, messages: turns, max_tokens: 2048 }),
      parse: j => j?.choices?.[0]?.message?.content ?? "",
    });
  }
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    out.push({
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      headers: { "content-type": "application/json", authorization: `Bearer ${groq}` },
      model: process.env.GG_GPT_MODEL || DEFAULT_MODELS.groq,
      body: (turns, model) => JSON.stringify({ model, messages: turns, max_tokens: 2048 }),
      parse: j => j?.choices?.[0]?.message?.content ?? "",
    });
  }
  const hf = process.env.HUGGINGFACE_API_KEY;
  if (hf) {
    out.push({
      name: "huggingface",
      url: "https://router.huggingface.co/v1/chat/completions",
      headers: { "content-type": "application/json", authorization: `Bearer ${hf}` },
      model: process.env.GG_GPT_MODEL || DEFAULT_MODELS.hf,
      body: (turns, model) => JSON.stringify({ model, messages: turns, max_tokens: 1024 }),
      parse: j => j?.choices?.[0]?.message?.content ?? "",
    });
  }
  return out;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Ask the model chain. Returns the first non-empty answer, or null when every
 * provider failed so the caller can fall back to the offline responder.
 */
export async function chatComplete(
  turns: ChatTurn[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<ChatResult | null> {
  const maxTokens = opts.maxTokens ?? 2048;
  const temperature = opts.temperature ?? 0.7;
  const keyed = keyedProviders();
  const keyless = keylessProviders(temperature, maxTokens);

  for (const p of keyed) {
    try {
      const res = await withTimeout(
        fetch(p.url, { method: "POST", headers: p.headers, body: p.body(turns, p.model) }),
        45000,
      );
      if (!res.ok) continue;
      const json = await res.json();
      const text = String(p.parse(json) || "").trim();
      if (text) return { text, provider: p.name, model: p.model };
    } catch {
      // try the next provider
    }
  }

  for (const p of keyless) {
    try {
      let res: Response;
      if ("get" in p && typeof p.get === "function") {
        // The GET endpoint takes the prompt in the path; keep it short enough
        // for a URL and fall back to POST when the conversation is long.
        const url = p.get(turns, DEFAULT_MODELS.pollinations);
        if (url.length > 7000) continue;
        res = await withTimeout(fetch(url, { headers: { accept: "text/plain" } }), 45000);
      } else {
        const body = p.body(turns, DEFAULT_MODELS.pollinations);
        res = await withTimeout(fetch(p.url, { method: "POST", headers: p.headers, body }), 45000);
      }
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "";
      const payload = ct.includes("json") ? await res.json() : await res.text();
      const text = String(p.parse(payload as never) || "").trim();
      if (text && !/^\s*\{?\s*"?error/i.test(text)) return { text, provider: p.name, model: DEFAULT_MODELS.pollinations };
    } catch {
      // try the next provider
    }
  }

  return null;
}

/**
 * Image generation. Pollinations renders images from a URL-encoded prompt with
 * no key and no sign-up, which is what makes this work at all on a free tier.
 */
export function imageUrl(prompt: string, opts: { width?: number; height?: number; seed?: number; model?: string } = {}): string {
  const w = Math.min(Math.max(opts.width ?? 1024, 256), 1536);
  const h = Math.min(Math.max(opts.height ?? 1024, 256), 1536);
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const model = opts.model || "flux";
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}?width=${w}&height=${h}&seed=${seed}&model=${model}&nologo=true&referrer=gg-lounge`;
}

/** Pollinations' hosted video endpoint (visionary model, no API key). */
export function videoUrl(prompt: string, opts: { seed?: number; model?: string } = {}): string {
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const model = opts.model || "veo-3-fast";
  return `https://video.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 700))}?model=${model}&seed=${seed}&referrer=gg-lounge`;
}
