/**
 * A small answer cache for GG-GPT.
 *
 * Many questions are the same question: "what's the weather in Adelaide" from
 * twelve people, "define serendipity", the same search from two tabs. Going to
 * a model for the second one is pure waste — it costs seconds of latency and a
 * unit of a free quota.
 *
 * Design notes:
 *   · keyed on the normalised message plus the facts that would change the
 *     answer (tool notes), never on anything user-specific
 *   · bounded, so a hot deployment cannot leak memory
 *   · TTL'd, because day-old weather is worse than no weather
 *   · per-instance. This is deliberately not a database: a miss is cheap.
 */

interface Entry {
  text: string;
  provider: string;
  expires: number;
}

const MAX = 300;
const cache = new Map<string, Entry>();

/** Strip what does not change the answer, so trivial variations hit. */
function normalise(message: string): string {
  return message
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[?!.]+$/g, "")
    .trim();
}

function key(message: string, notes: string[]): string {
  return `${normalise(message)}||${notes.join("|").slice(0, 400)}`;
}

export function cacheGet(message: string, notes: string[]): { text: string; provider: string } | null {
  const k = key(message, notes);
  const hit = cache.get(k);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(k);
    return null;
  }
  return { text: hit.text, provider: hit.provider };
}

export function cacheSet(
  message: string,
  notes: string[],
  text: string,
  provider: string,
  ttlMs = 10 * 60_000,
): void {
  // Never cache an apology or an empty answer: the next attempt may succeed.
  if (!text.trim() || provider === "offline" || provider === "none") return;
  if (cache.size >= MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key(message, notes), { text, provider, expires: Date.now() + ttlMs });
}

/** Exposed for diagnostics and tests. */
export function cacheSize(): number {
  return cache.size;
}

export function cacheClear(): void {
  cache.clear();
}
