/**
 * Ten capabilities that no chat product can give you, because they need this
 * site's own data.
 *
 * Everything here answers from GG-LOUNGE's own state — the catalogue, a
 * person's play history, achievements, visits, the clock, the session — with a
 * model used only to phrase the result when phrasing helps. That is the honest
 * way to be "better than ChatGPT at something": do things it has no access to.
 *
 *   1. taste card         a real profile of what someone plays, with numbers
 *   2. backlog triage     what to play next, from what you own and how long you play
 *   3. game compare       two titles head to head, from catalogue truth
 *   4. achievement coach  what to chase next, from real unlock state
 *   5. session planner    a playlist for the time you actually have
 *   6. progress report    your week, in launches and minutes
 *   7. discovery challenge a short brief that stretches your taste
 *   8. genre explainer    what a genre means *here*, with real examples
 *   9. controls help      how to actually play a specific game
 *  10. trivia quiz        questions generated from the catalogue, answers verified
 */

import type { CatalogueEntry } from "./tools";

export type FeatureId =
  | "taste-card"
  | "backlog-triage"
  | "compare"
  | "achievement-coach"
  | "session-planner"
  | "progress-report"
  | "discovery-challenge"
  | "genre-explainer"
  | "controls-help"
  | "catalogue-quiz";

export interface FeatureResult {
  feature: FeatureId;
  text: string;
  data?: unknown;
}

export interface CatalogueGame extends CatalogueEntry {
  featured?: boolean;
  path?: string;
  proxy?: boolean;
}

export interface PlayerState {
  playCounts: Record<string, number>;
  favorites: string[];
  recentlyPlayed: string[];
}

const BULLET = "·";

