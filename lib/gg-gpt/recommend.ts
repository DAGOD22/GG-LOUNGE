/**
 * Game recommendations that are actually recommendations.
 *
 * "What should I play?" is the question this assistant should answer better
 * than any chatbot, because it knows something no chatbot does: what this
 * person has actually played. Telling someone who has logged twelve hours of
 * Doom that they "might enjoy a first-person shooter" is worse than useless.
 *
 * The approach is deliberately simple and explainable — genre/tone affinity
 * plus a novelty rule — because a recommendation the user cannot understand is
 * one they will not trust:
 *
 *   · affinity comes from what they play and favourite
 *   · never recommend something they already play a lot of
 *   · break ties toward things they have not touched at all
 *   · always say *why*, in one clause
 */

import type { CatalogueEntry } from "./tools";

export interface PlaySignal {
  playCounts: Record<string, number>;
  favorites: string[];
  recentlyPlayed: string[];
}

export interface Pick {
  id: string;
  title: string;
  genre: string;
  tone: string;
  reason: string;
}

export interface Recommendation {
  picks: Pick[];
  /** What the profile looks like, in words, so the UI and prompt can explain. */
  summary: string;
}

/** Split a free-text request into meaning-bearing words. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

const STOP = new Set([
  "what", "should", "play", "tonight", "recommend", "suggest", "game", "games",
  "something", "anything", "good", "best", "the", "for", "and", "you", "any",
  "want", "like", "similar", "find", "give", "me", "some", "please", "with",
  "have", "this", "that", "from", "here", "can", "could", "would", "about",
]);

/** Words in the request that describe a mood rather than a genre. */
const MOODS: Record<string, string[]> = {
  relax: ["puzzle", "sandbox", "arcade"],
  relaxing: ["puzzle", "sandbox", "arcade"],
  chill: ["puzzle", "sandbox", "arcade"],
  calm: ["puzzle", "sandbox"],
  cozy: ["puzzle", "sandbox"],
  quick: ["arcade", "puzzle"],
  short: ["arcade"],
  fast: ["shooter", "arcade", "racing"],
  action: ["shooter", "arcade", "action"],
  scary: ["horror"],
  scarys: ["horror"],
  hard: ["shooter", "platformer", "strategy"],
  challenging: ["shooter", "platformer", "strategy"],
  think: ["strategy", "puzzle"],
  thinking: ["strategy", "puzzle"],
  brain: ["puzzle", "strategy"],
  build: ["sandbox", "strategy"],
  building: ["sandbox", "strategy"],
  retro: ["arcade", "platformer", "shooter"],
  classic: ["arcade", "shooter", "platformer"],
  nostalgic: ["arcade", "platformer"],
  story: ["rpg", "platformer"],
  adventure: ["rpg", "sandbox"],
  competitive: ["shooter", "racing", "strategy"],
  shoot: ["shooter"],
  shooting: ["shooter"],
  fight: ["action", "rpg"],
  fightings: ["action"],
};

export function recommend(
  request: string,
  catalogue: CatalogueEntry[],
  signal?: PlaySignal | null,
  limit = 4,
): Recommendation {
  const asked = words(request).filter(w => !STOP.has(w));

  const played = signal?.playCounts ?? {};
  const favorites = new Set(signal?.favorites ?? []);
  const recent = new Set(signal?.recentlyPlayed ?? []);

  /* ---- build the taste profile from what they actually did ---- */
  const genreScore = new Map<string, number>();
  const toneScore = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string, n: number) => {
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + n);
  };

  for (const g of catalogue) {
    const count = played[g.id] ?? 0;
    if (count > 0) {
      // Log-ish weighting: the tenth hour of a game says less than the first.
      const weight = Math.min(6, Math.log2(count + 1) + 0.5);
      bump(genreScore, g.genre, weight);
      bump(toneScore, g.tone, weight);
    }
    if (favorites.has(g.id)) {
      bump(genreScore, g.genre, 2);
      bump(toneScore, g.tone, 2);
    }
  }

  /* ---- fold the request into the profile ---- */
  const wanted = new Set<string>();
  for (const w of asked) {
    if (MOODS[w]) MOODS[w].forEach(g => wanted.add(g));
    // A genre named outright counts double: "a racing game" is explicit.
    for (const g of catalogue) {
      if (!g.genre) continue;
      if (g.genre.toLowerCase() === w) wanted.add(g.genre.toLowerCase());
    }
  }

  const reasonsFor = (g: CatalogueEntry, matchedMood: string | null): string[] => {
    const reasons: string[] = [];
    const genreWeight = genreScore.get(g.genre) ?? 0;
    if (genreWeight > 2) reasons.push(`you play a lot of ${g.genre.toLowerCase()}`);
    const toneWeight = toneScore.get(g.tone) ?? 0;
    if (toneWeight > 3 && !reasons.length) reasons.push(`same ${g.tone.toLowerCase()} feel as your favourites`);
    if (matchedMood) reasons.push(`you asked for ${matchedMood}`);
    if (favorites.has(g.id)) reasons.push("already in your favourites");
    return reasons;
  };

  /* ---- score every game ---- */
  const scored = catalogue.map(g => {
    let score = 0;
    const moodHit = [...wanted].find(w => g.genre.toLowerCase() === w) ?? null;
    // An explicit request outranks history: someone asking for something
    // relaxing does not want another shooter because they play shooters.
    if (moodHit) score += 14;
    // ...and anything outside the requested mood is demoted rather than banned,
    // so a thin catalogue still returns something sensible.
    else if (wanted.size) score -= 4;

    score += (genreScore.get(g.genre) ?? 0) * 1.4;
    score += (toneScore.get(g.tone) ?? 0) * 0.8;

    // Direct word overlap with the title/description, so "voxel" or "dungeon"
    // in the request can surface a specific game.
    const haystack = `${g.title} ${g.genre} ${g.tone} ${g.description}`.toLowerCase();
    for (const w of asked) if (haystack.includes(w)) score += 1.5;

    // Novelty: don't recommend what they already play, prefer the untouched.
    const count = played[g.id] ?? 0;
    if (count >= 3) score -= 12;
    else if (count > 0) score -= 4;
    if (recent.has(g.id)) score -= 2;
    if (favorites.has(g.id)) score -= 1;
    // Small tie-breaker so the list is stable rather than random.
    score += (g.title.charCodeAt(0) % 7) / 100;

    return { g, score, moodHit };
  });

  scored.sort((a, b) => b.score - a.score);
  const picks: Pick[] = scored.slice(0, limit).map(({ g, moodHit }) => {
    const reasons = reasonsFor(g, moodHit ? g.genre.toLowerCase() : null);
    return {
      id: g.id,
      title: g.title,
      genre: g.genre,
      tone: g.tone,
      reason: reasons.length ? reasons.join(", ") : "a good place to start",
    };
  });

  /* ---- describe the profile ---- */
  const topGenres = [...genreScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
  const summary = topGenres.length
    ? `They lean toward ${topGenres.join(" and ").toLowerCase()}${wanted.size ? `, and asked for ${[...wanted].join("/")}` : ""}.`
    : wanted.size
      ? `No play history yet; they asked for ${[...wanted].join("/")}.`
      : "No play history yet, so recommend a spread of genres.";

  return { picks, summary };
}

/** One-line text for the model, and for a user who just wants the answer. */
export function renderRecommendation(r: Recommendation): string {
  return r.picks.map(p => `- **${p.title}** — ${p.genre}/${p.tone} — /g/${p.id} (${p.reason})`).join("\n");
}
