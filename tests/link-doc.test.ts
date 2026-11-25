import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DOC_CATEGORIES,
  gameGroups,
  plainDirectory,
  sitePages,
  absolute,
  SITE_ORIGIN,
} from '../lib/link-map';
import { games, filters } from '../lib/games';
import sitemap from '../app/sitemap';

/**
 * The doc page is generated rather than written, so the thing worth testing is
 * that the generation cannot silently lose a game or invent one. A directory
 * that claims "every link" and then omits forty titles is worse than no
 * directory at all.
 */

const ROOT = new URL('..', import.meta.url).pathname;

test('every playable game appears exactly once, in exactly one shelf', () => {
  const groups = gameGroups();
  const listed = groups.flatMap(group => group.games);
  assert.equal(listed.length, games.length);

  const ids = listed.map(game => game.id);
  assert.equal(new Set(ids).size, ids.length, 'a game is listed twice');
  // Nothing the library filters out may be advertised here.
  for (const id of ids) assert.ok(games.some(game => game.id === id), `${id} is not in the catalogue`);
});

test('shelves are the library filter row, in order, plus one Misc at the end', () => {
  const keys = gameGroups().map(group => group.key);
  const expected = filters.filter(f => f !== 'All games' && f !== 'Favorites');
  assert.deepEqual(keys, [...expected, 'Misc']);
  assert.deepEqual(DOC_CATEGORIES, expected);
});

test('Misc is only the genres with no tab of their own', () => {
  const misc = gameGroups().find(group => group.key === 'Misc');
  assert.ok(misc, 'no Misc shelf');
  assert.ok(misc.games.length > 0, 'Misc is empty');

  for (const game of misc.games) {
    assert.ok(
      !DOC_CATEGORIES.includes(game.genre),
      `${game.title} (${game.genre}) has its own tab and must not be in Misc`,
    );
  }
  // The user asked for the random ones to be gathered together; shooters and
  // strategy are the bulk of them, so if this ever empties, the shelf is wrong.
  const genres = new Set(misc.games.map(game => game.genre));
  assert.ok(genres.has('Shooter'));
  assert.ok(genres.has('Strategy'));
});

test('each game gets all four link shapes, and they disagree with each other', () => {
  for (const group of gameGroups()) {
    for (const game of group.games) {
      assert.equal(game.landing, `/g/${game.id}`);
      assert.equal(game.play, `/?game=${game.id}`);
      assert.equal(game.player, `/play/${game.id}`);
      assert.ok(game.raw.startsWith('/') || game.raw.startsWith('http'), `${game.id} has no raw file`);
      // A proxied title's raw path is a remote URL, a local one is a site path.
      if (game.proxied) assert.ok(game.raw.startsWith('http'), `${game.id} is proxied but points local`);
      else assert.ok(game.raw.startsWith('/'), `${game.id} is local but points offsite`);
    }
  }
});

test('the copyable text is the same directory, not a second list', () => {
  const text = plainDirectory();
  for (const game of games) {
    assert.ok(text.includes(`${game.title} — `), `${game.title} missing from the copied text`);
    assert.ok(text.includes(`${SITE_ORIGIN}/g/${game.id}`), `${game.title} has no absolute landing link`);
  }
  assert.ok(text.startsWith('GG-LOUNGE — '));
});

test('absolute() does not double the slash on the root', () => {
  assert.equal(absolute('/'), SITE_ORIGIN);
  assert.equal(absolute('/privacy'), `${SITE_ORIGIN}/privacy`);
  assert.equal(absolute('https://example.com/x'), 'https://example.com/x');
});

test('the lounge section keeps the pages a person would actually send', () => {
  const hrefs = sitePages().links.map(link => link.href);
  for (const expected of ['/', '/apps', '/proxy', '/gg-gpt', '/request-game', '/privacy', '/terms']) {
    assert.ok(hrefs.includes(expected), `${expected} is not on the doc`);
  }
});

test('the directory stays out of search, and out of the sitemap', () => {
  const robots = readFileSync(`${ROOT}public/robots.txt`, 'utf8');
  assert.match(robots, /^Disallow: \/secret-link-doc$/m);

  const urls = sitemap().map(entry => entry.url);
  assert.ok(
    !urls.some(url => url.includes('secret-link-doc')),
    'the one-page link dump must not compete with the real library',
  );
});
