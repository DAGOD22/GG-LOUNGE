/**
 * GG-GPT's persona, personalisation and prompt assembly.
 *
 * "Remembers across chats" and "personalised" are the two requirements that are
 * easiest to fake and most obvious when faked, so they are real here: the
 * account's saved facts and a compact profile are injected into every request,
 * and every exchange is scanned for durable facts worth keeping.
 */
import type { GgMemory } from "@/lib/db/gg-gpt";
import { clockLine } from "./clock";

export interface GgProfile {
  username?: string | null;
  /** Games they actually play, most played first. */
  topGames?: string[];
  favoriteIds?: string[];
  theme?: string | null;
  /** How long they have had the account, for a bit of warmth. */
  memberSince?: string | null;
}

export interface PromptContext {
  profile: GgProfile;
  memories: GgMemory[];
  now: Date;
  /** Extra system notes from tools, e.g. "search results follow". */
  notes?: string[];
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { profile, memories, now, notes } = ctx;
  const name = profile.username ? profile.username : null;
  const lines: string[] = [];

  lines.push(
    "You are GG-GPT, the assistant built into GG-LOUNGE — a browser game arcade with 250+ playable games.",
    "",
    "## How to write",
    "- Answer the question first, in the first sentence. Then explain if it needs explaining.",
    "- Be direct and warm, like a smart friend. No filler, no \"As an AI language model\", no restating the question.",
    "- Match length to the question: a quick question gets a sentence, a real question gets structure.",
    "- Use Markdown properly: short paragraphs, `-` bullets, `**bold**` for the key term, fenced code blocks with a language tag.",
    "- Never pad. If the answer is one line, write one line.",
    "- Do not open with 'Sure!' / 'Of course!' / 'Great question' — start with the answer.",
    "- When live data is supplied below, use those exact numbers and name the source in a clause. Never contradict them with your own guess.",
    "- Never invent a game that is not in the catalogue, and never invent a URL.",
    "- If you do not know, say so in one clause and say what you do know. Never invent a fact, a source, a URL, or a date.",
    "",
    "## What you can do",
    "- Search the web. When results are supplied below, use them and cite the URLs you actually relied on.",
    "- Generate images and short videos. Offer this when a picture would genuinely help.",
    "- Look up live data: weather, exchange rates, crypto prices, definitions, unit conversions.",
    "- Recommend real games from this site's catalogue — by name, and only ones that exist.",
    "",
    "## This site",
    "- Games live at /games, and each one has its own control legend.",
    "- Accounts save game progress, achievements and this conversation.",
    `- ${clockLine(now)}`,
  );

  if (name) {
    lines.push("", `## Who you are talking to`, `Their username is ${name}.`);
  } else {
    lines.push("", "## Who you are talking to", "They are not signed in, so you have no profile for them. Do not pretend otherwise.");
  }

  if (profile.memberSince) {
    lines.push(`They joined GG-LOUNGE on ${profile.memberSince.slice(0, 10)}.`);
  }
  if (profile.topGames?.length) {
    lines.push(`Games they play most: ${profile.topGames.slice(0, 6).join(", ")}.`);
  }
  if (profile.favoriteIds?.length) {
    lines.push(`They have favourited: ${profile.favoriteIds.slice(0, 8).join(", ")}.`);
  }

  if (memories.length) {
    lines.push(
      "",
      "## What you remember about them",
      "From earlier conversations. Use these naturally when relevant — do not recite the list, and do not mention that you keep notes.",
      ...memories.slice(0, 40).map(m => `- ${m.fact}`),
      "",
      "These are the only memories you have. If they ask what you remember, answer from this list and nothing else.",
    );
  }

  if (notes?.length) {
    lines.push("", "## Live data for this message", ...notes);
  }

  return lines.join("\n");
}

/**
 * Pull durable facts out of a user message. Deliberately conservative: only
 * explicit self-disclosure is kept, because a wrong memory is worse than none.
 */
const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string, number?]> = [
  [/\b(?:my name is|call me|i go by) ([A-Z][\w'-]{1,20})\b/i, m => `Their name is ${m[1]}.`, 2],
  [/\bi'?m (\d{1,2}) (?:years old|yo)\b/i, m => `They are ${m[1]} years old.`, 1],
  [/\bi (?:live|am based) in ([A-Z][\w\s,'-]{2,40})/i, m => `They live in ${m[1].trim()}.`],
  [/\bi'?m from ([A-Z][\w\s,'-]{2,40})/i, m => `They are from ${m[1].trim()}.`],
  // Capture the whole "favourite game is X" so the durability check sees the
  // thing disclosed, not the word "game".
  [/\bmy fav(?:ou)?rite (?:game|colour|color|food|band|movie|film|show|animal|genre) is ([^.!?\n]{2,50})/i,
    m => `Their favourite is ${m[1].trim()}.`, 2],
  [/\bi (?:study|major in) ([^.!?\n]{2,50})/i, m => `They study ${m[1].trim()}.`],
  [/\bi work (?:at|for) ([^.!?\n]{2,50})/i, m => `They work at ${m[1].trim()}.`],
  [/\b(?:remember|don't forget|keep in mind) (?:that )?([^.!?\n]{4,120})/i, m => m[1].trim()],
  // "I play <a real game>" is worth keeping; "I play basketball" is not durable.
  [/\bi (?:really )?play (?:a lot of |lots of )?([^.!?\n]{2,50})/i, m => `They play ${m[1].trim()}.`],
];

/**
 * Phrases that look like self-disclosure but are conversational filler. A wrong
 * memory is worse than no memory: it gets injected into every future answer and
 * is very hard for the user to notice, let alone fix.
 */
const FILLER = [
  /^(?:a|an|the)\s+(?:question|bit|lot|little|feeling|moment|minute|second|while|point|clue|look|go|try|guess|chance|break|plane|train|bus|test|theory|hunch|problem|issue)\b/i,
  /^(?:bit|little|lot|moment|while|question)\b/i,
  /^(how|why|when|where|who|which|if|whether|that)\b/i,
  /\b(please|quickly|tonight|right now|already)\b/i,
];

function isDurable(fact: string, minLength = 6): boolean {
  if (fact.length < minLength || fact.length > 200) return false;
  if (FILLER.some(re => re.test(fact))) return false;
  // A memory should not end in a question mark or read like a request.
  if (/[?]$/.test(fact)) return false;
  return true;
}

export function extractFacts(message: string): string[] {
  const found = new Set<string>();
  for (const [re, build, minLength] of PATTERNS) {
    const m = message.match(re);
    if (!m) continue;
    const fact = build(m).replace(/\s+/g, " ").trim();
    // Test the captured *content*: m[0] is the whole match, m[1] the first
    // group, which is the thing the user actually disclosed.
    const captured = (m[1] ?? "").trim();
    if (captured && isDurable(captured, minLength) && fact.length < 240) found.add(fact);
  }
  return [...found];
}

/** Should the title of the chat change? Only from the first exchange. */
export function shouldRetitle(messageCount: number): boolean {
  return messageCount <= 2;
}
