/**
 * GG-GPT's persona, personalisation and prompt assembly.
 *
 * "Remembers across chats" and "personalised" are the two requirements that are
 * easiest to fake and most obvious when faked, so they are real here: the
 * account's saved facts and a compact profile are injected into every request,
 * and every exchange is scanned for durable facts worth keeping.
 */
import type { GgMemory } from "@/lib/db/gg-gpt";

export interface GgProfile {
  username?: string | null;
  /** Games they actually play, most played first. */
  topGames?: string[];
  favoriteIds?: string[];
  theme?: string | null;
}

export interface PromptContext {
  profile: GgProfile;
  memories: GgMemory[];
  now: Date;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { profile, memories, now } = ctx;
  const name = profile.username ? profile.username : "a signed-out guest";
  const lines: string[] = [
    "You are GG-GPT, the assistant built into GG-LOUNGE — a browser game arcade.",
    "",
    "Style:",
    "- Be genuinely useful and direct. Answer the question first, then explain.",
    "- Write like a sharp friend, not a corporate help desk. No filler, no \"As an AI\".",
    "- Use Markdown: short paragraphs, bullet lists, fenced code blocks with a language tag.",
    "- Match the user's level of detail: a one-line question gets a one-line answer.",
    "- If you are not sure, say so plainly and say what you do know.",
    "",
    "You can:",
    "- Search the web (the results will be given to you as context when used).",
    "- Generate images — when a picture would help, offer to make one.",
    "- Generate short videos the same way.",
    "- Recommend games from the GG-LOUNGE catalogue, which hosts 250+ playable browser games.",
    "",
    `Current date: ${now.toISOString().slice(0, 10)}.`,
    `The person you are talking to is ${name}.`,
  ];

  if (profile.topGames?.length) {
    lines.push(`Games they play most: ${profile.topGames.slice(0, 6).join(", ")}.`);
  }
  if (profile.favoriteIds?.length) {
    lines.push(`They have favourited: ${profile.favoriteIds.slice(0, 8).join(", ")}.`);
  }
  if (memories.length) {
    lines.push(
      "",
      "Things you remember about them from earlier conversations (use naturally, do not list them back unprompted):",
      ...memories.slice(0, 40).map(m => `- ${m.fact}`),
    );
  }
  lines.push(
    "",
    "Never invent a memory. If they ask what you remember, answer from the list above only.",
  );
  return lines.join("\n");
}

/**
 * Pull durable facts out of a user message. Deliberately conservative: only
 * explicit self-disclosure ("I'm 14", "my favourite game is X", "I live in
 * Adelaide") is kept, because a wrong memory is worse than none.
 */
const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/\bmy name is ([A-Z][\w'-]{1,20})/i, m => `Their name is ${m[1]}.`],
  [/\bcall me ([A-Z][\w'-]{1,20})/i, m => `They prefer to be called ${m[1]}.`],
  [/\bi'?m (\d{1,2}) (?:years old|yo)\b/i, m => `They are ${m[1]} years old.`],
  [/\bi am (\d{1,2}) (?:years old|yo)\b/i, m => `They are ${m[1]} years old.`],
  [/\bi live in ([A-Z][\w\s,'-]{2,40})/i, m => `They live in ${m[1].trim()}.`],
  [/\bi'?m from ([A-Z][\w\s,'-]{2,40})/i, m => `They are from ${m[1].trim()}.`],
  [/\bmy fav(?:ou)?rite game is ([^.!?\n]{2,60})/i, m => `Their favourite game is ${m[1].trim()}.`],
  [/\bi (?:really )?love ([^.!?\n]{2,50})/i, m => `They love ${m[1].trim()}.`],
  [/\bi hate ([^.!?\n]{2,50})/i, m => `They dislike ${m[1].trim()}.`],
  [/\bi(?:'m| am) (?:a|an) ([^.!?\n]{2,50})/i, m => `They describe themselves as ${m[1].trim()}.`],
  [/\bi work (?:at|for|in) ([^.!?\n]{2,50})/i, m => `They work at/in ${m[1].trim()}.`],
  [/\bi study ([^.!?\n]{2,50})/i, m => `They study ${m[1].trim()}.`],
  [/\bremember (?:that )?([^.!?\n]{4,120})/i, m => `${m[1].trim()}`],
];

export function extractFacts(message: string): string[] {
  const found = new Set<string>();
  for (const [re, build] of PATTERNS) {
    const m = message.match(re);
    if (m) {
      const fact = build(m).replace(/\s+/g, " ").trim();
      if (fact.length > 6 && fact.length < 240) found.add(fact);
    }
  }
  return [...found];
}

/** Short chat titles from the first thing the user said. */
export function titleFromMessage(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  const cut = clean.slice(0, 60);
  return cut.length < clean.length ? `${cut.replace(/[,;:]$/, "")}…` : cut;
}

/** Should this turn search the web? */
export function needsSearch(message: string): boolean {
  const m = message.toLowerCase();
  if (/\b(don'?t|no need to|without) (search|browsing)\b/.test(m)) return false;
  return (
    /\b(search|google|look ?up|find out|latest|newest|current|today|tonight|yesterday|this (week|month|year)|news|price|weather|score|who won|when (is|was|did)|release date|update|version)\b/.test(
      m,
    ) || /\b(19|20)\d{2}\b/.test(m)
  );
}

/** Did the user ask for a picture / video? */
export function mediaIntent(message: string): { kind: "image" | "video"; prompt: string } | null {
  const m = message.trim();
  const img =
    /\b(?:generate|make|create|draw|render|design|paint)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|art|illustration|drawing|logo|poster|wallpaper)\s*(?:of|for|showing)?\s*(.*)$/i.exec(m) ||
    /\b(?:image|picture|draw|paint)\s+of\s+(.*)$/i.exec(m);
  if (img) {
    const subject = (img[1] || "").trim() || m;
    return { kind: "image", prompt: subject };
  }
  const vid = /\b(?:generate|make|create|render)\s+(?:me\s+)?(?:an?\s+)?(?:video|clip|animation)\s*(?:of|for|showing)?\s*(.*)$/i.exec(m);
  if (vid) {
    const subject = (vid[1] || "").trim() || m;
    return { kind: "video", prompt: subject };
  }
  return null;
}
