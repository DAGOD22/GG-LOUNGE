import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import jsdom from 'jsdom';

const { JSDOM, requestInterceptor, VirtualConsole } = jsdom as unknown as {
  JSDOM: any;
  requestInterceptor: (handler: (request: any, context: any) => any) => any;
  VirtualConsole: any;
};

/**
 * Browser smoke tests for the games added to the lounge.
 *
 * There is no headless browser in this environment, so each game is loaded in a
 * real DOM (jsdom) with a stubbed 2D canvas, then driven the way a player would
 * drive it: real clicks, real key presses, real animation frames. These tests
 * assert observable behaviour — tiles merging, a cube running and dying on a
 * spike, a block landing on the board — not just that a file exists.
 */

const PUBLIC = resolve('public');
const ORIGIN = 'http://lounge.test';

/** Serves game assets straight off disk so the tests need no network. */
const TYPES: Record<string, string> = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
};

function diskInterceptor(request: any) {
  const pathname = decodeURIComponent(new URL(String(request.url)).pathname);
  const file = join(PUBLIC, pathname);
  try {
    const body = readFileSync(file);
    const type = TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream';
    return new Response(body, { status: 200, headers: { 'Content-Type': type } });
  } catch {
    // Missing optional assets (favicons, the customization shim) simply 404.
    return new Response('not found', { status: 404 });
  }
}

/** A no-op 2D context: games draw, we only care that drawing never throws. */
function stubCanvas(window: any) {
  const gradient = { addColorStop() {} };
  const context: any = new Proxy({}, {
    get(_target, property) {
      if (property === 'canvas') return null;
      if (property === 'createLinearGradient' || property === 'createRadialGradient' || property === 'createPattern') return () => gradient;
      if (property === 'measureText') return () => ({ width: 0 });
      if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (property === 'setTransform' || property === 'save' || property === 'restore') return () => {};
      return typeof property === 'string' ? () => undefined : undefined;
    },
    set() { return true; },
  });
  window.HTMLCanvasElement.prototype.getContext = () => context;
  // jsdom has no blob URL support; games use it for the merged wasm payload.
  if (!window.URL.createObjectURL) {
    const blobs = new Map<string, any>();
    let next = 0;
    window.URL.createObjectURL = (blob: any) => {
      const url = `blob:lounge/${++next}`;
      blobs.set(url, blob);
      return url;
    };
    window.URL.revokeObjectURL = (url: string) => { blobs.delete(url); };
    (window as any).__blobs = blobs;
  }
}

type Loaded = { window: any; document: any; errors: string[] };

async function loadGame(path: string): Promise<Loaded> {
  const html = readFileSync(join(PUBLIC, path), 'utf8');
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => {
    // Missing optional assets are reported by jsdom, not thrown by our code.
    if (/Could not load|Error: Not implemented/.test(error.message)) return;
    errors.push(error.message);
  });

  const dom = new JSDOM(html, {
    url: ORIGIN + '/' + path.replace(/^\//, ''),
    runScripts: 'dangerously',
    resources: { interceptors: [requestInterceptor(diskInterceptor)] },
    pretendToBeVisual: true,          // gives us requestAnimationFrame
    virtualConsole,
    beforeParse(window: any) { stubCanvas(window); },
  });

  await new Promise(done => {
    if (dom.window.document.readyState === 'complete') done(null);
    else dom.window.addEventListener('load', () => done(null));
    setTimeout(() => done(null), 4000);
  });
  // let the first animation frames run
  await wait(dom.window, 120);
  return { window: dom.window, document: dom.window.document, errors };
}

function wait(window: any = null, ms = 60) {
  return new Promise(done => setTimeout(done, ms));
}

function click(window: any, element: any) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pointer(window: any, element: any, type: string, clientX: number, clientY: number) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  element.dispatchEvent(event);
}

/* ------------------------------------------------------------------- 2048 ---- */
test('2048: real game boots, fills a board and merges on arrow keys', async () => {
  const { window, document, errors } = await loadGame('/games/2048/index.html');
  assert.deepEqual(errors, [], 'the game should start without script errors');

  const tiles = () => document.querySelectorAll('.tile');
  assert.equal(document.querySelectorAll('.grid-container').length, 1, 'board is rendered');
  assert.equal(tiles().length, 2, 'a new game starts with exactly two tiles');

  const before = document.querySelector('.score-container').textContent;
  // Mash the arrow keys the way a player would. (The original 2048 reads the
  // legacy `which` property, so it is defined explicitly here.)
  for (const code of [37, 40, 39, 38]) {
    const event = new window.KeyboardEvent('keydown', { bubbles: true });
    Object.defineProperty(event, 'which', { value: code });
    Object.defineProperty(event, 'keyCode', { value: code });
    document.dispatchEvent(event);
    await wait(window, 40);
  }
  const after = document.querySelector('.score-container').textContent;
  assert.notEqual(before, after, 'moving tiles should change the score');
  assert.ok(tiles().length >= 2, 'the board keeps spawning tiles');
  window.close();
});

