/**
 * Tests for the Arcade Lab's pure logic and the GG-GPT sandbox.
 *
 * Everything asserted here is the part that can be wrong without anything
 * crashing: an LSB format that does not round-trip, a generated game with a
 * syntax error, a sandbox document that assembles into something the browser
 * would misparse, or a mirror mesh that probes a host it has retired.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { StegoError, capacityBytes, difference, embed, extract } from '../lib/stego';
import { generateGame, mulberry32 } from '../lib/micro-game';
import { SANDBOX_CSP, buildSandboxDocument, extractCode, isSafeSandboxSource, stripTypes } from '../lib/gg-gpt/sandbox';
import { MIRRORS, bestMirror, isRetired, recordFailure, recordSuccess } from '../lib/mirror-mesh';
import { formatDuration } from '../components/ArcadeExtras';
import { zaiEndpoint } from '../lib/gg-gpt/engine';
import { readFileSync } from 'node:fs';

/** A tiny ImageData lookalike — node has no DOM, and the algorithm only reads
 *  .data/.width/.height, so a plain object is the honest fixture. */
function image(width: number, height: number, fill = 128): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill;
    data[i + 1] = fill;
    data[i + 2] = fill;
    data[i + 3] = 255;
  }
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData;
}

test('stego: a message round-trips through the low bits', () => {
  const source = image(64, 64);
  const stamped = embed(source, 'meet at the arcade, 8pm');
  assert.equal(extract(stamped), 'meet at the arcade, 8pm');
});

test('stego: the change is invisible and alpha is untouched', () => {
  const source = image(48, 48);
  const stamped = embed(source, 'hello');
  // Low-bit writes move a channel by at most 1/255.
  assert.ok(difference(source, stamped) <= 1, 'pixels changed more than a low bit');
  for (let i = 3; i < stamped.data.length; i += 4) {
    assert.equal(stamped.data[i], 255, 'alpha channel was modified');
  }
});

test('stego: an image with no message returns null rather than garbage', () => {
  assert.equal(extract(image(32, 32)), null);
});

test('stego: a message too long for the image is refused, not truncated', () => {
  const tiny = image(8, 8); // 192 bits of capacity, 24 bytes
  assert.ok(capacityBytes(8, 8) < 40);
  assert.throws(() => embed(tiny, 'x'.repeat(200)), StegoError);
});

test('stego: a corrupted payload fails its checksum and reads as empty', () => {
  const stamped = embed(image(64, 64), 'a secret worth keeping');
  // Flip a low bit inside the payload region. The message is 22 bytes, so its
  // 272 bits occupy roughly the first 360 non-alpha bytes; index 200 is
  // comfortably inside it, while anything past that is untouched padding.
  assert.equal(stamped.data[200] % 4 === 3, false, 'index 200 is an alpha byte');
  stamped.data[200] ^= 1;
  assert.equal(extract(stamped), null);
});

test('micro-game: a seed is deterministic and produces a runnable document', () => {
  const a = generateGame(1234);
  const b = generateGame(1234);
  assert.equal(a.document, b.document, 'the same seed must build the same game');
  assert.equal(a.title, b.title);
  assert.match(a.document, /^<!doctype html>/i);
  assert.match(a.document, /requestAnimationFrame/);
  // The generated script has to parse or the game is a blank canvas.
  const script = a.document.split('<script>')[1]?.split('</script>')[0] ?? '';
  assert.ok(script.length > 500);
  new Function(script);
});

test('micro-game: different seeds make different games', () => {
  const games = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed => generateGame(seed).document));
  assert.ok(games.size > 4, 'seeds collapsed into the same document');
});

test('micro-game: the PRNG is uniform enough to be useful', () => {
  const next = mulberry32(99);
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 10000; i++) buckets[Math.floor(next() * 10)]++;
  for (const count of buckets) assert.ok(count > 700 && count < 1300, `bucket imbalance: ${count}`);
});

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

test('mirror mesh: the canonical host list is the four known deployments', () => {
  assert.deepEqual([...MIRRORS], [
    'https://gg-lounge.vercel.app',
    'https://growth-gulid.vercel.app',
    'https://talent-tribe.vercel.app',
    'https://gg-lounge.duckdns.org',
  ]);
});

test('mirror mesh: a failed host is retired, then readmitted on success', () => {
  const host = MIRRORS[1];
  recordSuccess(host);
  assert.equal(isRetired(host), false);
  recordFailure(host);
  assert.equal(isRetired(host), true);
  recordSuccess(host);
  assert.equal(isRetired(host), false);
});

test('mirror mesh: the fastest healthy mirror wins, canonical preferred when close', () => {
  const best = bestMirror([
    { host: MIRRORS[0], ms: 220 },
    { host: MIRRORS[1], ms: 80 },
  ]);
  assert.equal(best, MIRRORS[0], 'a canonical mirror with a good ping should not be abandoned');

  const farCanonical = bestMirror([
    { host: MIRRORS[0], ms: 2400 },
    { host: MIRRORS[2], ms: 90 },
  ]);
  assert.equal(farCanonical, MIRRORS[2]);

  assert.equal(bestMirror([{ host: MIRRORS[0], ms: null }]), null);
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

test('GG-GPT: glm-4.7-flash stays lowercase and its vision sibling is separate', () => {
  const source = readFileSync(new URL('../lib/gg-gpt/engine.ts', import.meta.url), 'utf8');
  assert.match(source, /zai: "glm-4\.7-flash"/);
  assert.doesNotMatch(source, /"GLM-4\.7-Flash"/, 'the paid uppercase id must not appear');
  // A vision model id has a `v` before `-flash`; the text model does not.
  assert.match(source, /zaiVision: "glm-4\.6v-flash"/);
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

test('play time formats as a person would say it', () => {
  assert.equal(formatDuration(20_000), 'under a minute');
  assert.equal(formatDuration(9 * 60_000), '9m');
  assert.equal(formatDuration(3_600_000), '1h');
  assert.equal(formatDuration(3_600_000 + 42 * 60_000), '1h 42m');
});
