/**
 * One source of truth for every URL the lounge actually serves.
 *
 * The /secret-link-doc page is generated from this module rather than being a
 * hand-written list, because a hand-written list of 250 games is wrong the day
 * anyone adds a game. Add a title to `lib/games.ts` and it appears here with a
 * landing page, a player link and its raw file in the right category, with no
 * second edit.
 *
 * Categories are the same ones the library's filter row uses, in the same
 * order, so the doc and the site cannot disagree about what "Idle" means. Every
 * genre that is *not* in that filter row falls into one Misc group at the end,
 * which is where the odd one-off shooter or sports game belongs instead of
 * pretending it fills a shelf of its own.
 */

import { games, filters, type Game } from './games';
import { apps, appLaunchUrl } from './apps';
import { CANONICAL_HOST, SITE_DOMAINS } from './site-domains';

/**
 * The origin every absolute URL on this page is built from.
 *
 * It defaults to the canonical host declared in ./site-domains, so the domain
 * list and the URLs it describes cannot disagree. An env override still wins,
 * because a self-hosted copy has a different real origin.
 */
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL || `https://${CANONICAL_HOST}`;

/** Filter-row categories, in the order the site shows them. */
export const DOC_CATEGORIES = filters.filter(f => f !== 'All games' && f !== 'Favorites');

export const MISC_KEY = 'Misc';

const CATEGORY_BLURBS: Record<string, string> = {
  Idle: 'Numbers go up. These keep running while you think about homework.',
  Arcade: 'The big shelf — one-more-run games you can finish in a lunch break.',
  Puzzle: 'Thinking games: match, sort, slide and occasionally get trolled.',
  Racing: 'Drift, flip and crash. Most of these are physics first, racing second.',
  Platformer: 'Jumping, wall-jumping and the occasional unforgivable spike.',
  Simulation: 'Restaurants, cities, ducks. Management without the real stakes.',
  Sandbox: 'Open worlds and building toys — nothing here tells you what to do.',
  Community: 'Needs other people. Grab a friend or a classmate.',
  Battle: 'Multiplayer shooters and brawlers. Most run through the proxy.',
  Misc: 'The random shelf: shooters, strategy, sports and anything that does not fit the tabs above. Everything here is a one-off genre, so it gets one line.',
};

export type GameDoc = {
  id: string;
  title: string;
  genre: string;
  tone: string;
  /** SEO landing page — the URL worth sharing or pasting into a chat. */
  landing: string;
  /** Opens the lounge with that game already running. */
  play: string;
  /** Chrome-free player; what a copied game link resolves to. */
  player: string;
  /** The game's own files, straight off the CDN. */
  raw: string;
  proxied: boolean;
};

export type GameGroup = {
  key: string;
  label: string;
  blurb: string;
  games: GameDoc[];
};

export function gameDoc(game: Game): GameDoc {
  const id = encodeURIComponent(game.id);
  return {
    id: game.id,
    title: game.title,
    genre: game.genre,
    tone: game.tone,
    landing: `/g/${id}`,
    play: `/?game=${id}`,
    player: `/play/${id}`,
    raw: game.path,
    proxied: Boolean(game.proxy),
  };
}

/**
 * Every playable title, bucketed by the shelf it belongs to.
 *
 * `games` is already deduped and filtered to titles whose files actually exist,
 * so this cannot advertise a link that 404s.
 */
export function gameGroups(): GameGroup[] {
  const buckets = new Map<string, GameDoc[]>();
  for (const game of games) {
    const key = DOC_CATEGORIES.includes(game.genre) ? game.genre : MISC_KEY;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(gameDoc(game));
    else buckets.set(key, [gameDoc(game)]);
  }

  const order = [...DOC_CATEGORIES, MISC_KEY];
  return order
    .filter(key => buckets.has(key))
    .map(key => ({
      key,
      label: key,
      blurb: CATEGORY_BLURBS[key] ?? '',
      games: buckets.get(key) ?? [],
    }));
}

export type DocLink = { label: string; href: string; note?: string };
export type DocSection = { key: string; label: string; blurb: string; links: DocLink[] };

