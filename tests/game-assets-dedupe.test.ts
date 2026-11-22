import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { readlinkSync } from 'node:fs';

const GAMES = join(new URL('..', import.meta.url).pathname, 'public', 'games');
const MIN_BYTES = 64 * 1024; // matches scripts/dedupe-game-assets.mjs
const WARN_BYTES = 8 * 1024 * 1024;

/**
 * Duplicate payloads are what made the deploy carry ~441 MB of dead weight: the
 * same Ruffle runtime shipped 47 times, the same Vex soundtrack twice, and so
 * on. scripts/dedupe-game-assets.mjs collapses them into public/games/_shared
 * plus symlinks, and this test stops a future import from quietly re-adding a
 * large duplicate.
 */
test('no large byte-identical payloads are stored more than once', () => {
  const seen = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue; // already deduplicated
      if (entry.isDirectory()) {
        if (full === join(GAMES, '_shared')) continue;
        walk(full);
      } else if (entry.isFile()) {
        let size = 0;
        try { size = statSync(full).size; } catch { continue; }
        if (size < MIN_BYTES) continue;
        const hash = createHash('sha256').update(readFileSync(full)).digest('hex');
        (seen.get(hash) || seen.set(hash, []).get(hash)!).push(full.slice(GAMES.length + 1));
      }
    }
  };
  walk(GAMES);

  const offenders = [...seen.values()].filter(list => list.length > 1);
  assert.deepEqual(
    offenders.slice(0, 5),
    [],
    'duplicate payloads found — run: node scripts/dedupe-game-assets.mjs --apply',
  );
});

test('dedupe links are relative and inside the repository', () => {
  // An absolute link works in this checkout and breaks in any other clone —
  // it dangles in Vercel's /vercel/path0 and the asset 404s. This happened
  // once, so it is now a test.
  const absolute: string[] = [];
  const outside: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = readlinkSync(full);
        if (isAbsolute(target)) absolute.push(full.slice(GAMES.length + 1));
        const resolved = resolve(dirname(full), target);
        if (!resolved.includes('.game-assets-shared')) outside.push(resolved);
      } else if (entry.isDirectory()) walk(full);
    }
  };
  walk(GAMES);
  assert.deepEqual(absolute, [], 'absolute links: run node scripts/dedupe-game-assets.mjs --restore --apply');
  assert.deepEqual(outside, [], 'links must point at .game-assets-shared, not at a game');
});

test('the shared asset store only holds real files', () => {
  const shared = join(GAMES, '_shared');
  let entries: string[] = [];
  try { entries = readdirSync(shared); } catch { entries = []; }
  for (const name of entries) {
    const stat = statSync(join(shared, name));
    assert.ok(stat.size > 0, `${name} in _shared is empty`);
  }
});

test('oversized single payloads are known and intentional', () => {
  // Not a hard failure — these titles were explicitly requested and are large
  // by nature (full Unity builds, a 49 MB GameMaker export). This test exists
  // so a *new* surprise huge file shows up in review instead of hiding.
  const big: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else {
        try { if (statSync(full).size > WARN_BYTES) big.push(full.slice(GAMES.length + 1)); } catch {}
      }
    }
  };
  walk(GAMES);
  // 60 legitimate large payloads today (Unity/GameMaker/Godot builds). The cap
  // is headroom above that, not a target: it only fires when something new and
  // unexpectedly huge lands.
  assert.ok(big.length < 90, `unexpected number of >8 MB payloads: ${big.length}`);
});
