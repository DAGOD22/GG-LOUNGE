/**
 * The parts that make GG-GPT feel smarter than a thin wrapper around a model.
 *
 * The honest constraint: the model available on a free tier is a small one, and
 * no amount of prompt-tuning makes a 20B model reason like a frontier model.
 * What *does* close the gap is everything around it — deciding what to look up
 * before answering, knowing what it is allowed to claim, checking its own output
 * before it is sent, and having capabilities that do not need a model at all.
 *
 * That is what lives here:
 *
 *   plan()            decide which tools a question needs, before generating
 *   critiqueAnswer()  catch the failure modes this model actually has
 *   profileBrief()    say something about the user only because it is true
 *   sessionContext()  multi-turn aware follow-ups ("and tomorrow?" …)
 */

import type { Intent } from "./intent";

/* ------------------------------------------------------------------ *
 * 1. Planning: work out what to look up before writing anything.
 * ------------------------------------------------------------------ */

export interface PlanStep {
  tool: string;
  reason: string;
}

export interface StepPlan {
  steps: PlanStep[];
  /** The one-line "here's what I'm doing" shown while tools run. */
  narrative: string;
  /** True when the answer is worth a second model pass. */
  needsVerification: boolean;
}

/**
 * A plan is not a chain of thought — it is the list of facts the answer will be
 * built from. Naming them first is what stops the model free-styling a date or
 * a launch name it does not have.
 */
export function plan(intent: Intent, message: string): StepPlan {
  const steps: PlanStep[] = [];
  const lower = message.toLowerCase();

  if (intent.math) steps.push({ tool: "arithmetic", reason: "calculated exactly rather than generated" });
  if (intent.clock) steps.push({ tool: "clock", reason: "the model cannot know the current time" });
  if (intent.weather) steps.push({ tool: "weather", reason: "live conditions, not seasonal averages" });
  if (intent.currency) steps.push({ tool: "currency", reason: "rates move daily" });
  if (intent.crypto) steps.push({ tool: "crypto", reason: "prices move by the minute" });
  if (intent.unit) steps.push({ tool: "conversion", reason: "exact arithmetic beats recall" });
  if (intent.topic) steps.push({ tool: "encyclopedia", reason: "a sourced definition beats a memory" });
  if (intent.catalogue) steps.push({ tool: "catalogue", reason: "only recommend games that exist here" });
  if (intent.define) steps.push({ tool: "dictionary", reason: "dictionary wording, not paraphrase" });
  if (intent.search) steps.push({ tool: "search", reason: "this depends on information after training" });
  if (intent.image) steps.push({ tool: "image", reason: "render rather than describe" });
  if (intent.video) steps.push({ tool: "video", reason: "keyframes plus camera moves" });

  const narrative = steps.length
    ? `Checking ${steps.map(s => s.tool).join(", ")}.`
    : "Answering from what I already know.";

  // Only answers that assert facts about the world outside this site are worth
  // a verification pass; a recommendation or a calculation is already exact.
  const needsVerification =
    !intent.math && !intent.clock && !intent.catalogue && !intent.unit &&
    !intent.image && !intent.video && (Boolean(intent.search) || Boolean(intent.topic) || lower.length > 120);

  return { steps, narrative, needsVerification };
}

/* ------------------------------------------------------------------ *
 * 2. Self-critique: the failure modes this model actually has.
 * ------------------------------------------------------------------ */

export interface Critique {
  issues: string[];
  /** A corrected answer, when the fix is mechanical and safe. */
  repaired: string | null;
}

