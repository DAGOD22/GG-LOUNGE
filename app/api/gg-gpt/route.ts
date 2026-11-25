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
import { availableModels, chatComplete, chatStream, hasVision, imageUrl, sanitizeAnswer, type ChatTurn, type TaskKind } from "@/lib/gg-gpt/engine";
import { videoPlan, describeVideoPlan } from "@/lib/gg-gpt/video";
import {
  webSearch,
  renderHits,
  getWeather,
  convertCurrency,
  convertUnit,
  cryptoPrice,
  defineWord,
  lookupTopic,
  searchCatalogue,
  type CatalogueEntry,
  type ToolResult,
} from "@/lib/gg-gpt/tools";
import { detectIntent, titleFromMessage } from "@/lib/gg-gpt/intent";
import { recommend, renderRecommendation, type PlaySignal } from "@/lib/gg-gpt/recommend";
import {
  detectFeature, tasteCard, backlogTriage, compareGames, achievementCoach, sessionPlanner,
  progressReport, discoveryChallenge, genreExplainer, controlsHelp, catalogueQuiz,
  type CatalogueGame, type FeatureResult, type PlayerState,
} from "@/lib/gg-gpt/features";
import { critiqueAnswer, followUp, mergeFollowUp, plan as planSteps } from "@/lib/gg-gpt/reason";
import { getGameControls } from "@/lib/game-controls";
import { listUserAchievements, getUserStats } from "@/lib/db/achievements";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { answerClock } from "@/lib/gg-gpt/clock";
import { cacheGet, cacheSet } from "@/lib/gg-gpt/cache";
import { exclusive, exclusiveStream, backOff, waitEstimate } from "@/lib/gg-gpt/queue";
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

