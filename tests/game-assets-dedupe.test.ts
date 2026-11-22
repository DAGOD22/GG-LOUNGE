import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, lstatSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const GAMES = join(new URL('..', import.meta.url).pathname, 'public', 'games');
const MIN_BYTES = 64 * 1024; // matches scripts/dedupe-game-assets.mjs
const WARN_BYTES = 8 * 1024 * 1024;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Duplicate payloads are what made this checkout bloated: the same Ruffle
 * runtime shipped 47 times, the same art atlases twice over. Git stores those
 * blobs once, but every copy still landed on disk. scripts/dedupe-game-assets.mjs
 * hardlinks them, which saves the space without changing what any tool sees.
 */
test('large byte-identical payloads share one inode', () => {
  const seen = new Map<string, string[]>();
  for (const file of walk(GAMES)) {
    let size = 0;
    try { size = statSync(file).size; } catch { continue; }
    if (size < MIN_BYTES) continue;
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    (seen.get(hash) || seen.set(hash, []).get(hash)!).push(file.slice(GAMES.length + 1));
  }

  const spread = [...seen.values()]
    .map(list => ({ list, inodes: new Set(list.map(f => statSync(join(GAMES, f)).ino)) }))
    .filter(entry => entry.inodes.size > 1);

  assert.deepEqual(
    spread.slice(0, 5).map(e => e.list[0]),
    [],
    'identical payloads on separate inodes — run: npm run dedupe:games:apply',
  );
});

test('no game asset is a symlink', () => {
  // Symlinks are not deployable here. Vercel copies public/ and dereferences
  // links as it goes: a target inside public/ fails with "Cannot copy X to a
  // subdirectory of itself", and a target outside it fails the same way. Two
  // production builds died on this, so it is asserted rather than remembered.
  const links = walk(GAMES).filter(file => lstatSync(file).isSymbolicLink());
  assert.deepEqual(links.slice(0, 5).map(f => f.slice(GAMES.length + 1)), []);
});

test('deduplicated files are still complete and readable', () => {
  // Hardlinks share bytes, so a truncated or wrong-inode link would corrupt
  // several games at once. Spot-check the payloads that are linked most widely.
  const targets = [
    ['bloonstd2', 'c5c02c4e65c1c4423a97.wasm', 6593880],
    ['candy-crush', 'app.js', null],
  ] as const;
  for (const [game, name, size] of targets) {
    const file = join(GAMES, game, name);
    assert.ok(existsSync(file), `${game}/${name} is missing`);
    const stat = statSync(file);
    assert.ok(stat.size > 0, `${game}/${name} is empty`);
    if (size) assert.equal(stat.size, size, `${game}/${name} changed size`);
  }
});

test('game entry points still load', () => {
  // A hardlink mistake would most likely show up as a game that cannot run.
  const entryPoints = ['2048', 'bloonstd2', 'candy-crush', 'doodle-jump', 'cut-the-rope', 'moto-x3m'];
  for (const id of entryPoints) {
    const file = join(GAMES, id, 'index.html');
    assert.ok(existsSync(file), `${id}/index.html is missing`);
    assert.ok(readFileSync(file, 'utf8').length > 200, `${id}/index.html looks truncated`);
  }
});

test('oversized single payloads are known and intentional', () => {
  // Not a hard failure — these titles were explicitly requested and are large by
  // nature (full Unity builds, a 49 MB GameMaker export). This exists so a *new*
  // surprise huge file shows up in review instead of hiding.
  const big = walk(GAMES).filter(file => {
    try { return statSync(file).size > WARN_BYTES; } catch { return false; }
  });
  // 60 legitimate payloads today; the cap is headroom, not a target.
  assert.ok(big.length < 90, `unexpected number of >8 MB payloads: ${big.length}`);
});
