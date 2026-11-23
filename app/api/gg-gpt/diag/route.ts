/**
 * GG-GPT provider diagnostics.
 *
 * Free AI endpoints come and go, and which ones answer depends on the network
 * the deployment sits on — not on anything we can test locally. This route asks
 * every candidate the same trivial question and reports what actually came
 * back, so the model chain is tuned against reality instead of guesses.
 *
 * It is admin-gated: it reveals infrastructure detail and it fans out to
 * third parties on demand, so it must not be a public endpoint.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ASK = [
  { role: "system", content: "Reply with exactly the word: pong" },
  { role: "user", content: "ping" },
];

type Probe = {
  name: string;
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};

function probes(): Probe[] {
  const json = { "content-type": "application/json" };
  const out: Probe[] = [];

  // Pollinations — OpenAI-compatible, several model aliases.
  for (const model of ["openai", "openai-fast", "mistral", "qwen-coder", "deepseek", "gemini", "llama"]) {
    out.push({
      name: `pollinations:${model}`,
      url: "https://text.pollinations.ai/openai",
      method: "POST",
      headers: json,
      body: JSON.stringify({ model, messages: ASK, stream: false, referrer: "gg-lounge" }),
    });
  }
  // Pollinations plain GET.
  out.push({
    name: "pollinations-get",
    url: `https://text.pollinations.ai/${encodeURIComponent("Reply with exactly the word: pong")}?referrer=gg-lounge`,
    method: "GET",
    headers: {},
  });

  // Hack Club.
  out.push({
    name: "hackclub",
    url: "https://ai.hackclub.com/chat/completions",
    method: "POST",
    headers: json,
    body: JSON.stringify({ messages: ASK, max_tokens: 32 }),
  });

  // Keyed providers, probed only when configured.
  const or = process.env.GG_GPT_KEY || process.env.OPENROUTER_API_KEY;
  if (or) {
    out.push({
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      method: "POST",
      headers: { ...json, authorization: `Bearer ${or}`, "HTTP-Referer": "https://gg-lounge.vercel.app", "X-Title": "GG-GPT" },
      body: JSON.stringify({ model: process.env.GG_GPT_MODEL || "meta-llama/llama-3.3-70b-instruct:free", messages: ASK, max_tokens: 32 }),
    });
  }
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    out.push({
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      method: "POST",
      headers: { ...json, authorization: `Bearer ${groq}` },
      body: JSON.stringify({ model: process.env.GG_GPT_MODEL || "llama-3.3-70b-versatile", messages: ASK, max_tokens: 32 }),
    });
  }

  // Non-LLM capabilities, so one call tells us what the assistant can really do.
  out.push({
    name: "search:duckduckgo",
    url: "https://html.duckduckgo.com/html/?q=hello",
    method: "GET",
    headers: { "user-agent": "Mozilla/5.0 (compatible; GG-GPT/1.0)" },
  });
  out.push({
    name: "search:bing-rss",
    url: "https://www.bing.com/search?format=rss&q=hello",
    method: "GET",
    headers: { "user-agent": "Mozilla/5.0 (compatible; GG-GPT/1.0)" },
  });
  out.push({
    name: "search:wikipedia",
    url: "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=hello",
    method: "GET",
    headers: {},
  });
  out.push({ name: "image:pollinations", url: "https://image.pollinations.ai/prompt/a%20red%20cube?width=256&height=256&nologo=true", method: "GET", headers: {} });
  out.push({ name: "video:pollinations", url: "https://video.pollinations.ai/prompt/a%20red%20cube", method: "GET", headers: {} });
  out.push({ name: "weather:open-meteo", url: "https://api.open-meteo.com/v1/forecast?latitude=-34.93&longitude=138.6&current=temperature_2m", method: "GET", headers: {} });
  out.push({ name: "crypto:coingecko", url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", method: "GET", headers: {} });
  out.push({ name: "fx:open.er-api", url: "https://open.er-api.com/v6/latest/USD", method: "GET", headers: {} });
  out.push({ name: "dict:dictionaryapi", url: "https://api.dictionaryapi.dev/api/v2/entries/en/hello", method: "GET", headers: {} });
  out.push({ name: "geo:ipapi", url: "https://ipapi.co/json/", method: "GET", headers: {} });
  return out;
}

type ProbeResult = { ok: boolean; status: number; ms: number; preview?: string; error?: string };

async function probeOne(p: Probe): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(p.url, {
      method: p.method,
      headers: p.headers,
      body: p.body,
      signal: AbortSignal.timeout(20000),
    });
    const ms = Date.now() - started;
    const ct = res.headers.get("content-type") || "";
    let preview = "";
    if (ct.includes("json")) {
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        preview = String(j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.text ?? text).slice(0, 160);
      } catch {
        preview = text.slice(0, 160);
      }
    } else if (ct.startsWith("image/") || ct.startsWith("video/")) {
      preview = `<${ct} ${res.headers.get("content-length") || "?"} bytes>`;
    } else {
      preview = (await res.text()).replace(/\s+/g, " ").slice(0, 160);
    }
    return { ok: res.ok, status: res.status, ms, preview };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, error: e instanceof Error ? e.message.slice(0, 120) : "failed" };
  }
}

export async function GET(req: Request) {
  // The admin console already sets the HMAC cookie; reuse it rather than
  // inventing a second gate that could drift out of sync. A dedicated token is
  // also accepted so the endpoint can be checked from outside a browser.
  const token = new URL(req.url).searchParams.get("token") || req.headers.get("x-diag-token") || "";
  const expected = process.env.GG_DIAG_TOKEN || "";
  const tokenOk = expected.length > 8 && token === expected;
  if (!tokenOk && !(await isAdmin())) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const list = probes();
  const results: Array<{ name: string } & ProbeResult> = await Promise.all(
    list.map(async p => ({ name: p.name, ...(await probeOne(p)) })),
  );
  const working = results.filter(r => r.ok).map(r => r.name);
  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      working,
      failed: results.filter(r => !r.ok).map(r => r.name),
      results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
