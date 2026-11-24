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
import { chatComplete, imageUrl, sanitizeAnswer } from "@/lib/gg-gpt/engine";
import { getWeather, webSearch, renderHits, lookupTopic, type ToolResult } from "@/lib/gg-gpt/tools";
import { recommend, renderRecommendation } from "@/lib/gg-gpt/recommend";
import { games } from "@/lib/games";
import { detectIntent, type Intent } from "@/lib/gg-gpt/intent";
import {
  detectFeature, tasteCard, backlogTriage, compareGames, sessionPlanner, progressReport,
  discoveryChallenge, genreExplainer, controlsHelp, catalogueQuiz,
  type CatalogueGame,
} from "@/lib/gg-gpt/features";
import { getGameControls } from "@/lib/game-controls";
import { answerClock } from "@/lib/gg-gpt/clock";
import { buildSystemPrompt } from "@/lib/gg-gpt/persona";

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
  method: "GET" | "POST" | "HEAD";
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

  // Unknowns from the first run: the model list, GET streaming support, and
  // definition APIs that are not behind Cloudflare.
  out.push({ name: "pollinations:models", url: "https://text.pollinations.ai/models", method: "GET", headers: {} });
  out.push({
    name: "pollinations:get-stream",
    url: `https://text.pollinations.ai/${encodeURIComponent("Count to three")}?stream=true&referrer=gg-lounge`,
    method: "GET",
    headers: { accept: "text/event-stream" },
  });
  out.push({ name: "dict:wiktionary", url: "https://en.wiktionary.org/api/rest_v1/page/definition/hello", method: "GET", headers: { accept: "application/json" } });
  out.push({ name: "search:wikipedia-ua", url: "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=hello", method: "GET", headers: { "user-agent": "GG-GPT/1.0 (https://gg-lounge.vercel.app)" } });


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

  // Video: is there any keyless host that actually answers? Measured here so
  // the answer is a fact rather than a hope.
  out.push({ name: "video:pollinations-image", url: imageUrl("a red cube", { width: 256, height: 256 }), method: "HEAD", headers: {} });
  out.push({ name: "video:gpt4free-video", url: "https://api.airforce/v1/video/generations", method: "HEAD", headers: {} });
  out.push({ name: "news:google", url: "https://news.google.com/rss/search?q=ISRO&hl=en-US&gl=US&ceid=US:en", method: "GET", headers: { "user-agent": "GG-GPT/1.0 (https://gg-lounge.vercel.app)" } });
  out.push({ name: "news:bing", url: "https://www.bing.com/news/search?format=rss&q=ISRO", method: "GET", headers: { "user-agent": "GG-GPT/1.0 (https://gg-lounge.vercel.app)" } });
  out.push({ name: "weather:wttr", url: "https://wttr.in/Adelaide?format=j1", method: "GET", headers: { "user-agent": "curl/8 (GG-GPT)" } });
  out.push({ name: "weather:open-meteo", url: "https://api.open-meteo.com/v1/forecast?latitude=-34.93&longitude=138.6&current=temperature_2m", method: "GET", headers: {} });
  out.push({ name: "crypto:coingecko", url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", method: "GET", headers: {} });
  out.push({ name: "fx:open.er-api", url: "https://open.er-api.com/v6/latest/USD", method: "GET", headers: {} });
  out.push({ name: "dict:dictionaryapi", url: "https://api.dictionaryapi.dev/api/v2/entries/en/hello", method: "GET", headers: {} });
  out.push({ name: "geo:ipapi", url: "https://ipapi.co/json/", method: "GET", headers: {} });

  // One probe per name; duplicates would report contradictory results.
  const seen = new Set<string>();
  return out.filter(p => (seen.has(p.name) ? false : (seen.add(p.name), true)));
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

/**
 * End-to-end self test: run a real question through the same engine the
 * assistant uses, so "does it work" is answerable from outside a browser. The
 * chat route is POST-only, which makes it awkward to verify from a terminal.
 */
async function selfTest(question = "In one sentence, what is a quokka?"): Promise<Record<string, unknown>> {
  const started = Date.now();

  // The ten site-data features answer without a model. Check them first: if the
  // question is one of them, running it through the model would both waste the
  // shared quota and test something production never does.
  const feature = detectFeature(question);
  if (feature) {
    const games: CatalogueGame[] = gameCatalogue();
    const state = { playCounts: {}, favorites: [], recentlyPlayed: [] as string[] };
    const now = Date.now();
    let text = "";
    switch (feature.feature) {
      case "taste-card": text = tasteCard(state, games).text; break;
      case "backlog-triage": text = backlogTriage(state, games, Number(feature.args.minutes ?? 30)).text; break;
      case "compare": text = compareGames(String(feature.args.a), String(feature.args.b), games, state).text; break;
      case "session-planner": text = sessionPlanner(Number(feature.args.minutes ?? 30), games).text; break;
      case "progress-report": text = progressReport(state, games).text; break;
      case "discovery-challenge": text = discoveryChallenge(state, games).text; break;
      case "genre-explainer": text = genreExplainer(String(feature.args.genre), games, state).text; break;
      case "catalogue-quiz": text = catalogueQuiz(games).text; break;
      case "controls-help": {
        const q = String(feature.args.game).toLowerCase();
        const g = games.find(x => x.id === q) ?? games.find(x => x.title.toLowerCase().includes(q));
        text = g ? controlsHelp(g, { description: getGameControls(g.id, g.genre) }).text : "no such game";
        break;
      }
      case "achievement-coach": text = "needs a signed-in account; the guest path is checked in tests"; break;
    }
    return {
      question,
      feature: feature.feature,
      provider: `feature:${feature.feature}`,
      rateLimited: false,
      ms: Date.now() - now,
      chars: text.length,
      answer: text.slice(0, 400),
      attempts: [],
    };
  }

  const intent = detectIntent(question);

  // Run the same tools the route would, so the test exercises the whole
  // pipeline rather than just the model. Without this, a weather question
  // reaches the model with no data and the model invents "typically mild".
  const tools = await gatherTools(intent, question);
  const notes = tools.map(t => `[${t.source}] ${t.text}`);

  /**
   * The same rule the chat route uses: if the tools already produced the whole
   * answer, do not hand it to a model. Asking a model to repeat a list of
   * games is how it invents "Zen Garden Escape", a game we do not have.
   */
  const solid = tools.filter(t => !t.source.startsWith("search:") && t.source !== "wikipedia");
  const toolOnly = solid.length === tools.length && tools.length > 0 ? tools.map(t => t.text).join("\n\n") : null;

  const result = toolOnly
    ? { text: toolOnly, provider: "tools", rateLimited: false, attempts: [] as Array<{ provider: string; status: number; ms: number; error?: string }>, model: "none" }
    : await chatComplete(
        [
          { role: "system", content: buildSystemPrompt({ profile: {}, memories: [], now: new Date(), notes }) },
          { role: "user", content: question },
        ],
        { timeoutMs: 30_000 },
      );
  return {
    question,
    intent: Object.keys(intent).filter(k => intent[k as keyof typeof intent]),
    tools: tools.map(t => ({ source: t.source, text: t.text.slice(0, 300) })),
    provider: result.provider,
    rateLimited: result.rateLimited,
    ms: Date.now() - started,
    chars: sanitizeAnswer(result.text).length,
    answer: sanitizeAnswer(result.text).slice(0, 400),
    attempts: result.attempts.map(a => ({ provider: a.provider, status: a.status, ms: a.ms, error: a.error })),
    imageSample: imageUrl("a red cube", { width: 256, height: 256 }),
  };
}

/** The catalogue in the shape the feature module wants. */
function gameCatalogue(): CatalogueGame[] {
  return games.map(g => ({
    id: g.id, title: g.title, genre: g.genre, tone: g.tone, description: g.description, proxy: g.proxy,
  }));
}

/** The tools a question needs, run exactly as the chat route runs them. */
async function gatherTools(intent: Intent, question: string): Promise<ToolResult[]> {
  const tools: ToolResult[] = [];
  if (intent.weather) {
    const w = await getWeather(intent.weather.place).catch(() => null);
    if (w) tools.push(w);
  }
  // Arithmetic and clock answers are computed, not generated. Trying a model
  // first would burn a unit of the shared free quota to get a worse answer.
  if (intent.math) {
    tools.push({ source: "arithmetic", text: `**${intent.math.expression}** = **${intent.math.pretty}**`, data: intent.math });
  }
  if (intent.clock) {
    const clock = answerClock(question);
    if (clock) tools.push({ source: clock.source, text: clock.text, data: clock.data });
  }
  if (intent.topic) {
    const t = await lookupTopic(intent.topic.term).catch(() => null);
    if (t) tools.push(t);
  }
  if (intent.catalogue) {
    const cat = gameCatalogue();
    const rec = recommend(intent.catalogue.query, cat, null);
    tools.push({ text: renderRecommendation(rec), data: rec.picks, source: "catalogue" });
  }
  if (intent.search) {
    const s = await webSearch(intent.search.query).catch(() => ({ hits: [], source: "none" }));
    if (s.hits.length) tools.push({ text: renderHits(s.hits), data: s.hits, source: `search:${s.source}` });
  }
  return tools;
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
  const wantsTest = new URL(req.url).searchParams.has("selftest");
  if (wantsTest) {
    const q = new URL(req.url).searchParams.get("selftest") || undefined;
    const t = await selfTest(q && q.length > 3 ? q : undefined);
    return NextResponse.json(t, { headers: { "Cache-Control": "no-store, max-age=0" } });
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
    { headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store" } },
  );
}
