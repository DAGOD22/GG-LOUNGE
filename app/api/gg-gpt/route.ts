import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/db";
import { getUserState } from "@/lib/db/saves-auth";
import {
  listChats,
  createChat,
  listMessages,
  addMessage,
  touchChat,
  renameChat,
  deleteChat,
  listMemories,
  addMemory,
  forgetMemory,
} from "@/lib/db/gg-gpt";
import { chatComplete, chatStream, imageUrl, videoUrl, type ChatTurn } from "@/lib/gg-gpt/engine";
import {
  webSearch,
  renderHits,
  getWeather,
  convertCurrency,
  convertUnit,
  cryptoPrice,
  defineWord,
  searchCatalogue,
  type CatalogueEntry,
  type ToolResult,
} from "@/lib/gg-gpt/tools";
import { detectIntent, titleFromMessage } from "@/lib/gg-gpt/intent";
import { buildSystemPrompt, extractFacts, type GgProfile } from "@/lib/gg-gpt/persona";
import { games } from "@/lib/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Generous but finite: keeps a runaway tab from burning the free tier. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const rate = new Map<string, { count: number; reset: number }>();

function allow(key: string): boolean {
  const now = Date.now();
  const e = rate.get(key);
  if (!e || now > e.reset) {
    rate.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    if (rate.size > 5000) for (const [k, v] of rate) if (now > v.reset) rate.delete(k);
    return true;
  }
  if (e.count >= RATE_MAX) return false;
  e.count++;
  return true;
}

function token(req: Request): string {
  const cookie = req.headers.get("cookie") || "";
  return cookie.split(";").find(s => s.trim().startsWith("ggl_token="))?.split("=")[1]?.trim() || "";
}

async function whoami(req: Request) {
  const t = token(req);
  let user = null;
  try {
    user = t ? await getUserFromToken(t) : null;
  } catch {
    user = null;
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "0.0.0.0";
  return { user, ip, key: user ? `u:${user.id}` : `ip:${ip}` };
}

async function profileFor(userId: string | null, username?: string | null): Promise<GgProfile> {
  const profile: GgProfile = { username: username ?? null };
  if (!userId) return profile;
  try {
    const state = (await getUserState(userId)) as unknown as Record<string, unknown> | null;
    if (!state) return profile;
    const favs = state.favorites ?? state.favoriteGames ?? state.favouriteGames;
    if (Array.isArray(favs)) profile.favoriteIds = favs.slice(0, 12).map(String);
    const plays = state.playCounts ?? state.playcounts ?? state.stats;
    if (plays && typeof plays === "object") {
      profile.topGames = Object.entries(plays as Record<string, unknown>)
        .filter(([, v]) => typeof v === "number")
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 8)
        .map(([k]) => k);
    }
    for (const key of ["createdAt", "created_at", "joinedAt", "memberSince"]) {
      const v = state[key];
      if (typeof v === "string") { profile.memberSince = v; break; }
    }
    if (typeof state.theme === "string") profile.theme = state.theme;
  } catch {
    // personalisation is best-effort
  }
  return profile;
}

/** The catalogue, in the shape the search tool wants. */
const CATALOGUE: CatalogueEntry[] = games.map(g => ({
  id: g.id,
  title: g.title,
  genre: g.genre,
  tone: g.tone,
  description: g.description,
}));

/* ------------------------------ GET: state ------------------------------ */
export async function GET(req: Request) {
  const { user } = await whoami(req);
  if (!user) return NextResponse.json({ signedIn: false, chats: [], memories: [] });
  const [chats, memories] = await Promise.all([listChats(user.id), listMemories(user.id)]);
  return NextResponse.json({ signedIn: true, username: user.username, chats, memories });
}