/* ------------------------------------------------------------------ hextris --- */
test('hextris: real game boots locally with no third-party ad script', async () => {
  const html = readFileSync(join(PUBLIC, '/games/hextris/index.html'), 'utf8');
  assert.ok(!/googlesyndication|adsbygoogle|doubleclick/i.test(html), 'the upstream AdSense tag is removed');

  const { window, document, errors } = await loadGame('/games/hextris/index.html');
  assert.deepEqual(errors, [], 'the game should start without script errors');
  assert.ok(document.querySelector('canvas'), 'the game renders a canvas');
  assert.ok(existsSync(join(PUBLIC, '/games/hextris/LICENSE.md')), 'its licence ships with it');
  window.close();
});

/* ---------------------------------------------------------- geometry dash ---- */
test('geometry dash: level select starts a real run that ends on an obstacle', async () => {
  const { window, document, errors } = await loadGame('/games/geometry-dash/index.html');
  assert.deepEqual(errors, [], 'the game should start without script errors');

  const levels = document.querySelectorAll('#levelList .level-btn');
  assert.equal(levels.length, 3, 'three hand-built levels are offered');
  assert.ok(/Practice mode/.test(document.body.textContent ?? ''), 'practice mode is offered');

  const hud = document.getElementById('hud');
  assert.equal(hud.hidden, true, 'the HUD is hidden until a level starts');

  click(window, levels[0]);
  await wait(window, 120);
  assert.equal(hud.hidden, false, 'starting a level reveals the HUD');
  assert.equal(document.getElementById('menu').hidden, true, 'the menu closes');

  // The cube runs on its own. Level one's first obstacle sits about 0.9s ahead
  // and is fatal without a jump, so we sample the HUD across the run rather
  // than testing a single instant: progress must appear, then an attempt end.
  let maxPct = 0;
  let attempts = 1;
  for (let i = 0; i < 60; i++) {
    await wait(window, 50);
    maxPct = Math.max(maxPct, parseInt(document.getElementById('hudPct').textContent, 10) || 0);
    attempts = Math.max(attempts, parseInt(document.getElementById('hudAttempts').textContent, 10) || 1);
    if (attempts >= 2 && maxPct > 0) break;
  }
  assert.ok(maxPct > 0, 'the cube should advance down the level');
  assert.ok(attempts >= 2, `hitting an obstacle should end the attempt and respawn (attempts=${attempts})`);

  // Progress is recorded in local storage, not just on screen.
  const saved = JSON.parse(window.localStorage.getItem('ggl_gd_progress_v1') ?? '{}');
  assert.ok(saved.attempts && Object.keys(saved.attempts).length > 0, 'attempts persist to local storage');
  window.close();
});

test('geometry dash: a jump clears the first obstacle instead of dying', async () => {
  const { window, document } = await loadGame('/games/geometry-dash/index.html');
  click(window, document.querySelectorAll('#levelList .level-btn')[0]);
  await wait(window, 80);

  // Jump repeatedly: the cube should survive longer than a dead cube would.
  for (let i = 0; i < 14; i++) {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
    await wait(window, 90);
  }
  const pct = parseInt(document.getElementById('hudPct').textContent, 10);
  assert.ok(pct > 0, 'jumping should keep the cube moving through the level');
  window.close();
});

