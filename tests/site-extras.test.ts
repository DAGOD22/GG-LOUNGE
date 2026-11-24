/**
 * The small site features: daily picks, share links, catalogue helpers and the
 * search parser.
 *
 * Several of these are the kind of thing that looks obviously correct and is
 * not. The daily pick uses the local calendar day because a UTC day flips at
 * 9:30am in Adelaide; the share links encode the values rather than the whole
 * URL because a game called "Rock & Roll" otherwise truncates the message; and
 * the search parser has to survive a query that is nothing but an operator.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  averageTitleLength, cacheStrategy, dailyPicks, dayProgress, estimatedSessionMinutes,
  genreCounts, hashDayKey, localDayKey, noResultsHint, parseSearch, pathLabel,
  recommendGames, shareTargets, similarGames, suspiciousTitles, tipOfTheDay,
  SITE_TIPS, whyThisGame, type CatalogEntry,
} from '@/lib/site-extras';

const games: CatalogEntry[] = [
  { id: '1', title: 'Quake', genre: 'Shooter', featured: true, tags: ['fps', 'classic', 'multiplayer'] },
  { id: '2', title: 'Slope', genre: 'Action', tags: ['runner'] },
  { id: '3', title: '2048', genre: 'Puzzle', description: 'Numbers.' },
  { id: '4', title: 'Retro Bowl', genre: 'Sports', tags: ['football', 'retro', 'management'] },
  { id: '5', title: 'Cookie Clicker', genre: 'Clicker' },
  { id: '6', title: 'Ragdoll Archers', genre: 'Action' },
  { id: '7', title: 'Solar Smash', genre: 'Action' },
  { id: '8', title: 'Tiny Fishing', genre: 'Puzzle' },
];

/* ---------------- daily picks ---------------- */

test('the daily key is the local calendar day, not the UTC one', () => {
  // 00:30 on the 16th in a +10:30 zone is still the 15th in UTC. The key must
  // follow the local day, or the pick changes in the middle of someone's
  // evening session.
  const localLate = new Date(2026, 10, 16, 0, 30);
  assert.equal(localDayKey(localLate), '2026-11-16');
  // And the constructed-from-parts date must not slip a day the way
  // `new Date('2026-11-16')` does, because that parses as UTC midnight.
  assert.equal(localDayKey(new Date(2026, 0, 1)), '2026-01-01');
});

test('the same day gives the same pick, a different day usually does not', () => {
  const day = new Date(2026, 10, 15, 12);
  const first = dailyPicks(games, ['Action', 'Puzzle'], day);
  const again = dailyPicks(games, ['Action', 'Puzzle'], new Date(2026, 10, 15, 23, 59));
  assert.equal(first.game!.id, again.game!.id, 'the pick must not change during the day');
  assert.equal(first.key, again.key);

  const changed = new Set<string>();
  for (let offset = 0; offset < 14; offset++) {
    const next = new Date(2026, 10, 1 + offset);
    changed.add(dailyPicks(games, ['Action'], next).game!.id);
  }
  assert.ok(changed.size > 3, `two weeks should surface several games, got ${changed.size}`);
});

test('an empty catalogue produces no pick rather than crashing', () => {
  const picks = dailyPicks([], [], new Date(2026, 10, 15));
  assert.equal(picks.game, null);
  assert.equal(picks.genre, null);
  assert.equal(picks.index, -1);
});

test('day progress runs from 0 at midnight to 1 at the next one', () => {
  assert.equal(dayProgress(new Date(2026, 10, 15, 0, 0)), 0);
  assert.ok(Math.abs(dayProgress(new Date(2026, 10, 15, 12, 0)) - 0.5) < 0.001);
  assert.ok(dayProgress(new Date(2026, 10, 15, 23, 59)) > 0.99);
});

test('the day hash is stable across runs', () => {
  assert.equal(hashDayKey('2026-11-15'), hashDayKey('2026-11-15'));
  assert.notEqual(hashDayKey('2026-11-15'), hashDayKey('2026-11-16'));
  assert.ok(hashDayKey('') >= 0);
});

/* ---------------- share links ---------------- */

test('share links encode the values, so an ampersand does not truncate the message', () => {
  const targets = shareTargets('Rock & Roll', 'https://example.com/g/rock');
  const whatsapp = targets.find(target => target.id === 'whatsapp')!;
  // The raw `&` must not appear unencoded in the query.
  assert.ok(!whatsapp.url.includes('Rock & Roll'), 'the title must be encoded');
  assert.ok(whatsapp.url.includes(encodeURIComponent('Rock & Roll')));
  // And every target keeps the URL readable as a parameter value.
  for (const target of targets) {
    assert.ok(target.url.startsWith('https://') || target.url.startsWith('mailto:'), target.id);
    assert.ok(!/\s/.test(target.url.split('?')[1]?.split('&')[0] ?? ''), `${target.id} has a raw space`);
  }
});

test('every share target is distinct and named', () => {
  const targets = shareTargets('Quake', 'https://example.com/g/quake');
  assert.equal(new Set(targets.map(target => target.id)).size, targets.length);
  // "X" is one character and is still the right name for it.
  for (const target of targets) assert.ok(target.label.length >= 1, target.id);
});