/* ------------------------------ POST: talk ------------------------------ */
export async function POST(req: Request) {
  const { user, key } = await whoami(req);
  if (!allow(key)) {
    return NextResponse.json({ error: "Slow down for a second — GG-GPT is still catching up." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    message?: string;
    chatId?: string;
    title?: string;
    memoryId?: string;
    fact?: string;
    /** Force a tool on or off for one turn. */
    tool?: string;
    stream?: boolean;
  };
  const action = body.action || "chat";

  /* ---------- memory management ---------- */
  if (action === "memory") {
    if (!user) return NextResponse.json({ error: "Sign in to save memories." }, { status: 401 });
    if (body.memoryId) {
      await forgetMemory(user.id, body.memoryId);
      return NextResponse.json({ ok: true, memories: await listMemories(user.id) });
    }
    if (body.fact) {
      await addMemory(user.id, body.fact, "manual");
      return NextResponse.json({ ok: true, memories: await listMemories(user.id) });
    }
    return NextResponse.json({ memories: await listMemories(user.id) });
  }

  /* ---------- chat management ---------- */
  if (action === "delete") {
    if (!user || !body.chatId) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
    await deleteChat(user.id, body.chatId);
    return NextResponse.json({ ok: true, chats: await listChats(user.id) });
  }
  if (action === "rename") {
    if (!user || !body.chatId) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
    await renameChat(user.id, body.chatId, body.title || "New chat");
    return NextResponse.json({ ok: true, chats: await listChats(user.id) });
  }
  if (action === "messages") {
    if (!user || !body.chatId) return NextResponse.json({ messages: [] });
    return NextResponse.json({ messages: await listMessages(user.id, body.chatId) });
  }

  /* ---------- the conversation ---------- */
  const message = (body.message || "").trim().slice(0, 8000);
  if (!message) return NextResponse.json({ error: "Say something first." }, { status: 400 });

  let chatId = body.chatId || "";
  if (user) {
    if (!chatId) {
      const chat = await createChat(user.id, titleFromMessage(message));
      chatId = chat.id;
    }
    await addMessage(user.id, chatId, "user", message);
  }

  const profile = await profileFor(user?.id ?? null, user?.username ?? null);
  const memories = user ? await listMemories(user.id) : [];

  // Last 20 turns, so follow-ups actually have context.
  const history: ChatTurn[] = [];
  if (user && chatId) {
    const prior = await listMessages(user.id, chatId, 200);
    for (const m of prior.slice(-21, -1)) {
      if (m.role === "user" || m.role === "assistant") {
        history.push({ role: m.role, content: m.content.slice(0, 4000) });
      }
    }
  }

  const intent = detectIntent(message);

  /* ---------- media ---------- */
  if (intent.image || intent.video) {
    const isImage = !!intent.image;
    const prompt = (intent.image?.prompt ?? intent.video?.prompt ?? "").slice(0, 600);
    const url = isImage
      ? imageUrl(prompt, { width: intent.image?.width, height: intent.image?.height })
      : videoUrl(prompt);
    const caption = isImage
      ? `Here's an image of **${prompt}**.`
      : `Here's a short clip of **${prompt}**. Give it a few seconds to render.`;
    const media = { kind: isImage ? "image" : "video", url, prompt };
    if (user && chatId) {
      await addMessage(user.id, chatId, "assistant", caption, media);
      await touchChat(user.id, chatId);
    }
    return NextResponse.json({ text: caption, media, chatId, provider: "pollinations-media", signedIn: !!user });
  }

  /* ---------- tools ---------- */
  const toolResults: ToolResult[] = [];
  const cards: Array<Record<string, unknown>> = [];

  const run = async <T extends ToolResult | null>(p: Promise<T>, label: string) => {
    try {
      const r = await p;
      if (r) {
        toolResults.push(r);
        cards.push({ label, source: r.source, data: r.data });
      }
    } catch {
      // a failed tool must never break the answer
    }
  };

  await Promise.all([
    intent.search ? run(webSearch(intent.search.query).then(w => (w.hits.length ? { text: renderHits(w.hits), data: { hits: w.hits, source: w.source }, source: `search:${w.source}` } : null)), "web search") : null,
    intent.weather ? run(getWeather(intent.weather.place), "weather") : null,
    intent.currency ? run(convertCurrency(intent.currency.amount, intent.currency.from, intent.currency.to), "currency") : null,
    intent.crypto ? run(cryptoPrice(intent.crypto.ids), "crypto") : null,
    intent.define ? run(defineWord(intent.define.word), "dictionary") : null,
  ].filter(Boolean) as Array<Promise<void>>);

  if (intent.unit) {
    const r = convertUnit(intent.unit.amount, intent.unit.from, intent.unit.to);
    if (r) { toolResults.push(r); cards.push({ label: "conversion", source: r.source, data: r.data }); }
  }

  if (intent.catalogue) {
    const found = searchCatalogue(CATALOGUE, intent.catalogue.query, 6);
    if (found.length) {
      const text = `Games on GG-LOUNGE matching that:\n${found.map(g => `- ${g.title} (${g.genre}) — /g/${g.id}`).join("\n")}`;
      toolResults.push({ text, data: { games: found }, source: "catalogue" });
      cards.push({ label: "games", source: "catalogue", data: { games: found } });
    }
  }

  /* ---------- answer ---------- */
  const notes = toolResults.map(r => `[${r.source}] ${r.text}`);
  const system = buildSystemPrompt({ profile, memories, now: new Date(), notes });
  const turns: ChatTurn[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: message },
  ];

  // Stream when the client asks for it; otherwise answer in one shot.
  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let full = "";
        let provider = "none";
        try {
          for await (const event of chatStream(turns)) {
            if (event.delta) {
              full += event.delta;
              provider = event.provider || provider;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: event.delta })}\n\n`));
            }
            if (event.done) break;
          }
        } catch {
          // fall through with whatever text we have
        }
        if (!full.trim()) {
          full = offlineAnswer(message, profile);
          provider = "offline";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: full })}\n\n`));
        }
        if (user) {
          for (const fact of extractFacts(message)) await addMemory(user.id, fact, "chat").catch(() => undefined);
          if (chatId) {
            await addMessage(user.id, chatId, "assistant", full, { cards, provider }).catch(() => undefined);
            await touchChat(user.id, chatId).catch(() => undefined);
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, chatId, provider, cards })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }

  const result = await chatComplete(turns);
  let text = result.text;
  let provider = result.provider;
  if (!text) {
    text = offlineAnswer(message, profile);
    provider = "offline";
  }

  if (user) {
    for (const fact of extractFacts(message)) await addMemory(user.id, fact, "chat").catch(() => undefined);
    if (chatId) {
      await addMessage(user.id, chatId, "assistant", text, { cards, provider });
      await touchChat(user.id, chatId);
    }
  }

  return NextResponse.json({ text, chatId, provider, signedIn: !!user, cards, attempts: result.attempts });
}

/**
 * Last-resort responder: never a dead end, honest about being offline, and
 * still able to name real games from the catalogue.
 */
function offlineAnswer(message: string, profile: GgProfile): string {
  const lines = [
    "**Every free model endpoint is busy or unreachable right now.** Your message is saved — try again in a moment.",
  ];
  const found = searchCatalogue(CATALOGUE, message, 4);
  if (found.length) {
    lines.push("", "While you wait, these are on the site:", ...found.map(g => `- **${g.title}** — ${g.genre}, /g/${g.id}`));
  }
  if (profile.favoriteIds?.length) {
    lines.push("", `You already have ${profile.favoriteIds.length} games favourited.`);
  }
  return lines.join("\n");
}
