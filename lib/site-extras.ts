/**
 * Small features that belong to the site rather than to one component.
 *
 * These are all pure functions of their inputs so they can be tested directly.
 * Several are things that look trivial and are not: a "daily" pick that changes
 * at midnight UTC is a different day for someone in Adelaide, and a share link
 * with an unencoded title breaks the moment a game has an ampersand in it.
 */

/* ---------------- daily picks ---------------- */

/** A stable hash of a date string. Same day, same number, everywhere. */
export function hashDayKey(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * The local calendar day, as YYYY-MM-DD.
 *
 * Deliberately local, not UTC: a daily pick that flips at 9:30 in the morning
 * in Adelaide is a daily pick that changes mid-session. `toISOString` would do
 * exactly that.
 */
export function localDayKey(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** How far through the local day we are, 0 to 1. Used for a progress ring. */
export function dayProgress(date = new Date()): number {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const elapsed = date.getTime() - start;
  return Math.min(1, Math.max(0, elapsed / 86_400_000));
}

/** Three distinct picks for a day: the daily game, a staff pick, and a genre. */
export function dailyPicks<T>(pool: T[], genres: string[], date = new Date()): { game: T | null; genre: string | null; index: number; key: string } {
  const key = localDayKey(date);
  if (!pool.length) return { game: null, genre: null, index: -1, key };
  const index = hashDayKey(`game:${key}`) % pool.length;
  const genre = genres.length ? genres[hashDayKey(`genre:${key}`) % genres.length] : null;
  return { game: pool[index] ?? null, genre, index, key };
}

/* ---------------- share links ---------------- */

export type ShareTarget = { id: string; label: string; url: string };

/**
 * Share destinations for a page, with the title and URL encoded properly.
 *
 * Every one of these has the same trap: the title goes in a query string, so a
 * raw `&` or `#` in a game's name truncates the share text at best and produces
 * a broken link at worst. `encodeURIComponent` on the values and not on the
 * whole URL is the fix.
 */
export function shareTargets(title: string, url: string, note?: string): ShareTarget[] {
  const text = note ? `${note}` : title;
  return [
    { id: 'whatsapp', label: 'WhatsApp', url: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { id: 'telegram', label: 'Telegram', url: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { id: 'x', label: 'X', url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
    { id: 'reddit', label: 'Reddit', url: `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}` },
    { id: 'email', label: 'Email', url: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${url}`)}` },
  ];
}

/** A short, honest description of a path, for share blurbs. */
export function pathLabel(path: string): string {
  if (path === '/' || path === '') return 'the lounge';
  if (path.startsWith('/g/')) return `the ${path.slice(3).replace(/-/g, ' ')} page`;
  if (path.startsWith('/tools')) return 'the tools page';
  if (path === '/apps') return 'the apps page';
  if (path === '/proxy') return 'the proxy';
  if (path === '/gg-gpt') return 'GG-GPT';
  return `the ${path.replace(/^\//, '').replace(/-/g, ' ')} page`;
}

/* ---------------- catalogue helpers ---------------- */

export type CatalogEntry = {
  id: string;
  title: string;
  genre?: string;
  description?: string;
  tags?: string[];
  featured?: boolean;
};

/**
 * A short "why this one" line for a card.
 *
 * The point is to say something true rather than something flattering, so each
 * reason is derived from a fact about the entry rather than invented.
 */
export function whyThisGame(game: CatalogEntry, context: { playCount?: number; isRandom?: boolean; sameGenre?: number } = {}): string {
  if (context.isRandom) return 'Picked at random, so no algorithm can be blamed.';
  if (game.featured) return 'A featured pick this week.';
  if ((context.playCount ?? 0) >= 10) return 'Played a lot here — a safe bet.';
  if ((context.sameGenre ?? 0) >= 8) return `One of ${context.sameGenre} in ${game.genre || 'this category'}.`;
  if ((game.tags ?? []).length >= 3) return `Tagged ${game.tags!.slice(0, 3).join(', ')}.`;
  return 'Not many people have opened this one yet.';
}

/**
 * Sort a catalogue by how "safe" a recommendation is.
 *
 * Featured first, then played, then alphabetical — which is roughly the order a
 * person would pick in if they were being polite about it.
 */
export function recommendGames<T extends CatalogEntry>(games: T[], playCounts: Record<string, number>, limit = 6): T[] {
  return [...games]
    .map(game => ({
      game,
      score: (game.featured ? 100 : 0) + Math.min(50, playCounts[game.id] ?? 0) + (game.description ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title))
    .slice(0, limit)
    .map(entry => entry.game);
}

/** Games that share a genre, excluding the one you are looking at. */
export function similarGames<T extends CatalogEntry>(games: T[], current: T, limit = 4): T[] {
  const sameGenre = games.filter(game => game.id !== current.id && game.genre && game.genre === current.genre);
  const sharedTags = games.filter(game =>
    game.id !== current.id &&
    !sameGenre.includes(game) &&
    (game.tags ?? []).some(tag => (current.tags ?? []).includes(tag)),
  );
  return [...sameGenre, ...sharedTags].slice(0, limit);
}

/* ---------------- search helpers ---------------- */

/**
 * Parse a search box into a query plus operator terms.
 *
 * `genre:racing` is a filter; anything else is free text. This is the difference
 * between "search found nothing" and "search was asked for something that does
 * not exist", which is a bad experience to debug from a bug report.
 */
export function parseSearch(input: string): { text: string; genre: string | null; tag: string | null } {
  let text = input;
  let genre: string | null = null;
  let tag: string | null = null;
  const genreMatch = input.match(/(?:^|\s)genre:([\w-]+)/i);
  if (genreMatch) {
    genre = genreMatch[1].toLowerCase();
    text = text.replace(genreMatch[0], ' ');
  }
  const tagMatch = input.match(/(?:^|\s)tag:([\w-]+)/i);
  if (tagMatch) {
    tag = tagMatch[1].toLowerCase();
    text = text.replace(tagMatch[0], ' ');
  }
  return { text: text.trim().replace(/\s+/g, ' '), genre, tag };
}

/** The suggestion to offer when a search returns nothing. */
export function noResultsHint(query: string, genres: string[]): string {
  if (!query.trim()) return 'Nothing matches an empty search.';
  const nearGenre = genres.find(genre => genre.toLowerCase().startsWith(query.trim().toLowerCase().slice(0, 3)));
  if (nearGenre) return `No title matches “${query}”, but there is a ${nearGenre} category.`;
  return `No title matches “${query}”. Try a shorter word, or clear the filters.`;
}

/* ---------------- stats for the page ---------------- */

/** Count games by genre, largest first. */
export function genreCounts<T extends { genre?: string }>(games: T[]): { genre: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const game of games) {
    const genre = game.genre || 'Other';
    counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
}

/** Average title length, used to flag a suspiciously uniform catalogue. */
export function averageTitleLength<T extends { title: string }>(games: T[]): number {
  if (!games.length) return 0;
  return games.reduce((sum, game) => sum + game.title.length, 0) / games.length;
}

/** Titles that start with a numeral or a bracket, which is a data-entry smell. */
export function suspiciousTitles<T extends { title: string }>(games: T[]): T[] {
  return games.filter(game => /^[\d[\](){}#*]/.test(game.title.trim()));
}

/** A rough duration estimate, in minutes, for a genre. */
export function estimatedSessionMinutes(genre?: string): number {
  const table: Record<string, number> = {
    Action: 8, Racing: 6, Puzzle: 12, Sports: 10, Strategy: 20, '.io': 5,
    Shooter: 7, Clicker: 15, Adventure: 18, Arcade: 6, Idle: 20, Simulation: 15,
  };
  return table[genre ?? ''] ?? 10;
}

/* ---------------- keyboard tips ---------------- */

/** A rotating tip, so the empty state is not always the same sentence. */
export const SITE_TIPS = [
  'Press / to jump to the search box from anywhere on the page.',
  'Shift+Alt+K opens the command palette — everything on this page is in there.',
  'Shift+? shows every keyboard shortcut at once.',
  'Your favourites, streak and play counts survive a deploy — they are saved to your account, not the cache.',
  'The tools page has a QR generator, a calculator and 98 other things that run in your browser.',
  'Shift+Alt+V flips between light and dark.',
  'Everything in the catalogue is self-hosted, so nothing here loads from someone else\'s CDN.',
];

export function tipOfTheDay(date = new Date()): string {
  return SITE_TIPS[hashDayKey(`tip:${localDayKey(date)}`) % SITE_TIPS.length];
}

/* ---------------- offline helpers ---------------- */

/**
 * A cache-first decision for a request.
 *
 * The point of this function existing is that the rule was spread across the
 * service worker in three slightly different forms. One place, one answer:
 * documents are network-first so a deploy is picked up, assets are cache-first
 * because they are immutable, and API calls are never cached.
 */
export function cacheStrategy(pathname: string): 'network-first' | 'cache-first' | 'network-only' {
  if (pathname.startsWith('/api/')) return 'network-only';
  if (pathname.startsWith('/_next/static/') || /\.(png|jpg|jpeg|webp|gif|svg|woff2?|mp3|ogg|wav|glb|unityweb|wasm|data|js|css)$/i.test(pathname)) {
    return 'cache-first';
  }
  return 'network-first';
}
