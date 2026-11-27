/**
 * Tests for shared arcade logic that survives without a DOM: the GG-GPT
 * sandbox document builder, the catalogue guarantees and the play-time
 * formatting. (The Arcade Lab this file once belonged to was removed; its
 * remaining subjects kept the file, under a name that says what it now is.)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SANDBOX_CSP, buildSandboxDocument, extractCode, isSafeSandboxSource, stripTypes } from '../lib/gg-gpt/sandbox';
import { formatDuration } from '../components/ArcadeExtras';
import { zaiEndpoint } from '../lib/gg-gpt/engine';
import { readFileSync } from 'node:fs';

test('sandbox: fenced code is pulled apart by language', () => {
  const reply = 'Here is a game:\n```html\n<h1>hi</h1>\n```\nand the logic:\n```js\nconst n: number = 2;\n```';
  const parts = extractCode(reply);
  assert.equal(parts.html, '<h1>hi</h1>\n');
  assert.match(parts.js, /const n = 2/);
  assert.doesNotMatch(parts.js, /: number/);
});

test('sandbox: several JS fences are joined, not run separately', () => {
  const { js } = extractCode('```js\nlet a = 1\n```\ntext\n```js\nlet b = 2\n```');
  assert.match(js, /let a = 1/);
  assert.match(js, /let b = 2/);
});

test('sandbox: a full document keeps its own head and body', () => {
  const doc = buildSandboxDocument({
    html: '<html><head><title>x</title></head><body><p>hi</p></body></html>',
    css: 'p{color:red}',
    js: 'console.log(1)',
  });
  assert.equal(doc.match(/<html/gi)?.length, 1, 'nested documents were produced');
  assert.ok(doc.indexOf('<style>') < doc.indexOf('</head>'), 'css did not land in head');
  assert.ok(doc.indexOf('<script>') > doc.indexOf('<p>hi</p>'), 'script did not land in body');
});

test('sandbox: a bare fragment becomes a document with an error reporter', () => {
  const doc = buildSandboxDocument({ html: '<canvas></canvas>', css: '', js: 'boom()' });
  assert.match(doc, /^<!doctype html>/i);
  assert.match(doc, /window\.addEventListener\('error'/);
  assert.match(doc, /boom\(\)/);
});

test('sandbox: a title is never taken from the generated code', () => {
  const doc = buildSandboxDocument({ html: '<title>evil</title>', css: '', js: '' });
  assert.doesNotMatch(doc, /<title>evil<\/title>/);
});

test('sandbox: oversized or non-string parts are rejected before assembly', () => {
  assert.equal(isSafeSandboxSource({ html: '<p>x</p>' }), true);
  assert.equal(isSafeSandboxSource({ html: 42 }), false);
  assert.equal(isSafeSandboxSource(null), false);
  assert.equal(isSafeSandboxSource({ js: 'x'.repeat(200_001) }), false);
});

test('sandbox: stripTypes leaves plain JavaScript alone', () => {
  const plain = 'function add(a, b) { return a + b }\nconsole.log(add(1, 2))';
  assert.equal(stripTypes(plain), plain);
});

test('sandbox: every generated document carries the network-blocking policy', () => {
  // srcDoc frames are not served with headers, so the policy has to be in the
  // document itself — and before any script the model wrote.
  for (const parts of [
    { html: '<p>x</p>', css: '', js: '1' },
    { html: '<html><head></head><body><p>x</p></body></html>', css: 'p{}', js: '1' },
    { html: '<html><body><p>x</p></body></html>', css: '', js: '' },
  ]) {
    const doc = buildSandboxDocument(parts);
    const cspAt = doc.indexOf('Content-Security-Policy');
    assert.ok(cspAt > -1, 'no CSP meta tag');
    assert.ok(doc.indexOf('connect-src \'none\'') > -1);
    const scriptAt = doc.indexOf('<script>');
    if (scriptAt > -1) assert.ok(cspAt < scriptAt, 'the policy must come before the first script');
  }
  assert.match(SANDBOX_CSP, /connect-src 'none'/);
});

test('sandbox: three code parts round-trip through the fragment builder', () => {
  const doc = buildSandboxDocument({ html: '<h1>hi</h1>', css: 'h1{color:red}', js: 'window.x=1' });
  const cssAt = doc.indexOf('h1{color:red}');
  const jsAt = doc.indexOf('window.x=1');
  assert.ok(cssAt > -1 && jsAt > -1, 'css or js dropped');
});

test('GG-GPT: the Z.ai endpoint is the documented one, whichever base is set', () => {
  // The two failure modes this pins: a bare `z.ai` host (404) and a doubled
  // `/api/paas/v4` (also 404). Both look like a rejected key to a caller.
  assert.equal(zaiEndpoint('https://api.z.ai'), 'https://api.z.ai/api/paas/v4/chat/completions');
  assert.equal(zaiEndpoint('https://api.z.ai/'), 'https://api.z.ai/api/paas/v4/chat/completions');
  assert.equal(zaiEndpoint('https://api.z.ai/api/paas/v4'), 'https://api.z.ai/api/paas/v4/chat/completions');
  assert.equal(zaiEndpoint('https://api.z.ai/api/paas/v4/'), 'https://api.z.ai/api/paas/v4/chat/completions');
  assert.equal(zaiEndpoint('https://open.bigmodel.cn'), 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
});

test('split screen: both panes are grid tracks, not floating boxes', () => {
  // The original bug: the right pane was `position:absolute; left:var(--gg-split)`,
  // so it only lined up with the left pane at exactly 50%, and games that size
  // themselves to their viewport got a pane the wrong size at every other value.
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  // Anchor on the selector at the start of a line so `.gg-split-right` does not
  // match `.gg-split-area.is-split .gg-split-right`.
  const block = (selector: string) => {
    const pattern = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm');
    const match = pattern.exec(css);
    assert.ok(match, `${selector} must exist`);
    return css.slice(match.index, css.indexOf('}', match.index));
  };

  assert.match(block('.gg-split-area'), /display:\s*grid/);
  const split = block('.gg-split-area.is-split');
  assert.match(split, /grid-template-columns:\s*minmax\(0,\s*var\(--gg-split/);
  // minmax(0, …) is what stops a wide game from forcing the grid to overflow.
  assert.equal((split.match(/minmax\(0,/g) ?? []).length, 2);

  const right = block('.gg-split-right');
  assert.match(right, /grid-column:\s*2/);
  assert.doesNotMatch(right, /position:\s*absolute/);
  assert.doesNotMatch(right, /left:\s*var\(--gg-split/);

  // The pane's own touch pad must exist for the phone layout, where the second
  // game was previously visible but unplayable. Its `touch-action` lives on the
  // buttons, not the container.
  const touch = block('.gg-split-touch');
  assert.match(touch, /display:\s*none/, 'the pad is hidden on a mouse device');
  const touchButton = block('.gg-split-touch button');
  assert.match(touchButton, /touch-action:\s*none/);
  assert.match(css, /\.gg-split-touch \{ display: grid; \}/);
  assert.match(css, /@media \(pointer: coarse\)/);
});

test('the removed first-party originals are gone, not merely unlinked', async () => {
  // These were hand-built engine demos. They were removed by instruction, and
  // the risk is that they linger in the catalogue (a dead tile) or on disk
  // (extra weight nobody asked for). Both directions are asserted.
  const { existsSync } = await import('node:fs');
  const removed = ['orbital-drift', 'neon-runner', 'block-fall', 'pulse-grid', 'sumo-bump', 'merge-reactor', 'lane-guard'];
  const { games, catalogGames } = await import('../lib/games');
  for (const id of removed) {
    assert.ok(!catalogGames.some(game => game.id === id), `${id} is still in the catalogue`);
    assert.ok(!games.some(game => game.id === id), `${id} is still offered`);
    assert.equal(existsSync(new URL(`../public/games/${id}`, import.meta.url)), false, `${id} still on disk`);
    assert.equal(existsSync(new URL(`../game-icons/${id}.webp`, import.meta.url)), false, `${id} icon still on disk`);
  }
  // `_shared` itself must STAY: it holds gg-save.js, which 2048, Candy Crush and
  // Doodle Jump load for their save slots. Deleting the whole directory took
  // three working games offline — the engine was one file, not the folder.
  assert.equal(existsSync(new URL('../public/games/_shared/gg-arcade.js', import.meta.url)), false, 'the old engine is still on disk');
  assert.equal(existsSync(new URL('../public/games/_shared/gg-save.js', import.meta.url)), true, 'gg-save.js must survive: real games load it');
});

test('two-player picks are only titles that prove a second player exists', async () => {
  const { TWO_PLAYER_GAMES } = await import('../lib/two-player');
  const { games } = await import('../lib/games');
  assert.ok(TWO_PLAYER_GAMES.length >= 5, 'a room needs something to offer');

  for (const entry of TWO_PLAYER_GAMES) {
    // Every pick must actually be launchable, or the room opens a dead tile.
    assert.ok(games.some(game => game.id === entry.id), `${entry.id} is offered but not in the catalogue`);
    assert.ok(entry.controls.trim().length > 0, `${entry.id} does not say what to press`);
    assert.match(entry.evidence, /^[A-Za-z0-9_]+$/, `${entry.id} has an unusable evidence token`);
  }
});

test('the two-player list does not drift from the shipped game source', async () => {
  // `scripts/audit-two-player.mjs` re-proves every claim against public/games.
  // Running it here means a game update that removes the 2P mode fails CI rather
  // than shipping a room tile that cannot take two players.
  const { execFileSync } = await import('node:child_process');
  const output = execFileSync(process.execPath, ['scripts/audit-two-player.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
  });
  assert.match(output, /(\d+)\/\1 two-player claims verified/, output);
});

test('GG-GPT: a vision request never reaches a text-only provider', async () => {
  const { orderProviders } = await import('../lib/gg-gpt/engine');
  const stub = (name: string, tier: number) => ({
    name, tier, model: name,
    request: () => ({ url: '', init: {} }),
    parse: () => '',
  });
  const list = [stub('text-only', 100), { ...stub('seer', 50), vision: true }];

  assert.deepEqual(orderProviders(list, 'vision').map(p => p.name), ['seer']);
  // For a normal chat the text provider still wins on tier; the filter is
  // scoped to vision and must not reorder everything else.
  assert.deepEqual(orderProviders(list, 'chat').map(p => p.name), ['text-only', 'seer']);
});

test('play time formats as a person would say it', () => {
  assert.equal(formatDuration(20_000), 'under a minute');
  assert.equal(formatDuration(9 * 60_000), '9m');
  assert.equal(formatDuration(3_600_000), '1h');
  assert.equal(formatDuration(3_600_000 + 42 * 60_000), '1h 42m');
});