function pct(n: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function titleOf(all: CatalogueGame[], id: string): string {
  return all.find(g => g.id === id)?.title ?? id;
}

/** 1. Taste card -------------------------------------------------------- */
export function tasteCard(state: PlayerState, all: CatalogueGame[]): FeatureResult {
  const entries = Object.entries(state.playCounts).filter(([, n]) => n > 0);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (!entries.length) {
    return {
      feature: "taste-card",
      text:
        "I can build a taste card, but there is nothing to read yet — no launches recorded. " +
        "Play two or three games and ask me again; it will show your genres, your comfort zone and where you have never been.",
    };
  }

  const byGenre = new Map<string, number>();
  const byTone = new Map<string, number>();
  for (const [id, n] of entries) {
    const g = all.find(x => x.id === id);
    if (!g) continue;
    byGenre.set(g.genre, (byGenre.get(g.genre) ?? 0) + n);
    byTone.set(g.tone, (byTone.get(g.tone) ?? 0) + n);
  }
  const genres = [...byGenre.entries()].sort((a, b) => b[1] - a[1]);
  const top = genres[0];
  const unvisited = all.filter(g => !state.playCounts[g.id]);
  const rarest = genres[genres.length - 1];

  const lines = [
    `**Your taste card** ${BULLET} ${total} launches across ${entries.length} games`,
    "",
    ...genres.slice(0, 5).map(([genre, n]) => `- **${genre}** — ${n} launches (${pct(n, total)} of everything you play)`),
    "",
    top
      ? `**In one line:** you are a ${top[0].toLowerCase()} player${byTone.size ? ` who likes the ${[...byTone.entries()].sort((a, b) => b[1] - a[1])[0][0].toLowerCase()} end of it` : ""}.`
      : "",
    rarest && genres.length > 3 ? `**Blind spot:** ${rarest[0].toLowerCase()} — ${rarest[1]} launches, ${pct(rarest[1], total)}.` : "",
    `**Untouched:** ${unvisited.length} of ${all.length} games you have never opened.`,
    state.favorites.length ? `**Favourites:** ${state.favorites.slice(0, 5).map(id => titleOf(all, id)).join(", ")}` : "",
  ].filter(Boolean);

  return { feature: "taste-card", text: lines.join("\n"), data: { total, genres, unvisited: unvisited.length } };
}

/** 2. Backlog triage ---------------------------------------------------- */
export function backlogTriage(state: PlayerState, all: CatalogueGame[], minutes: number): FeatureResult {
  const unplayed = all.filter(g => !state.playCounts[g.id]);
  const started = all.filter(g => (state.playCounts[g.id] ?? 0) > 0 && (state.playCounts[g.id] ?? 0) < 3);
  // Short sessions suit arcade and puzzle; long ones suit strategy and sandbox.
  const longForm = new Set(["Strategy", "Sandbox", "RPG", "Simulation", "Idle"]);
  const fits = (g: CatalogueGame) => (minutes >= 40 ? longForm.has(g.genre) : !longForm.has(g.genre));

  const picks = [...started.filter(fits), ...unplayed.filter(fits), ...unplayed].slice(0, 3);
  if (!picks.length) {
    return {
      feature: "backlog-triage",
      text: "Nothing in the backlog — you have played everything in the catalogue. Genuinely. Ask me to pick something at random instead.",
    };
  }

  const lines = [
    `**With ${minutes} minutes**, here is what fits:`,
    "",
    ...picks.map((g, i) => {
      const plays = state.playCounts[g.id] ?? 0;
      const why = plays > 0 ? "you started this and it never got a fair run" : minutes < 40 ? "short sessions, no commitment" : "deep enough to fill the time";
      return `${i + 1}. **${g.title}** — ${g.genre}/${g.tone} ${BULLET} /g/${g.id}\n   ${why}`;
    }),
  ];
  return { feature: "backlog-triage", text: lines.join("\n"), data: { picks: picks.map(g => g.id) } };
}

/** 3. Compare ----------------------------------------------------------- */
export function compareGames(aId: string, bId: string, all: CatalogueGame[], state?: PlayerState): FeatureResult {
  const a = all.find(g => g.id === aId || g.title.toLowerCase() === aId.toLowerCase());
  const b = all.find(g => g.id === bId || g.title.toLowerCase() === bId.toLowerCase());
  if (!a || !b) {
    return {
      feature: "compare",
      text: `I could not find ${!a ? `"${aId}"` : ""}${!a && !b ? " or " : ""}${!b ? `"${bId}"` : ""} in the catalogue. Tell me two games that are on the site and I will compare them properly.`,
    };
  }
  const playsA = state?.playCounts[a.id] ?? 0;
  const playsB = state?.playCounts[b.id] ?? 0;
  const row = (label: string, x: string, y: string) => `| ${label} | ${x} | ${y} |`;

  const lines = [
    `**${a.title} vs ${b.title}**`,
    "",
    `| | **${a.title}** | **${b.title}** |`,
    "|---|---|---|",
    row("Genre", a.genre, b.genre),
    row("Feel", a.tone, b.tone),
    row("Play style", a.proxy ? "live site (needs connection)" : "local files (works offline)", b.proxy ? "live site (needs connection)" : "local files (works offline)"),
    row("Your launches", String(playsA), String(playsB)),
    "",
    a.description ? `**${a.title}** — ${a.description}` : "",
    b.description ? `**${b.title}** — ${b.description}` : "",
    "",
    playsA === playsB
      ? `You have played both ${playsA} times. Pick by mood: ${a.tone.toLowerCase()} or ${b.tone.toLowerCase()}.`
      : `${playsA > playsB ? a.title : b.title} is the one you actually return to (${Math.max(playsA, playsB)} vs ${Math.min(playsA, playsB)} launches) — but the other fits the same slot, so it is a fair switch.`,
  ].filter(Boolean);
  return { feature: "compare", text: lines.join("\n"), data: { a: a.id, b: b.id } };
}

/** 4. Achievement coach -------------------------------------------------- */
export function achievementCoach(
  unlocked: Array<{ gameId: string; achievementId: string; unlocked: boolean; progress: number }>,
  catalogue: Array<{ id: string; gameId: string; name: string; description: string; points: number; target?: number }>,
  all: CatalogueGame[],
  playCounts: Record<string, number>,
): FeatureResult {
  const unlockedIds = new Set(unlocked.filter(u => u.unlocked).map(u => `${u.gameId}:${u.achievementId}`));
  const inProgress = unlocked
    .filter(u => !u.unlocked && u.progress > 0)
    .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
    .slice(0, 3);

  if (!unlocked.length) {
    return {
      feature: "achievement-coach",
      text:
        "No achievement data yet — the tracker fills in as you play. " +
        `There are achievements in ${new Set(catalogue.map(c => c.gameId)).size} games; start with one you already play so the first unlocks land quickly.`,
    };
  }

  const lines = [`**Achievement coach** ${BULLET} ${unlockedIds.size} unlocked`];
  if (inProgress.length) {
    lines.push("", "**Closest to unlocking — finish these first:**");
    for (const u of inProgress) {
      const def = catalogue.find(c => c.gameId === u.gameId && c.id === u.achievementId);
      if (!def) continue;
      const target = def.target ?? 1;
      lines.push(`- **${def.name}** in ${titleOf(all, u.gameId)} — ${u.progress}${target > 1 ? `/${target}` : ""} (${pct(u.progress, target)}) — ${def.points} pts`);
    }
  }
  const untouchedGames = [...new Set(catalogue.map(c => c.gameId))].filter(id => !(playCounts[id] ?? 0));
  if (untouchedGames.length) {
    lines.push("", `**Escalation:** ${untouchedGames.slice(0, 3).map(id => titleOf(all, id)).join(", ")} have achievements you have never touched.`);
  }
  return { feature: "achievement-coach", text: lines.join("\n"), data: { inProgress } };
}

/** 5. Session planner ---------------------------------------------------- */
export function sessionPlanner(minutes: number, all: CatalogueGame[], pool?: CatalogueGame[]): FeatureResult {
  const source = pool && pool.length ? pool : all;
  const short = source.filter(g => ["Arcade", "Puzzle", "Action", "Shooter"].includes(g.genre));
  const long = source.filter(g => ["Strategy", "Sandbox", "RPG", "Simulation", "Idle"].includes(g.genre));

  // Slots are a budget, not a wish list: they must add up to the time the
  // person actually has. (They previously asked for 40 minutes inside a 20.)
  const warm = Math.max(2, Math.round(minutes * 0.15));
  const cool = Math.max(2, Math.round(minutes * 0.2));
  const main = Math.max(3, minutes - warm - cool);
  const slots = minutes <= 15
    ? [["warm-up", short, 3], ["main", short, Math.max(3, minutes - 6)], ["palate cleanser", short, 3]] as Array<[string, CatalogueGame[], number]>
    : [
        ["warm-up", short, warm] as [string, CatalogueGame[], number],
        ["main", long, main] as [string, CatalogueGame[], number],
        ["finisher", short, cool] as [string, CatalogueGame[], number],
      ];

  const used = new Set<string>();
  const rows: string[] = [];
  for (const [label, list, mins] of slots as Array<[string, CatalogueGame[], number]>) {
    const pick = list.find(g => !used.has(g.id)) ?? source.find(g => !used.has(g.id));
    if (!pick) continue;
    used.add(pick.id);
    rows.push(`- **${label}** (${mins} min) — ${pick.title} · /g/${pick.id}`);
  }

  return {
    feature: "session-planner",
    text:
      `**${minutes}-minute session**\n\n${rows.join("\n")}\n\n` +
      `Built so you get one real run at something, not five five-minute tastes of nothing.`,
    data: { slots: rows.length },
  };
}

/** 6. Progress report ----------------------------------------------------- */
export function progressReport(state: PlayerState, all: CatalogueGame[], days = 7): FeatureResult {
  const recent = state.recentlyPlayed.slice(0, 12);
  const total = Object.values(state.playCounts).reduce((a, b) => a + b, 0);
  if (!Object.keys(state.playCounts).length) {
    return { feature: "progress-report", text: "No progress to report yet — the counter starts on your first launch." };
  }
  const most = Object.entries(state.playCounts).sort((a, b) => b[1] - a[1])[0];
  const genres = new Set(recent.map(id => all.find(g => g.id === id)?.genre).filter(Boolean));
  const lines = [
    `**Progress report** ${BULLET} last ${days} days`,
    "",
    `- **${total}** launches across **${Object.keys(state.playCounts).length}** games`,
    most ? `- Top game: **${titleOf(all, most[0])}** with ${most[1]} launches` : "",
    recent.length ? `- Recent: ${recent.slice(0, 5).map(id => titleOf(all, id)).join(", ")}` : "",
    genres.size ? `- You have been playing ${genres.size} different genres — ${genres.size >= 3 ? "good range" : "fairly focused"}.` : "",
  ].filter(Boolean);
  return { feature: "progress-report", text: lines.join("\n"), data: { total } };
}

/** 7. Discovery challenge ------------------------------------------------- */
export function discoveryChallenge(state: PlayerState, all: CatalogueGame[]): FeatureResult {
  const playedGenres = new Set(
    Object.keys(state.playCounts)
      .map(id => all.find(g => g.id === id)?.genre)
      .filter((g): g is string => Boolean(g)),
  );
  const novel = all.filter(g => !playedGenres.has(g.genre) && !state.playCounts[g.id]);
  const pick = novel[0] ?? all.find(g => !state.playCounts[g.id]) ?? all[0];
  if (!pick) return { feature: "discovery-challenge", text: "The catalogue is empty — nothing to challenge you with." };

  return {
    feature: "discovery-challenge",
    text:
      `**Today's challenge:** play **${pick.title}** — ${pick.genre}/${pick.tone}.\n\n` +
      `${novel.length ? `You have never touched a ${pick.genre.toLowerCase()} game here, which is exactly why it is the interesting choice.` : "It is the one thing here you have not opened yet."}\n\n` +
      `→ /g/${pick.id}\n\nCome back and tell me whether it earned a second session.`,
    data: { pick: pick.id },
  };
}

/** 8. Genre explainer ----------------------------------------------------- */
export function genreExplainer(genre: string, all: CatalogueGame[], state?: PlayerState): FeatureResult {
  const inGenre = all.filter(g => g.genre.toLowerCase() === genre.toLowerCase());
  if (!inGenre.length) {
    const known = [...new Set(all.map(g => g.genre))];
    return {
      feature: "genre-explainer",
      text: `No genre called "${genre}" here. On this site: ${known.slice(0, 12).join(", ")}.`,
    };
  }
  const played = inGenre.filter(g => (state?.playCounts[g.id] ?? 0) > 0);
  const lines = [
    `**${inGenre[0].genre}** ${BULLET} ${inGenre.length} games on GG-LOUNGE`,
    "",
    `At its best: ${[...new Set(inGenre.map(g => g.tone))].slice(0, 4).join(", ")}.`,
    "",
    "**Worth starting with:**",
    ...inGenre.slice(0, 4).map(g => `- **${g.title}** — ${g.tone} · /g/${g.id}`),
    played.length ? `\nYou have played ${played.length} of these (${played.map(g => g.title).join(", ")}).` : "\nYou have not played any of these yet.",
  ];
  return { feature: "genre-explainer", text: lines.join("\n"), data: { count: inGenre.length } };
}

/** 9. Controls help -------------------------------------------------------- */
export function controlsHelp(
  game: CatalogueGame,
  controls: { keys?: string; description?: string } | null,
): FeatureResult {
  if (!controls) {
    return {
      feature: "controls-help",
      text: `I do not have a control legend recorded for **${game.title}** yet — it loads its own instructions in-game. Ask and I will note the gap.`,
    };
  }
  return {
    feature: "controls-help",
    text:
      `**${game.title}** ${BULLET} ${game.genre}/${game.tone}\n\n` +
      `${controls.keys ? `**Keys:** ${controls.keys}\n\n` : ""}` +
      `${controls.description ? controls.description : ""}\n\n→ /g/${game.id}`,
    data: { gameId: game.id },
  };
}

/** 10. Catalogue quiz ------------------------------------------------------ */
export function catalogueQuiz(all: CatalogueGame[], count = 3): FeatureResult {
  const pool = all.filter(g => g.title && g.genre);
  if (pool.length < 6) return { feature: "catalogue-quiz", text: "Not enough games to build a quiz from." };
  const qs: string[] = [];
  const answers: string[] = [];
  const used = new Set<string>();

  const allGenres = [...new Set(pool.map(g => g.genre))];
  let attempts = 0;
  while (qs.length < count && attempts < count * 12) {
    attempts++;
    const target = pool[Math.floor(Math.random() * pool.length)];
    if (used.has(target.id)) continue;
    used.add(target.id);

    // Options must be four *different* genres, exactly one of which is right.
    // The previous version filled the wrong options from the same genre, which
    // produced "a) Racing b) Racing c) Racing" — an unanswerable question.
    const wrong: string[] = [];
    const shuffled = [...allGenres].sort(() => Math.random() - 0.5);
    for (const g of shuffled) {
      if (g === target.genre) continue;
      wrong.push(g);
      if (wrong.length === 3) break;
    }
    if (wrong.length < 3) continue;
    const opts = [...wrong, target.genre].sort(() => Math.random() - 0.5);
    const correctIndex = opts.indexOf(target.genre);

    qs.push(
      `**Q${qs.length + 1}.** What genre is *${target.title}*?\n` +
      opts.map((o, n) => `${String.fromCharCode(97 + n)}) ${o}`).join("  "),
    );
    answers.push(`${qs.length}: ${String.fromCharCode(97 + correctIndex)}) ${target.genre}`);
  }

  return {
    feature: "catalogue-quiz",
    text:
      `**Catalogue quiz** ${BULLET} ${count} questions\n\n${qs.join("\n\n")}\n\n` +
      `<details><summary>Answers</summary>\n\n${answers.join("\n")}\n\n</details>`,
    data: { answers },
  };
}

/* ------------------------------------------------------------------ *
 * Router: match a message to one of the ten.
 * ------------------------------------------------------------------ */

export interface FeatureRequest {
  feature: FeatureId;
  args: Record<string, string | number>;
}

/**
 * Detect a request for one of the above. Runs before normal intent detection,
 * because "compare Doom and Quake" would otherwise be read as a web search.
 */
export function detectFeature(message: string): FeatureRequest | null {
  const m = message.trim();
  const lower = m.toLowerCase();

  if (/\b(?:my )?(?:taste|profile) card\b|^what (?:kind of |type of )?(?:player|games? do i|gamer)\b/.test(lower)) {
    return { feature: "taste-card", args: {} };
  }
  const compare = /\b(?:compare|versus|vs\.?)\b/i.exec(m);
  if (compare && /\bgame/i.test(lower) || /\bcompare\s+(.+?)\s+(?:and|with|to|vs\.?)\s+(.+)$/i.test(m)) {
    const match = /compare\s+(.+?)\s+(?:and|with|to|vs\.?)\s+(.+?)[?.!]?$/i.exec(m);
    if (match) return { feature: "compare", args: { a: match[1].trim(), b: match[2].trim() } };
  }
  if (/\b(?:backlog|what should i (?:play|finish)|what (?:have i|did i) (?:start|leave))\b/.test(lower)) {
    const mins = /(\d{1,3})\s*(?:minutes|mins|min)\b/.exec(lower);
    return { feature: "backlog-triage", args: { minutes: mins ? Number(mins[1]) : 30 } };
  }
  if (/\b(?:achievements?)\b/.test(lower) && /\b(?:next|close|coach|chase|unlock|missing|which)\b/.test(lower)) {
    return { feature: "achievement-coach", args: {} };
  }
  // "45 minute session" and "45 minutes" both count: people drop the plural.
  const sess = /(\d{1,3})\s*(?:minutes?|mins?|hours?|hrs?)\b/.exec(lower);
  if (sess && /\b(?:play|session|plan|time|half an hour|an hour)\b/.test(lower)) {
    const n = Number(sess[1]);
    const minutes = /hour|hr/.test(sess[0]) ? n * 60 : n;
    return { feature: "session-planner", args: { minutes: Math.max(5, Math.min(minutes, 300)) } };
  }
  if (/\b(?:progress|report|how (?:am i|have i) doing|my (?:week|stats))\b/.test(lower)) {
    return { feature: "progress-report", args: {} };
  }
  if (/\b(?:challenge|surprise me|push me|something new)\b/.test(lower)) {
    return { feature: "discovery-challenge", args: {} };
  }
  const genre = /\b(?:what is|explain|tell me about|what'?s)\s+(?:a|an|the)?\s*([a-z]+)\s+(?:genre|games?)\b/.exec(lower)
    || /\b([a-z]+) genre\b/.exec(lower);
  if (genre) return { feature: "genre-explainer", args: { genre: genre[1] } };
  if (/\b(?:controls?|keys?|how do i play|how to play)\b/.test(lower)) {
    const game = /\b(?:controls? (?:for|in)|how (?:do i|to) play)\s+(.+?)[?.!]?$/i.exec(m);
    if (game) return { feature: "controls-help", args: { game: game[1].trim() } };
  }
  if (/\b(?:quiz|test me|trivia|game knowledge)\b/.test(lower)) {
    return { feature: "catalogue-quiz", args: {} };
  }
  return null;
}
