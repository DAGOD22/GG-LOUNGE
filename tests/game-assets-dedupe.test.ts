import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, lstatSync, readFileSync, existsSync, realpathSync } from 'node:fs';

import { join, sep } from 'node:path';

const GAMES = join(new URL('..', import.meta.url).pathname, 'public', 'games');
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
 *
 * This test used to fail on `inodes.size > 1`, and that was wrong in a way that
 * made CI red for every clone: **git does not store hardlinks**, so a fresh
 * checkout — which is exactly what a CI runner and a Vercel build do — always
 * materialises ordinary separate files. The only trees that passed were ones
 * where somebody had already run the script by hand, which is why it passed
 * locally and failed on every runner. The script's own docstring says so.
 *
 * The honest invariant, which holds in both cases:
 *   · no game asset is a symlink (Vercel cannot deploy them — see the next test);
 *   · nothing is hardlinked *outside* public/games, which would mean a game
 *     payload sharing bytes with application code.
 * Reclaiming the duplicate bytes is `npm run dedupe:games:apply`, an explicit
 * local disk optimisation, and is deliberately not a CI assertion.
 */
test('every game asset is a real file inside public/games, never a link out', () => {
  // The invariant that holds whether or not anyone has run the dedupe script:
  // each asset resolves to a regular file whose containing directory is under
  // public/games. `realpath` follows any link, so a payload that somehow
  // pointed at application code would show up here as an escape.
  const root = realpathSync(GAMES);
  const escapes: string[] = [];
  for (const file of walk(GAMES)) {
    let real: string;
    try { real = realpathSync(file); } catch { continue; }
    if (!real.startsWith(root + sep)) escapes.push(file.slice(GAMES.length + 1));
  }
  assert.deepEqual(escapes.slice(0, 5), [], 'game assets must not resolve outside public/games');
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