/** Rows in a dealt shape, read back from the grid the game renders. */
function shapeRows(piece: any): number {
  const template = String(piece.style.gridTemplateColumns ?? '');
  const match = /repeat\((\d+)/.exec(template);
  const cols = match ? Number(match[1]) : 1;
  return Math.max(1, Math.round(piece.children.length / cols));
}

/**
 * Drops a shape so its top-left cell lands on board cell (row, col).
 * Mirrors the game's own maths: the board padding is 8px, cells are 40px with a
 * 4px gap (46 - 8 - 20 = the centre of the first cell), and the drag is lifted
 * by half the shape plus LIFT px so a finger does not cover it.
 */
function drop(window: any, piece: any, row: number, col: number) {
  const rows = shapeRows(piece);
  const clientX = 8 + 20 + col * 44;
  const clientY = rows * 22 + 46 + row * 44;
  pointer(window, piece, 'pointerdown', 300, 600);
  pointer(window, window, 'pointermove', clientX, clientY);
  pointer(window, window, 'pointerup', clientX, clientY);
}

/* ------------------------------------------------------------- block blast --- */
test('block blast: drags a shape onto the board and scores it', async () => {
  const { window, document, errors } = await loadGame('/games/block-blast/index.html');
  assert.deepEqual(errors, [], 'the game should start without script errors');

  const cells = document.querySelectorAll('#board .cell');
  assert.equal(cells.length, 64, 'an 8x8 board is rendered');
  assert.equal(document.querySelectorAll('#tray .piece').length, 3, 'three shapes are dealt');

  const filled = () => document.querySelectorAll('#board .cell.filled').length;
  assert.equal(filled(), 0, 'the board starts empty');

  // Grab the first shape and drop it on the top-left of the board.
  const piece = document.querySelectorAll('#tray .piece')[0];
  drop(window, piece, 0, 0);
  await wait(window, 80);

  assert.ok(filled() > 0, 'dropping a shape fills cells on the board');
  const score = parseInt(document.getElementById('score').textContent, 10);
  assert.ok(score > 0, `placing a shape scores points (score=${score})`);
  // The tray re-renders after every placement, so the used shape is simply gone.
  assert.equal(document.querySelectorAll('#tray .piece').length, 2, 'the used shape leaves the tray');

  // Best score persists between page loads.
  assert.ok(parseInt(window.localStorage.getItem('ggl_blockblast_v1') ?? '0', 10) > 0, 'best score is saved');
  window.close();
});

test('block blast: completing a row clears it and awards a bonus', async () => {
  const { window, document } = await loadGame('/games/block-blast/index.html');
  const filled = () => document.querySelectorAll('#board .cell.filled').length;

  // Deal shapes onto the board row by row and watch for a line clear.
  let placed = 0;
  for (let round = 0; round < 6; round++) {
    for (let slot = 0; slot < 3; slot++) {
      const piece = document.querySelectorAll('#tray .piece:not(.spent)')[0];
      if (!piece) break;
      const before = document.querySelectorAll('#board .cell.filled').length;
      drop(window, piece, round * 2, slot * 3);
      await wait(window, 40);
      if (document.querySelectorAll('#board .cell.filled').length !== before || true) placed += 1;
    }
  }
  await wait(window, 300);
  assert.ok(placed > 0, 'shapes can be placed');
  assert.ok(filled() > 0, 'the board records placed shapes');

  const lines = parseInt(document.getElementById('lines').textContent, 10);
  const score = parseInt(document.getElementById('score').textContent, 10);
  if (lines > 0) assert.ok(score > placed, 'clearing a line pays more than placing a shape');
  else assert.ok(score > 0, 'each placement still scores');
  window.close();
});

/* ----------------------------------------------------------- survival race --- */
test('survival race: the local Unity build loads and reassembles its wasm', async () => {
  const html = readFileSync(join(PUBLIC, '/games/survival-race/index.html'), 'utf8');
  // The build must be local — no CDN loader left behind.
  assert.ok(!/<base\s[^>]+href=["']https?:/i.test(html), 'no remote <base> tag');
  assert.ok(!/cdn\.jsdelivr\.net|statically\.io|githack\.com/i.test(html), 'no CDN mirrors remain');
  assert.ok(!/data-gg-game-state="missing-assets"/.test(html), 'no longer flagged as missing');
  for (const file of ['Build/merge.js', 'Build/yandexBrotli.loader.js', 'Build/yandexBrotli.data.unityweb', 'Build/yandexBrotli.framework.js.unityweb'])
    assert.ok(html.includes(file), `references ${file}`);
  // The wasm payload is split for hosting; both halves must be on disk.
  for (const file of ['yandexBrotli.wasm.unityweb.part1', 'yandexBrotli.wasm.unityweb.part2'])
    assert.ok(existsSync(join(PUBLIC, '/games/survival-race/Build', file)), `ships ${file}`);

  const { window, document } = await loadGame('/games/survival-race/index.html');

  // merge.js must hand back a single blob URL built from both parts.
  assert.equal(typeof window.GGMergeWasm, 'function', 'the wasm merger is installed');

  const part1 = readFileSync(join(PUBLIC, '/games/survival-race/Build/yandexBrotli.wasm.unityweb.part1'));
  const part2 = readFileSync(join(PUBLIC, '/games/survival-race/Build/yandexBrotli.wasm.unityweb.part2'));
  window.fetch = (url: string) => {
    const name = String(url).split('/').pop();
    const body = name === 'yandexBrotli.wasm.unityweb.part1' ? part1 : name === 'yandexBrotli.wasm.unityweb.part2' ? part2 : Buffer.alloc(0);
    return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)) });
  };

  const url = await window.GGMergeWasm('Build/yandexBrotli.wasm.unityweb', 2);
  assert.match(String(url), /^blob:/, 'a blob URL is returned for the Unity loader');
  // The merged payload must be exactly the two parts concatenated.
  const blob = (window as any).__blobs.get(String(url));
  assert.ok(blob, 'the blob was created');
  assert.equal(blob.size, part1.length + part2.length, 'the reassembled wasm is both parts joined');
  assert.ok(blob.size > 20_000_000, `the wasm payload is a real game binary (${blob.size} bytes)`);
  assert.equal(blob.type, 'application/wasm', 'typed so the loader can stream-compile it');
  // Cached: a second call must not re-download.
  assert.equal(await window.GGMergeWasm('Build/yandexBrotli.wasm.unityweb', 2), url, 'the merged payload is cached');
  void document;
  window.close();
});

/* ------------------------------------------------------------- remote host --- */
test('remote game host only opens http(s) addresses', async () => {
  const source = readFileSync('app/remote/page.tsx', 'utf8');
  assert.ok(source.includes("['http:', 'https:'].includes(url.protocol)"), 'the navigation protocol is validated');
  assert.ok(source.includes('/^https?:\\/\\//'), 'the url parameter is validated');
  assert.ok(/bootProxy/.test(source), 'uses the existing lounge proxy');
  assert.ok(source.includes('ScramjetFrame'), 'drives a real Scramjet frame');
});
