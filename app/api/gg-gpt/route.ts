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
import { chatComplete, imageUrl, videoUrl, type ChatTurn } from "@/lib/gg-gpt/engine";
import { webSearch, renderHits } from "@/lib/gg-gpt/tools";
import {
  buildSystemPrompt,
  extractFacts,
  titleFromMessage,
  needsSearch,
  mediaIntent,
  type GgProfile,
} from "@/lib/gg-gpt/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Generous but finite: keeps a runaway tab from burning the free tier. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 24;
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
  const user = t ? await getUserFromToken(t).catch(() => null) : null;
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
    if (state) {
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
      if (typeof state.theme === "string") profile.theme = state.theme;
    }
  } catch {
    // personalisation is best-effort
  }
  return profile;
}

/* ------------------------------ GET: state ------------------------------ */
export async function GET(req: Request) {
  const { user } = await whoami(req);
  if (!user) return NextResponse.json({ signedIn: false, chats: [], memories: [] });
  const [chats, memories] = await Promise.all([listChats(user.id), listMemories(user.id)]);
  return NextResponse.json({
    signedIn: true,
    username: user.username,
    chats,
    memories,
  });
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
  };
  const action = body.action || "chat";

  /* ---------- memory management (needs an account) ---------- */
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

  /* ---------- chat list management ---------- */
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

  /* ---------- the actual conversation ---------- */
  const message = (body.message || "").trim().slice(0, 8000);
  if (!message) return NextResponse.json({ error: "Say something first." }, { status: 400 });

  // Signed-out visitors still get a working assistant; the transcript just
  // lives in the browser instead of the account.
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

  // History for context: the last 20 turns of this chat.
  const history: ChatTurn[] = [];
  if (user && chatId) {
    const prior = await listMessages(user.id, chatId, 200);
    for (const m of prior.slice(-21, -1)) {
      if (m.role === "user" || m.role === "assistant") {
        history.push({ role: m.role, content: m.content.slice(0, 4000) });
      }
    }
  }

  const extras: Record<string, unknown> = {};

  // ---- image / video generation ----
  const media = mediaIntent(message);
  if (media) {
    const url = media.kind === "image" ? imageUrl(media.prompt) : videoUrl(media.prompt);
    const caption =
      media.kind === "image"
        ? `Here's an image of **${media.prompt}**.`
        : `Here's a short clip of **${media.prompt}**. It can take a few seconds to render.`;
    const reply = { text: caption, media: { kind: media.kind, url, prompt: media.prompt } };
    if (user && chatId) {
      await addMessage(user.id, chatId, "assistant", caption, reply.media);
      await touchChat(user.id, chatId);
    }
    return NextResponse.json({ ...reply, chatId, provider: "pollinations-media", signedIn: !!user });
  }

  // ---- optional web search ----
  if (needsSearch(message)) {
    const { hits, source } = await webSearch(message);
    if (hits.length) {
      extras.web = { source, hits: hits.slice(0, 6) };
      history.unshift({
        role: "system",
        content:
          "Fresh web results for this question. Use them and cite the URLs you rely on. If they do not answer the question, say so.\n\n" +
          renderHits(hits.slice(0, 6)),
      });
    } else {
      extras.web = { source, hits: [] };
    }
  }

  const system = buildSystemPrompt({ profile, memories, now: new Date() });
  const turns: ChatTurn[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: message },
  ];

  const result = await chatComplete(turns);
  let text = result?.text || "";
  let provider = result?.provider || "offline";

  if (!text) {
    text = offlineAnswer(message, profile);
    provider = "offline";
  }

  // Remember anything durable that was just said.
  if (user) {
    for (const fact of extractFacts(message)) {
      await addMemory(user.id, fact, "chat").catch(() => undefined);
    }
    if (chatId) {
      await addMessage(user.id, chatId, "assistant", text, { ...extras, provider });
      await touchChat(user.id, chatId);
    }
  }

  return NextResponse.json({
    text,
    chatId,
    provider,
    signedIn: !!user,
    web: extras.web ?? null,
  });
}

/**
 * Last-resort responder so the panel is never a dead end when every upstream is
 * unreachable. It is honest about being offline and still useful for the one
 * thing GG-LOUNGE definitely knows: the catalogue.
 */
function offlineAnswer(message: string, profile: GgProfile): string {
  const m = message.toLowerCase();
  const lines = [
    "**GG-GPT is offline right now** — none of its free model endpoints answered.",
    "Your message is saved and you can retry in a moment.",
  ];
  if (/\bgame\b|\bplay\b|\brecommend\b/.test(m)) {
    lines.push("", "In the meantime, the catalogue is right there — `Enter the lounge` on the home page.");
    if (profile.favoriteIds?.length) lines.push(`You have ${profile.favoriteIds.length} games favourited already.`);
  }
  return lines.join("\n");
}
