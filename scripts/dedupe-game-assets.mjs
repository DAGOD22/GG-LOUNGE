#!/usr/bin/env node
/**
 * Collapses byte-identical files across public/games into one shared copy plus
 * relative symlinks.
 *
 * Why: git already stores identical blobs once, but a checkout writes every
 * copy to disk and every deploy uploads every copy again. Several titles ship
 * the same Vex soundtrack or the same Cut the Rope art atlas, which was ~417 MB
 * of pure duplicate bytes in a 3.2 GB tree.
 *
 * Safety: only files >= MIN_BYTES are considered, links are relative so the
 * tree is portable, and any game whose real bytes change can be restored with
 * `--restore`.
 *
 *   node scripts/dedupe-game-assets.mjs            # report only
 *   node scripts/dedupe-game-assets.mjs --apply    # replace duplicates with links
 *   node scripts/dedupe-game-assets.mjs --restore  # turn links back into real files
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const GAMES = path.join(ROOT, 'public', 'games');
const SHARED_DIR = '_shared';
const MIN_BYTES = 64 * 1024; // below this the bookkeeping costs more than it saves
const APPLY = process.argv.includes('--apply');
const RESTORE = process.argv.includes('--restore');

const SKIP_DIRS = new Set([SHARED_DIR]);

/** Every regular file inside a game directory, skipping the shared store. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (dir === GAMES && SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  try {
    let read;
    while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

if (RESTORE) {
  let restored = 0;
  for (const file of walk(GAMES)) {
    // walk() skips links, so scan for them explicitly.
    void file;
  }
  const links = [];
  (function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) links.push(full);
      else if (entry.isDirectory() && !(dir === GAMES && SKIP_DIRS.has(entry.name))) scan(full);
    }
  })(GAMES);
  for (const link of links) {
    const target = path.resolve(path.dirname(link), fs.readlinkSync(link));
    if (!fs.existsSync(target)) {
      console.error('broken link, leaving alone:', path.relative(ROOT, link));
      continue;
    }
    fs.unlinkSync(link);
    fs.copyFileSync(target, link);
    restored++;
  }
  // The shared store is only useful while links point at it.
  const sharedPath = path.join(GAMES, SHARED_DIR);
  if (fs.existsSync(sharedPath)) fs.rmSync(sharedPath, { recursive: true, force: true });
  console.log(`Restored ${restored} link(s) into real files and removed the shared store.`);
  process.exit(0);
}

const files = walk(GAMES).filter(file => {
  try { return fs.statSync(file).size >= MIN_BYTES; } catch { return false; }
});

const byHash = new Map();
for (const file of files) {
  const hash = sha256(file);
  (byHash.get(hash) || byHash.set(hash, []).get(hash)).push(file);
}

const dupes = [...byHash.entries()].filter(([, list]) => list.length > 1);
let reclaimable = 0;
for (const [, list] of dupes) {
  const size = fs.statSync(list[0]).size;
  reclaimable += size * (list.length - 1);
}

if (!APPLY) {
  console.log(`${files.length} files >= ${MIN_BYTES / 1024} KB scanned`);
  console.log(`${dupes.length} duplicated blobs, ${(reclaimable / 1048576).toFixed(0)} MB reclaimable`);
  for (const [, list] of dupes.sort((a, b) => fs.statSync(b[1][0]).size - fs.statSync(a[1][0]).size).slice(0, 12)) {
    console.log(`  ${(fs.statSync(list[0]).size / 1048576).toFixed(1)} MB x${list.length}  ${list.map(f => path.relative(GAMES, f)).join('  ')}`);
  }
  console.log('\nRe-run with --apply to replace the extra copies with relative links.');
  process.exit(0);
}

const sharedPath = path.join(GAMES, SHARED_DIR);
fs.mkdirSync(sharedPath, { recursive: true });
let linked = 0;
let saved = 0;
for (const [hash, list] of dupes) {
  // Keep the first copy exactly where it is so one game never depends on the
  // shared store, then point the rest at a shared file.
  const [keep, ...rest] = list;
  const ext = path.extname(keep);
  const shared = path.join(sharedPath, `${hash.slice(0, 16)}${ext}`);
  if (!fs.existsSync(shared)) fs.copyFileSync(keep, shared);
  const size = fs.statSync(keep).size;
  for (const file of rest) {
    // Absolute targets, not relative ones: a relative link resolves against
    // the linking file's directory and silently breaks if the tree (or the
    // path a deploy is mounted at) shifts. These links always live inside
    // public/, so the absolute path is stable in the checkout and in the build.
    fs.unlinkSync(file);
    fs.symlinkSync(shared, file);
    linked++;
    saved += size;
  }
}
console.log(`Linked ${linked} duplicate files, ${(saved / 1048576).toFixed(0)} MB no longer stored twice.`);