const HEDGES = [
  /\bi (?:am|'m) (?:just )?an? (?:ai|language model)\b/i,
  /\bas an ai\b/i,
  /\bi (?:cannot|can't|don't) (?:have|access|browse|know)\b/i,
  /\bi hope this helps\b/i,
  /\bfeel free to ask\b/i,
  /\b(?:sure|certainly|of course)[!,.]/i,
  /\bgreat question\b/i,
];

/**
 * Read the answer the way a picky editor would, and fix what is mechanically
 * fixable. Deliberately conservative: anything that needs judgement is reported,
 * not rewritten, because a silently mangled answer is worse than a flagged one.
 */
export function critiqueAnswer(text: string, opts: { hasLiveData: boolean; askedForLive: boolean }): Critique {
  const issues: string[] = [];
  let out = text;

  // Hedging openers are the single most common tell of a small model.
  for (const re of HEDGES) {
    if (re.test(out)) {
      issues.push("opens with hedging boilerplate");
      break;
    }
  }

  // "I can't access live data" while live data was supplied is a contradiction.
  if (opts.hasLiveData && /\bi (?:cannot|can't|don'?t) (?:have|access|see|get)\b[^.]{0,40}(?:live|real-?time|current)\b/i.test(out)) {
    issues.push("denies having data it was given");
  }
  if (opts.askedForLive && !opts.hasLiveData && /\b(?:currently|right now|today) (?:it is|it's|the \w+ is)\b/i.test(out) && !/\bcould not\b|\bcan't\b|\bunable\b/i.test(out)) {
    issues.push("asserts live values it was not given");
  }

  // Empty answers.
  if (!out.trim()) issues.push("empty answer");

  // A trailing "let me know if…" on a one-line answer is padding.
  const trimmed = out
    .replace(/\n*(?:let me know if|feel free to (?:ask|reach out))[^.!?]*[.!?]?\s*$/i, "")
    .replace(/^(?:sure|certainly|of course)[!,.]\s*/i, "")
    .replace(/\bi hope (?:this|that) helps[.!]?\s*$/i, "")
    .trim();

  if (trimmed !== out && trimmed.length > 0) {
    issues.push("trailing filler removed");
    out = trimmed;
  }

  // Capitalise the first letter after a hedge was stripped.
  out = out.charAt(0).toUpperCase() + out.slice(1);

  return { issues, repaired: out !== text ? out : null };
}

/* ------------------------------------------------------------------ *
 * 3. Personal profile line: true, or absent.
 * ------------------------------------------------------------------ */

export interface ProfileFacts {
  username?: string | null;
  memberSince?: string | null;
  topGames?: string[];
  favoriteIds?: string[];
  playCounts?: Record<string, number>;
}

export function profileBrief(facts: ProfileFacts, titles: (id: string) => string): string | null {
  const bits: string[] = [];
  const top = (facts.topGames ?? []).slice(0, 3).map(titles).filter(Boolean);
  if (top.length) {
    bits.push(`most played: ${top.join(", ")}`);
  }
  if (facts.memberSince) {
    const days = Math.floor((Date.now() - new Date(facts.memberSince).getTime()) / 86_400_000);
    if (days > 1) bits.push(`member for ${days} days`);
  }
  const plays = Object.values(facts.playCounts ?? {}).reduce((a, b) => a + b, 0);
  if (plays > 0) bits.push(`${plays} launches logged`);
  if (!bits.length) return null;
  return bits.join(" · ");
}

/* ------------------------------------------------------------------ *
 * 4. Follow-ups: "and tomorrow?" needs the previous turn's subject.
 * ------------------------------------------------------------------ */

const FOLLOW_UP = /^(?:and|what about|how about|ok(?:ay)? and|then|same (?:for|but)|also)\b/i;

export interface FollowUp {
  isFollowUp: boolean;
  /** The subject carried over from the previous user turn. */
  subject: string | null;
}

/**
 * A one-word follow-up used to be treated as a new question, so "and tomorrow?"
 * after a weather answer got a generic reply. Carry the previous subject
 * forward when the message is obviously a continuation and has no subject of
 * its own.
 */
export function followUp(message: string, previousUser?: string | null): FollowUp {
  const isFollowUp = FOLLOW_UP.test(message.trim()) || message.trim().split(/\s+/).length <= 2;
  if (!isFollowUp || !previousUser) return { isFollowUp: false, subject: null };

  // Extract the noun-ish core of the previous question: everything after the
  // question word, minus stopwords. Good enough to re-ask, not to reconstruct.
  const subject = previousUser
    .replace(/^(?:what|who|when|where|why|how|is|are|was|were|can|could|tell me|show me)\b/i, "")
    .replace(/\b(?:the|a|an|of|in|on|at|to|for|about|please|me|is|are|it)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (subject.length < 3) return { isFollowUp: false, subject: null };
  return { isFollowUp: true, subject };
}

/** Merge a follow-up into a self-contained question. */
export function mergeFollowUp(message: string, subject: string): string {
  const clean = message.trim().replace(/\b(?:and|what about|how about|then)\b/i, "").trim();
  if (!clean) return subject;
  return `${subject} — ${clean}`;
}