test('a path gets an honest description', () => {
  assert.equal(pathLabel('/'), 'the lounge');
  assert.equal(pathLabel('/g/retro-bowl'), 'the retro bowl page');
  assert.equal(pathLabel('/tools'), 'the tools page');
  assert.equal(pathLabel('/apps'), 'the apps page');
  assert.match(pathLabel('/something-else'), /^the something else page$/);
});

/* ---------------- catalogue helpers ---------------- */

test('recommendations put the featured and the played first', () => {
  const ranked = recommendGames(games, { '2': 30, '5': 12 }, 3);
  assert.equal(ranked[0].id, '1', 'the featured game wins');
  assert.equal(ranked[1].id, '2', 'then the most played');
  assert.equal(ranked.length, 3);
  assert.equal(recommendGames(games, {}, 99).length, games.length, 'the limit is a cap, not a length');
});

test('similar games prefer the same genre and never include the current one', () => {
  const current = games.find(game => game.id === '2')!;
  const similar = similarGames(games, current, 4);
  assert.ok(!similar.some(game => game.id === '2'));
  assert.ok(similar.every(game => game.genre === 'Action' || (game.tags ?? []).some(tag => current.tags!.includes(tag))));
  assert.equal(similar[0].genre, 'Action');
});

test('why-this-game says something true rather than something flattering', () => {
  assert.match(whyThisGame(games[0], {}), /featured/i);
  assert.match(whyThisGame(games[1], { playCount: 50 }), /played/i);
  assert.match(whyThisGame(games[1], { isRandom: true }), /random/i);
  assert.match(whyThisGame(games[3], {}), /Tagged football, retro, management/);
  assert.match(whyThisGame(games[4], {}), /Not many people/);
});

test('genre counts are ordered and complete', () => {
  const counts = genreCounts(games);
  assert.equal(counts[0].genre, 'Action');
  assert.equal(counts[0].count, 3);
  assert.equal(counts.reduce((sum, entry) => sum + entry.count, 0), games.length);
  // A game with no genre is not silently dropped.
  const withMissing = genreCounts([{ genre: undefined }, { genre: 'Puzzle' }]);
  assert.ok(withMissing.some(entry => entry.genre === 'Other'));
});

test('title statistics flag data-entry smells', () => {
  assert.ok(averageTitleLength(games) > 5);
  assert.equal(averageTitleLength([]), 0);
  const odd = suspiciousTitles([{ title: '2048' }, { title: 'Quake' }, { title: '[beta] Thing' }, { title: '  *star' }]);
  assert.equal(odd.length, 3);
});

test('session estimates are plausible and bounded', () => {
  assert.ok(estimatedSessionMinutes('Puzzle') >= 5);
  assert.ok(estimatedSessionMinutes(undefined) > 0);
  for (const genre of ['Action', 'Racing', 'Strategy', undefined]) {
    const value = estimatedSessionMinutes(genre);
    assert.ok(value > 0 && value <= 30, `${genre} gave ${value}`);
  }
});

/* ---------------- search ---------------- */

test('the search parser pulls operators out and leaves the text', () => {
  assert.deepEqual(parseSearch('racing game'), { text: 'racing game', genre: null, tag: null });
  assert.deepEqual(parseSearch('genre:racing'), { text: '', genre: 'racing', tag: null });
  assert.deepEqual(parseSearch('fast genre:action fun'), { text: 'fast fun', genre: 'action', tag: null });
  assert.deepEqual(parseSearch('tag:fps arena'), { text: 'arena', genre: null, tag: 'fps' });
  // Both operators, in either order.
  const both = parseSearch('tag:fps genre:shooter');
  assert.equal(both.genre, 'shooter');
  assert.equal(both.tag, 'fps');
  assert.equal(both.text, '');
});

test('the no-results hint points somewhere instead of just apologising', () => {
  assert.match(noResultsHint('puz', ['Puzzle', 'Action']), /Puzzle category/);
  assert.match(noResultsHint('xyzzy', ['Puzzle']), /No title matches/);
  assert.match(noResultsHint('', ['Puzzle']), /empty search/);
});

/* ---------------- tips and caching ---------------- */

test('there is a tip for every day and they are all different', () => {
  assert.equal(new Set(SITE_TIPS).size, SITE_TIPS.length, 'no duplicate tips');
  const seen = new Set<string>();
  for (let offset = 0; offset < 14; offset++) {
    seen.add(tipOfTheDay(new Date(2026, 10, 1 + offset)));
  }
  assert.ok(seen.size >= 3, 'the tip should rotate');
  assert.ok(tipOfTheDay().length > 20);
});

test('the cache strategy is network-first for pages and cache-first for assets', () => {
  assert.equal(cacheStrategy('/api/health'), 'network-only');
  assert.equal(cacheStrategy('/_next/static/chunk.js'), 'cache-first');
  assert.equal(cacheStrategy('/games/quake/index.wasm'), 'cache-first');
  assert.equal(cacheStrategy('/games/quake/logo.png'), 'cache-first');
  assert.equal(cacheStrategy('/g/quake'), 'network-first');
  assert.equal(cacheStrategy('/tools'), 'network-first');
});
