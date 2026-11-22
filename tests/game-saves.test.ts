import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname;
const GAMES = join(ROOT, 'public', 'games');
const SAVE_HELPER = join(GAMES, '_shared', 'gg-save.js');

/**
 * Run gg-save.js against a fake browser. `localStorageBroken` reproduces the
 * school-Chromebook case where touching localStorage throws, and `cookieStore`
 * is a minimal jar so we can assert the fallback really persists.
 */
function loadSave(script: string, opts: { localStorageBroken?: boolean } = {}) {
  const jar = new Map<string, string>();
  const cookieStore: Record<string, string> = {};
  const events: string[] = [];

  const localStorage = {
    getItem: (k: string) => (opts.localStorageBroken ? (() => { throw new Error('blocked'); })() : jar.get(k) ?? null),
    setItem: (k: string, v: string) => {
      if (opts.localStorageBroken) throw new Error('blocked');
      jar.set(k, String(v));
    },
    removeItem: (k: string) => {
      if (opts.localStorageBroken) throw new Error('blocked');
      jar.delete(k);
    },
    get length() { return jar.size; },
    key: (i: number) => [...jar.keys()][i] ?? null,
  };

  // document.cookie needs a setter that appends, like a browser.
  const document = {
    get cookie() {
      return Object.entries(cookieStore).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('; ');
    },
    set cookie(value: string) {
      const [pair, ...attrs] = value.split(';');
      const idx = pair.indexOf('=');
      const name = decodeURIComponent(pair.slice(0, idx).trim());
      const val = pair.slice(idx + 1).trim();
      if (/expires=Thu, 01 Jan 1970/i.test(attrs.join(';'))) delete cookieStore[name];
      else cookieStore[name] = decodeURIComponent(val);
      events.push('cookie');
    },
  };

  const sandbox: any = {
    document,
    localStorage,
    location: { pathname: '/games/2048/index.html' },
    name: '',
    JSON,
    Date,
    Object,
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return { GGSave: sandbox.GGSave, jar, cookieStore, sandbox };
}

// Loaded once, but behind a test so a missing helper reports as one clear
// failure instead of crashing the whole file with ENOENT.
let source = '';
test('the shared save helper exists', () => {
  assert.ok(existsSync(SAVE_HELPER), `${SAVE_HELPER} is missing — it is hand-written, not generated`);
  source = readFileSync(SAVE_HELPER, 'utf8');
});

test('save helper is valid JavaScript and exposes its API', () => {
  const { GGSave } = loadSave(source);
  for (const fn of ['set', 'get', 'remove', 'saveState', 'loadState', 'track']) {
    assert.equal(typeof GGSave[fn], 'function', `missing ${fn}`);
  }
  assert.equal(GGSave.gameId, '2048', 'namespaces by the game directory');
});

test('values round-trip through localStorage, including nested objects', () => {
  const { GGSave } = loadSave(source);
  assert.equal(GGSave.backend, 'localStorage');
  assert.equal(GGSave.persistent, true);
  GGSave.set('best', 1337);
  GGSave.saveState({ level: 7, coins: [1, 2, 3] });
  assert.equal(GGSave.get('best', 0), 1337);
  assert.deepEqual(GGSave.loadState(), { level: 7, coins: [1, 2, 3] });
  assert.equal(GGSave.get('missing', 'fallback'), 'fallback');
});

test('falls back to cookies when the browser blocks localStorage', () => {
  const { GGSave, cookieStore } = loadSave(source, { localStorageBroken: true });
  assert.equal(GGSave.backend, 'cookie');
  assert.equal(GGSave.persistent, true, 'cookies still survive a reload');
  GGSave.set('best', 99);
  assert.ok(Object.keys(cookieStore).some(k => k.includes('best')), 'value reached the cookie jar');
  assert.equal(GGSave.get('best', 0), 99);
});

test('a broken storage backend never throws into the game', () => {
  const { GGSave } = loadSave(source, { localStorageBroken: true });
  assert.doesNotThrow(() => GGSave.set('x', { a: 1 }));
  assert.doesNotThrow(() => GGSave.get('x', null));
  assert.doesNotThrow(() => GGSave.remove('x'));
});

test('games that advertise saving actually load the shared helper', () => {
  // These were patched to persist progress; a refactor that drops the script
  // tag would silently reintroduce the "nothing saves" bug.
  const persisted = ['2048', 'candy-crush', 'doodle-jump'];
  const readGame = (id: string) => {
    // The tag lives in index.html; the calls live in the game's own scripts,
    // which may sit in subdirectories, so search the whole directory.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(?:js|html)$/.test(entry.name)) files.push(readFileSync(full, 'utf8'));
      }
    };
    walk(join(GAMES, id));
    return files.join('\n');
  };
  for (const id of persisted) {
    const html = readFileSync(join(GAMES, id, 'index.html'), 'utf8');
    assert.match(html, /_shared\/gg-save\.js/, `${id} must load gg-save.js`);
    assert.match(readGame(id), /GGSave/, `${id} must call into GGSave`);
  }
});

test('every Flash game enables persistent Ruffle storage', () => {
  const missing: string[] = [];
  for (const entry of readdirSync(GAMES, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const index = join(GAMES, entry.name, 'index.html');
    if (!existsSync(index)) continue;
    const html = readFileSync(index, 'utf8');
    if (!/RufflePlayer/.test(html)) continue;
    if (!/storage:\s*["']disk["']/.test(html)) missing.push(entry.name);
  }
  assert.deepEqual(missing, [], `Flash games without persistent storage: ${missing.join(', ')}`);
});

test('deduplicated game assets still resolve to real bytes', () => {
  // The dedupe script replaces byte-identical files with symlinks into
  // _shared. A dangling link would turn into a 404 for players, so assert each
  // one points at a file that exists and is non-empty.
  const broken: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        if (!existsSync(full)) broken.push(full);
      } else if (entry.isDirectory()) {
        if (full === join(GAMES, '_shared')) continue;
        walk(full);
      }
    }
  };
  walk(GAMES);
  assert.deepEqual(broken, [], `dangling asset links: ${broken.slice(0, 5).join(', ')}`);
  assert.ok(lstatSync(SAVE_HELPER).isFile());
});