/** The pages a person actually wants: the lounge itself and its few satellites. */
export function sitePages(): DocSection {
  return {
    key: 'pages',
    label: 'The lounge',
    blurb: 'Start here. These are the doors into the site, and the ones worth sending to someone.',
    links: [
      { label: 'Library', href: '/', note: 'The whole catalogue, 250 titles' },
      { label: 'Apps', href: '/apps', note: 'Ten sites that open through the proxy' },
      { label: 'Proxy', href: '/proxy', note: 'Type any address and browse it' },
      { label: 'YouTube', href: '/youtube', note: 'Video player with same-origin media' },
      { label: 'GG-GPT', href: '/gg-gpt', note: 'Games assistant' },
      { label: 'Tools', href: '/tools', note: '100 browser utilities: QR, calculator, converters' },
      { label: 'Request a game', href: '/request-game', note: 'Ask for a title, or report a broken one' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Health', href: '/api/health', note: 'JSON: database, proxy and build status' },
      { label: 'Link directory (this page)', href: '/secret-link-doc', note: 'Unlisted — no nav entry' },
    ],
  };
}

/** The app launchers, as proxy URLs rather than bare destinations. */
export function appLinks(): DocSection {
  return {
    key: 'apps',
    label: 'App launchers',
    blurb: 'Each one is the launcher URL, already encoded. The destination is in the note so you know what it opens.',
    links: apps.map(app => ({
      label: app.title,
      href: app.id === 'youtube' ? '/youtube' : appLaunchUrl(app.url),
      note: app.id === 'youtube' ? 'Native player, not the proxy' : app.url,
    })),
  };
}

/**
 * The plumbing. Listed because the request was for every URL, not because any
 * of it should be shared — most of these only answer to the site itself.
 */
export function internalRoutes(): DocSection {
  return {
    key: 'internal',
    label: 'Routes and endpoints',
    blurb: 'Everything the app exposes, including the parts you should not paste anywhere. Internal surfaces are marked.',
    links: [
      { label: '/admin', href: '/admin', note: 'Internal — moderation console' },
      { label: '/gate', href: '/gate', note: 'Internal — disabled, redirects home' },
      { label: '/banned', href: '/banned', note: 'Internal — ban screen' },
      { label: '/service/[[...path]]', href: '/service/', note: 'Internal — legacy proxy links, rewritten to /proxy' },
      { label: '/browse/[[...path]]', href: '/browse/', note: 'Internal — proxy bookmark fallback' },
      { label: '/games/[id]', href: '/games/doom-js13k', note: 'Internal — raw game HTML, one per title' },
      { label: '/uv/uv.config.js', href: '/uv/uv.config.js', note: 'Internal — generated proxy config' },
      { label: '/api/games', href: '/api/games', note: 'Internal — catalogue JSON' },
      { label: '/api/games/search', href: '/api/games/search?q=slope', note: 'Internal — search JSON' },
      { label: '/api/game-stats', href: '/api/game-stats', note: 'Internal — play counts' },
      { label: '/api/game-requests', href: '/api/game-requests', note: 'Internal — requests and votes' },
      { label: '/api/game-requests/[id]/upvote', href: '/api/game-requests', note: 'Internal — POST only' },
      { label: '/api/leaderboard', href: '/api/leaderboard', note: 'Internal' },
      { label: '/api/history/[[...rest]]', href: '/api/history', note: 'Internal' },
      { label: '/api/user-state', href: '/api/user-state', note: 'Internal' },
      { label: '/api/user-state/token', href: '/api/user-state/token', note: 'Internal — guest token minting' },
      { label: '/api/save/[gameId]', href: '/api/save/list', note: 'Internal — cloud saves' },
      { label: '/api/achievements', href: '/api/achievements', note: 'Internal' },
      { label: '/api/achievements/stats', href: '/api/achievements/stats', note: 'Internal' },
      { label: '/api/lbr-account', href: '/api/lbr-account', note: 'Internal — Leaf Blower cloud saves' },
      { label: '/api/proxy/config', href: '/api/proxy/config', note: 'Internal — proxy transport config' },
      { label: '/api/wisp', href: '/api/wisp', note: 'Internal — Wisp websocket' },
      { label: '/api/bare/[[...rest]]', href: '/api/bare/', note: 'Internal — Bare transport' },
      { label: '/api/yt/[...path]', href: '/api/yt/status', note: 'Internal — YouTube metadata' },
      { label: '/api/yt/media', href: '/api/yt/media', note: 'Internal — video bytes' },
      { label: '/api/yt/img', href: '/api/yt/img', note: 'Internal — thumbnails' },
      { label: '/api/visit', href: '/api/visit', note: 'Internal — page views' },
      { label: '/api/report', href: '/api/report', note: 'Internal — report a broken game' },
      { label: '/api/uploads', href: '/api/uploads', note: 'Internal' },
      { label: '/api/search', href: '/api/search', note: 'Internal' },
      { label: '/api/gate', href: '/api/gate', note: 'Internal — gate state' },
      { label: '/api/gate/verify', href: '/api/gate/verify', note: 'Internal' },
      { label: '/api/admin', href: '/api/admin', note: 'Internal — admin only' },
      { label: '/api/admin/preview', href: '/api/admin/preview', note: 'Internal — admin only' },
      { label: '/api/auth/login', href: '/api/auth/me', note: 'Internal — GET me, POST login/register/logout/reset' },
      { label: '/api/auth/me', href: '/api/auth/me', note: 'Internal' },
      { label: '/api/health', href: '/api/health', note: 'Internal' },
      { label: '/api/gg-gpt', href: '/api/gg-gpt', note: 'Internal — chat endpoint' },
      { label: '/api/gg-gpt/diag', href: '/api/gg-gpt/diag', note: 'Internal — self-test, token gated' },
      { label: '/api/edu/[[...rest]]', href: '/api/edu/', note: 'Internal — proxied fetch' },
      { label: '/api/learn/[[...rest]]', href: '/api/learn/', note: 'Internal' },
      { label: '/api/math/[[...rest]]', href: '/api/math/', note: 'Internal' },
      { label: '/api/science/[[...rest]]', href: '/api/science/', note: 'Internal' },
      { label: '/api/english/[[...rest]]', href: '/api/english/', note: 'Internal' },
      { label: '/api/t/[[...rest]]', href: '/api/t/', note: 'Internal — transport' },
    ],
  };
}

/** Files that live in `public/` and are served as-is. */
export function staticAssets(): DocSection {
  return {
    key: 'static',
    label: 'Files and machine endpoints',
    blurb: 'No HTML, no navigation — these are what crawlers, browsers and the proxy actually fetch.',
    links: [
      { label: '/sitemap.xml', href: '/sitemap.xml', note: 'Generated at request time, 506 URLs' },
      { label: '/robots.txt', href: '/robots.txt', note: 'Crawl policy' },
      { label: '/manifest.json', href: '/manifest.json', note: 'PWA manifest' },
      { label: '/icon.svg', href: '/icon.svg', note: 'Favicon' },
      { label: '/apple-icon.png', href: '/apple-icon.png' },
      { label: '/og-image.png', href: '/og-image.png', note: 'Social card' },
      { label: '/offline.html', href: '/offline.html', note: 'App worker offline fallback' },
      // One worker owns the origin: it proxies /service/ and caches the shell.
      // (Two registrations at scope / replace each other — see public/uv/uv.sw.js.)
      { label: '/uv/uv.sw.js', href: '/uv/uv.sw.js', note: 'The one service worker: proxy + offline shell' },
      { label: '/gg-sw.js', href: '/gg-sw.js', note: 'Legacy Scramjet worker (retired, unregistered on boot)' },
      { label: '/uv.sw.js', href: '/uv.sw.js', note: 'Proxy service worker' },
      { label: '/uv/uv.bundle.js', href: '/uv/uv.bundle.js' },
      { label: '/uv/uv.handler.js', href: '/uv/uv.handler.js' },
      { label: '/uv/uv.sw.js', href: '/uv/uv.sw.js' },
      { label: '/wisp/wisp-client.js', href: '/wisp/wisp-client.js' },
      { label: '/proxy/sw.js', href: '/proxy/sw.js' },
      { label: '/proxy/launch-youtube.js', href: '/proxy/launch-youtube.js' },
      { label: '/customization-game.js', href: '/customization-game.js', note: 'Theme preview runner' },
      { label: '/googlefbb12adcbe4b16a3.html', href: '/googlefbb12adcbe4b16a3.html', note: 'Search Console verification' },
    ],
  };
}

/** Absolute form of a site-relative URL, for pasting outside the site. */
export function absolute(href: string): string {
  return href.startsWith('http') ? href : `${SITE_ORIGIN}${href === '/' ? '' : href}`;
}

/** The plain-text directory the copy button hands over. */
export function plainDirectory(): string {
  const lines: string[] = [`GG-LOUNGE — ${SITE_ORIGIN}`, ''];
  // Every address comes first: the single most useful thing to paste is "these
  // are all the ways in". A redirecting host is noted inline rather than
  // quietly dropped, so nobody pastes a dead-looking URL into a group chat.
  lines.push('== ALL ADDRESSES ==');
  for (const domain of SITE_DOMAINS) {
    const suffix = domain.canonical
      ? ' (canonical)'
      : domain.redirectsTo
        ? ` (redirects to ${domain.redirectsTo})`
        : '';
    lines.push(`https://${domain.host}${suffix}`);
  }
  lines.push('');
  const page = sitePages();
  lines.push(`== ${page.label.toUpperCase()} ==`);
  for (const link of page.links) lines.push(absolute(link.href));
  lines.push('', '== GAMES ==');
  for (const group of gameGroups()) {
    lines.push('', `-- ${group.label} --`);
    for (const game of group.games) lines.push(`${game.title} — ${absolute(game.landing)}`);
  }
  return lines.join('\n');
}