/** What this person has actually played, for the recommender. */
async function playSignalFor(userId?: string | null): Promise<PlaySignal | null> {
  if (!userId) return null;
  const state = (await getUserState(userId)) as unknown as Record<string, unknown> | null;
  if (!state) return null;
  const playCounts: Record<string, number> = {};
  const raw = state.playCounts ?? state.playcounts;
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number" && v > 0) playCounts[k] = v;
    }
  }
  const favorites = Array.isArray(state.favorites) ? state.favorites.map(String) : [];
  const recentlyPlayed = Array.isArray(state.recentlyPlayed) ? state.recentlyPlayed.map(String) : [];
  if (!Object.keys(playCounts).length && !favorites.length) return null;
  return { playCounts, favorites, recentlyPlayed };
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
  const url = new URL(req.url);

  /**
   * The model picker's data.
   *
   * Deliberately derived from what this deployment can actually reach, not from
   * a hard-coded wish list: a picker that offers a provider with no key is a
   * picker that fails on the first use. `models` is ordered the way the chain
   * orders them for a normal chat, and each entry says whether it can see an
   * image so the UI can grey out vision for the rest.
   */
  if (url.searchParams.get("models") === "1") {
    return NextResponse.json(
      { models: availableModels() },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const { user } = await whoami(req);
  if (!user) return NextResponse.json({ signedIn: false, chats: [], memories: [], models: availableModels() });
  const [chats, memories] = await Promise.all([listChats(user.id), listMemories(user.id)]);
  return NextResponse.json({
    signedIn: true,
    username: user.username,
    chats,
    memories,
    models: availableModels(),
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
    /** Force a tool on or off for one turn. */
    tool?: string;
    stream?: boolean;
    /**
     * Images the user attached, as data: URLs (already resized client-side).
     * Presence of one of these is what makes a turn a vision turn.
     */
    images?: string[];
    /** Chosen in the UI; "auto" (or absent) lets the router decide. */
    task?: "auto" | TaskKind;
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

  /**
   * Ten capabilities that need this site's data, not a bigger model. They are
   * answered here — deterministic, instant, and impossible for a general chatbot
   * — before any intent detection or model call happens.
   */
  const feature = detectFeature(message);
  if (feature) {
    const state = await playSignalFor(user?.id).catch(() => null);
    const games: CatalogueGame[] = CATALOGUE as CatalogueGame[];
    const empty: PlayerState = { playCounts: {}, favorites: [], recentlyPlayed: [] };
    const ps = state ?? empty;
    let result: FeatureResult | null = null;

    switch (feature.feature) {
      case "taste-card": result = tasteCard(ps, games); break;
      case "backlog-triage": result = backlogTriage(ps, games, Number(feature.args.minutes ?? 30)); break;
      case "compare":
        result = compareGames(String(feature.args.a), String(feature.args.b), games, ps);
        break;
      case "achievement-coach": {
        if (!user) {
          result = { feature: "achievement-coach", text: "Sign in and I can read your real achievement progress — as a guest there is nothing for me to read." };
        } else {
          const [unlocked, stats] = await Promise.all([
            listUserAchievements(user.id).catch(() => []),
            getUserStats(user.id).catch(() => null),
          ]);
          const defs = ACHIEVEMENTS.map(a => ({ id: a.id, gameId: a.gameId, name: a.title, description: a.description, points: a.points, target: a.target }));
          result = achievementCoach(
            unlocked.map(u => ({ gameId: u.gameId, achievementId: u.achievementId, unlocked: Boolean(u.unlocked), progress: u.progress ?? 0 })),
            defs, games, ps.playCounts,
          );
          if (stats) result.text += `\n\n**Totals:** ${stats.totalUnlocked} unlocked, ${stats.totalPoints} points.`;
        }
        break;
      }
      case "session-planner": result = sessionPlanner(Number(feature.args.minutes ?? 30), games); break;
      case "progress-report": result = progressReport(ps, games); break;
      case "discovery-challenge": result = discoveryChallenge(ps, games); break;
      case "genre-explainer": result = genreExplainer(String(feature.args.genre), games, ps); break;
      case "controls-help": {
        const q = String(feature.args.game).toLowerCase();
        const game = games.find(g => g.id === q) ?? games.find(g => g.title.toLowerCase().includes(q) || q.includes(g.title.toLowerCase()));
        if (!game) {
          result = { feature: "controls-help", text: `I could not find a game called "${feature.args.game}" here. Name it exactly and I will pull its legend.` };
        } else {
          const legend = getGameControls(game.id, game.genre);
          result = controlsHelp(game, legend ? { description: legend } : null);
        }
        break;
      }
      case "catalogue-quiz": result = catalogueQuiz(games); break;
    }

    if (result) {
      const text = result.text;
      if (user && chatId) {
        await addMessage(user.id, chatId, "assistant", text, { provider: `feature:${result.feature}` }).catch(() => undefined);
        await touchChat(user.id, chatId).catch(() => undefined);
      }
      return body.stream
        ? sseOnce(text, { chatId, provider: `feature:${result.feature}` })
        : NextResponse.json({ text, chatId, provider: `feature:${result.feature}`, signedIn: !!user });
    }
  }

  /* ---------- follow-up resolution ---------- */
  // "and tomorrow?" used to be treated as a brand-new, subject-less question.
  // Carry the previous subject forward so the continuation means something.
  const priorUser = [...history].reverse().find(h => h.role === "user")?.content ?? null;
  const follow = followUp(message, priorUser);
  const effectiveMessage = follow.isFollowUp && follow.subject ? mergeFollowUp(message, follow.subject) : message;

  const intent = detectIntent(effectiveMessage);

  /* ---------- media ---------- */
  if (intent.image) {
    const prompt = intent.image.prompt.slice(0, 600);
    // Images come out of the *same* one-request-per-45-seconds budget as text,
    // so they queue behind the same gate. Without this, asking for a picture
    // right after a question returns a 402 card instead of a picture.
    if (waitEstimate() > 12_000) {
      const text = "**The free tier allows one generation every 45 seconds.** Try again in a moment and I'll render it.";
      return NextResponse.json({ text, chatId, provider: "rate-limited", signedIn: !!user });
    }
    const url = imageUrl(prompt, { width: intent.image.width, height: intent.image.height, style: intent.image.style });
    const caption = `Here's an image of **${prompt}**.`;
    const media = { kind: "image", url, prompt };
    if (user && chatId) {
      await addMessage(user.id, chatId, "assistant", caption, media).catch(() => undefined);
      await touchChat(user.id, chatId).catch(() => undefined);
    }
    return NextResponse.json({ text: caption, media, chatId, provider: "pollinations-image", signedIn: !!user });
  }
  if (intent.video) {
    const prompt = intent.video.prompt.slice(0, 600);
    if (waitEstimate() > 12_000) {
      const text = "**The free tier allows one generation every 45 seconds.** Try again in a moment and I'll build the clip.";
      return NextResponse.json({ text, chatId, provider: "rate-limited", signedIn: !!user });
    }
    const plan = videoPlan(prompt, { hostUrl: process.env.GG_VIDEO_HOST || null });
    const text = describeVideoPlan(plan, prompt);
    // The client renders the clip when there is no AI host: send the shot list,
    // not a URL pretending to be a video.
    const media = {
      kind: plan.renderInBrowser ? "video-frames" : "video",
      url: plan.url,
      prompt,
      frames: plan.frames,
      width: plan.width,
      height: plan.height,
      durationSec: plan.durationSec,
      fps: plan.fps,
    };
    if (user && chatId) {
      await addMessage(user.id, chatId, "assistant", text, media).catch(() => undefined);
      await touchChat(user.id, chatId).catch(() => undefined);
    }
    return NextResponse.json({ text, media, chatId, provider: "video", signedIn: !!user });
  }

  /* ---------- clock: the model has no idea what time it is ---------- */
  if (intent.clock) {
    const clock = answerClock(message);
    if (clock) {
      const text = clock.text;
      const cards = [{ label: "time", source: clock.source, data: clock.data }];
      if (user && chatId) {
        await addMessage(user.id, chatId, "assistant", text, { cards, provider: "clock" }).catch(() => undefined);
        await touchChat(user.id, chatId).catch(() => undefined);
      }
      return body.stream
        ? sseOnce(text, { chatId, provider: "clock", cards })
        : NextResponse.json({ text, chatId, provider: "clock", signedIn: !!user, cards });
    }
  }

  /* ---------- arithmetic: answer exactly, instantly, no model needed ---------- */
  if (intent.math) {
    const { expression, pretty } = intent.math;
    const text = `**${expression}** = **${pretty}**`;
    const cards = [{ label: "calculation", source: "arithmetic", data: intent.math }];
    const respond = () =>
      body.stream
        ? sseOnce(text, { chatId, provider: "arithmetic", cards })
        : NextResponse.json({ text, chatId, provider: "arithmetic", signedIn: !!user, cards });
    if (user && chatId) {
      await addMessage(user.id, chatId, "assistant", text, { cards, provider: "arithmetic" }).catch(() => undefined);
      await touchChat(user.id, chatId).catch(() => undefined);
    }
    return respond();
  }

  /* ---------- tools ---------- */
  const toolResults: ToolResult[] = [];
  const cards: Array<Record<string, unknown>> = [];

  const attempted: string[] = [];
  const run = async <T extends ToolResult | null>(p: Promise<T>, label: string) => {
    attempted.push(label);
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
    intent.topic ? run(lookupTopic(intent.topic.term), "encyclopedia") : null,
  ].filter(Boolean) as Array<Promise<void>>);

  if (intent.unit) {
    attempted.push("conversion");
    const r = convertUnit(intent.unit.amount, intent.unit.from, intent.unit.to);
    if (r) { toolResults.push(r); cards.push({ label: "conversion", source: r.source, data: r.data }); }
  }

  if (intent.catalogue) {
    // Recommendations are the one thing this assistant can do better than a
    // general chatbot, because it knows what you have actually played. Use the
    // history when there is one; fall back to plain catalogue matching for
    // guests who have never played anything.
    const signal = await playSignalFor(user?.id).catch(() => null);
    const rec = recommend(intent.catalogue.query, CATALOGUE, signal);
    const found = rec.picks.length
      ? rec.picks.map(p => CATALOGUE.find(g => g.id === p.id)!).filter(Boolean)
      : searchCatalogue(CATALOGUE, intent.catalogue.query, 6);
    if (found.length) {
      const lines = rec.picks.length
        ? renderRecommendation(rec)
        : found.map(g => `- ${g.title} (${g.genre}) — /g/${g.id}`).join("\n");
      const personalised = rec.summary !== "No play history yet, so recommend a spread of genres.";
      const text = personalised
        ? `**Based on what you actually play** (${rec.summary.replace(/^They /, "you ").replace(/^No play history yet; they /, "no history yet, but you ")})\n\n${lines}`
        : `**Worth your time**\n\n${lines}`;
      toolResults.push({ text, data: { games: found, picks: rec.picks }, source: "catalogue" });
      cards.push({ label: "games", source: "catalogue", data: { games: found, picks: rec.picks } });
    }
  }

  /* ---------- answer ---------- */
  // Some tools don't need a model at all: a conversion or a coin price is the
  // answer. Sending it through a model only adds latency and a chance to garble
  // it — and if every model is down, the answer must still be delivered.
  const deterministic = directAnswer(toolResults);
  if (deterministic && !intent.search) {
    const text = deterministic;
    const provider = "tools";
    if (user && chatId) {
      await addMessage(user.id, chatId, "assistant", text, { cards, provider }).catch(() => undefined);
      await touchChat(user.id, chatId).catch(() => undefined);
    }
    return body.stream
      ? sseOnce(text, { chatId, provider, cards })
      : NextResponse.json({ text, chatId, provider, signedIn: !!user, cards });
  }

  const notes = toolResults.map(r => `[${r.source}] ${r.text}`);

  // Only share answers that cannot contain anything personal. A signed-in user
  // with memories, favourites or prior turns gets a tailor-made reply, and
  // handing that to the next person would be both wrong and a privacy leak.
  const personal =
    history.length > 0 ||
    memories.length > 0 ||
    !!(profile.topGames?.length || profile.favoriteIds?.length || profile.memberSince) ||
    /\b(my|me|i'm|i am|mine|our|we)\b/i.test(message);

  const cached = personal ? null : cacheGet(message, notes);
  if (cached) {
    if (user && chatId) {
      await addMessage(user.id, chatId, "assistant", cached.text, { cards, provider: cached.provider }).catch(() => undefined);
      await touchChat(user.id, chatId).catch(() => undefined);
    }
    return body.stream
      ? sseOnce(cached.text, { chatId, provider: cached.provider, cards, cached: true })
      : NextResponse.json({ text: cached.text, chatId, provider: cached.provider, signedIn: !!user, cards, cached: true });
  }
  // Decide what the answer may rest on before writing it. The plan is passed to
  // the model as a constraint: these facts exist, do not invent others.
  const stepPlan = planSteps(intent, effectiveMessage);
  const plannerNote = stepPlan.steps.length
    ? `Answer only from these sources: ${stepPlan.steps.map(s => `${s.tool} (${s.reason})`).join("; ")}. If a fact you want is not covered by them, say so instead of inventing it.`
    : "No live data was fetched for this message. Answer from general knowledge, and do not state anything time-sensitive as current.";

  const system = buildSystemPrompt({
    profile,
    memories,
    now: new Date(),
    notes: [...notes, `[plan] ${plannerNote}`],
  });
  /**
   * What job is this?
   *
   * Explicit wins: if the person picked "code" in the picker, send it to the
   * code-tuned provider even if the wording is ambiguous. Otherwise infer it,
   * but only from evidence strong enough to be worth reordering the chain:
   * an image makes it vision, and a message that is clearly a programming
   * request (or contains a code fence) makes it code. Everything else is chat.
   *
   * This is not sentiment analysis; a wrong guess costs a slightly worse model
   * ordering, and the chain still answers either way.
   */
  const images = Array.isArray(body.images)
    ? body.images.filter(url => typeof url === "string" && /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(url)).slice(0, 4)
    : [];
  const inferred: TaskKind = images.length
    ? "vision"
    : /```|\b(function|class|const|let|import|export|sql|regex|python|javascript|typescript|react|css|html|api|bug|stack ?trace|refactor)\b/i.test(message)
      ? "code"
      : "chat";
  const task: TaskKind = body.task && body.task !== "auto" ? body.task : inferred;

  /**
   * An attached image with no vision-capable model configured is a dead end, so
   * say so before spending a request: a text-only model asked about a
   * screenshot invents an answer, which is worse than being told to add a key.
   */
  if (images.length && !hasVision()) {
    return NextResponse.json({
      text:
        "I can see that you attached an image, but no image-capable model is configured on this deployment yet. " +
        "Add a key for one (Z.ai's `ZAI_API_KEY`, or `OPENROUTER_API_KEY`) and I'll read screenshots, diagrams and photos directly. " +
        "In the meantime, describe what is in it and I'll work from that.",
      provider: "none",
      model: "none",
    });
  }

  const turns: ChatTurn[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: message, images: images.length ? images : undefined },
  ];

  // Stream when the client asks for it; otherwise answer in one shot.
  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let full = "";
        let emitted = 0;
        let provider = "none";
        let throttled = false;
        try {
          for await (const event of exclusiveStream(() => chatStream(turns, { task }))) {
            if (event.delta) {
              full += event.delta;
              provider = event.provider || provider;
              // Emit the cleaned prefix, holding back the tail that could still
              // be the start of a citation marker.
              const clean = sanitizeAnswer(full);
              if (clean.length > emitted) {
                const delta = clean.slice(emitted);
                emitted = clean.length;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
              }
            }
            if (event.done) {
              if (event.rateLimited) { throttled = true; provider = "rate-limited"; backOff(); }
              break;
            }
          }
          if (provider === "none" && !full) {
            // Nothing produced: either the slot was unavailable or every
            // provider refused. Say which.
            throttled = throttled || waitEstimate() > 0;
            provider = throttled ? "rate-limited" : "none";
          }
        } catch {
          // fall through with whatever text we have
        }
        if (!full.trim()) {
          full = deterministic || offlineAnswer(message, profile, attempted, throttled);
          provider = "offline";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: full })}\n\n`));
        }
        if (user) {
          for (const fact of extractFacts(message)) await addMemory(user.id, fact, "chat").catch(() => undefined);
          if (!personal) cacheSet(message, notes, full, provider);
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

  const budget = waitEstimate();
  const result = (await exclusive(() => chatComplete(turns, { task }))) ?? {
    text: "",
    provider: "queued",
    model: "none",
    attempts: [],
    rateLimited: false,
    queueMs: budget,
  };
  if (result.rateLimited) backOff();
  let text = sanitizeAnswer(result.text);
  let provider = result.provider;

  // Read the answer the way an editor would before the user sees it. Only
  // mechanical faults are repaired; anything needing judgement is left alone,
  // because a silently rewritten answer is worse than a blunt one.
  if (text) {
    const critique = critiqueAnswer(text, {
      hasLiveData: notes.length > 0,
      askedForLive: Boolean(intent.search || intent.weather || intent.crypto || intent.currency),
    });
    if (critique.repaired) text = critique.repaired;
  }

  if (!text) {
    text = deterministic || offlineAnswer(message, profile, attempted, result.rateLimited);
    provider = "offline";
  }

  if (!personal) cacheSet(message, notes, text, provider);

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
 * When the tools that ran are self-sufficient, their output *is* the answer.
 * Anything involving a search hit still goes to the model: it needs to read the
 * sources and summarise them.
 */
function directAnswer(results: ToolResult[]): string | null {
  if (!results.length) return null;
  // A search result is raw material for a model, never the answer itself.
  // Matching source names by hand missed every engine added later.
  const solid = results.filter(r => !r.source.startsWith("search:") || r.source === "wikipedia");
  if (!solid.length || solid.length !== results.length) return null;
  const lines = solid.map(r => `**${r.text}**`);
  return lines.length === 1 ? lines[0] : lines.join("\n\n");
}

/** Emit a single already-finished answer as an SSE stream. */
function sseOnce(text: string, meta: Record<string, unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, ...meta })}\n\n`));
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

/**
 * Last-resort responder: never a dead end, honest about being offline, and
 * still able to name real games from the catalogue.
 */
function offlineAnswer(
  message: string,
  profile: GgProfile,
  attempted: string[] = [],
  rateLimited = false,
): string {
  // Be specific about *why*. "Everything is down" is wrong when the truth is
  // "the free tier allows one reply every 45 seconds" — and the second version
  // tells the user exactly what to do.
  const lines = [
    rateLimited
      ? "**The free model is on its one-reply-every-45-seconds budget right now.** Give it a moment and ask again — your message is saved. (Everything that doesn't need a model — maths, conversions, prices, the time — keeps working.)"
      : attempted.length
        ? `**I couldn't reach the live ${attempted.join(" / ")} service just now, and the free model endpoints are busy too.** Try again in a moment.`
        : "**Every free model endpoint is busy or unreachable right now.** Your message is saved — try again in a moment.",
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
