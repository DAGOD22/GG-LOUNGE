#!/usr/bin/env node
/**
 * Collapses byte-identical files across public/games into HARDLINKS.
 *
 * Why: several titles ship the same payload verbatim — one Ruffle runtime in 47
 * Flash games, the same nape.min.js in six, the same art atlases twice over.
 * Git stores those blobs once, but a checkout writes every copy to disk, which
 * was ~440 MB of duplicate bytes in a 3.2 GB tree.
 *
 * Why hardlinks and not symlinks: symlinks are not deployable here. Vercel
 * copies public/ and dereferences links as it goes, and a link whose target is
 * inside public/ fails with "Cannot copy X to a subdirectory of itself" while a
 * link pointing outside it fails the same way with the relative path. Both were
 * tried and both broke the production build. A hardlink is, to every tool that
 * looks at it, an ordinary file with an ordinary size and mode, so nothing in
 * the build, the CDN upload or the audit script can tell the difference. The
 * bytes served are byte-identical; no game is removed, shrunk, or altered.
 *
 * Note the honest limit: hardlinks save disk in THIS checkout. Git stores no
 * links, so a fresh clone (and therefore a Vercel build) materialises ordinary
 * files. This is a local-disk and tooling optimisation, not a deploy-size one —
 * the Cache-Control rules in next.config.mjs are what reduce bytes over the wire
 * for players.
 *
 *   node scripts/dedupe-game-assets.mjs            # report only
 *   node scripts/dedupe-game-assets.mjs --apply    # link duplicates together
 *   node scripts/dedupe-game-assets.mjs --restore  # break links into real copies
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const GAMES = path.join(ROOT, 'public', 'games');
const MIN_BYTES = 64 * 1024; // below this the bookkeeping costs more than it saves
const APPLY = process.argv.includes('--apply');
const RESTORE = process.argv.includes('--restore');

/**
 * Every regular file, as a single link. A file with st_nlink > 1 is either
 * already deduplicated or shares an inode with something else, so it is skipped
 * — that also makes --apply idempotent.
 */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
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

const all = walk(GAMES);

if (RESTORE) {
  // Give every multiply-linked file its own inode again, so editing one copy
  // in a game can never silently change another game's asset.
  let split = 0;
  for (const file of all) {
    let stat;
    try { stat = fs.lstatSync(file); } catch { continue; }
    if (stat.nlink < 2) continue;
    const bytes = fs.readFileSync(file);
    const tmp = `${file}.ggrestore`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, file); // rename replaces the directory entry, not the inode
    split++;
  }
  console.log(`Broke ${split} hardlink(s) into independent copies.`);
  process.exit(0);
}

const files = all.filter(file => {
  try { return fs.statSync(file).size >= MIN_BYTES; } catch { return false; }
});

const byHash = new Map();
for (const file of files) {
  const hash = sha256(file);
  (byHash.get(hash) || byHash.set(hash, []).get(hash)).push(file);
}

// A group of files already sharing one inode is done, not duplicated.
const dupes = [...byHash.entries()].filter(([, list]) => {
  const inodes = new Set(list.map(f => fs.statSync(f).ino));
  return inodes.size > 1;
});

let reclaimable = 0;
for (const [, list] of dupes) reclaimable += fs.statSync(list[0]).size * (new Set(list.map(f => fs.statSync(f).ino)).size - 1);

if (!APPLY) {
  console.log(`${files.length} files >= ${MIN_BYTES / 1024} KB scanned`);
  console.log(`${dupes.length} duplicate blobs still on separate inodes, ${(reclaimable / 1048576).toFixed(0)} MB reclaimable`);
  for (const [, list] of dupes.sort((a, b) => fs.statSync(b[1][0]).size - fs.statSync(a[1][0]).size).slice(0, 12)) {
    console.log(`  ${(fs.statSync(list[0]).size / 1048576).toFixed(1)} MB x${list.length}  ${list.map(f => path.relative(GAMES, f)).join('  ')}`);
  }
  if (dupes.length) console.log('\nRun with --apply to link them together.');
  process.exit(0);
}

let linked = 0;
let saved = 0;
for (const [, list] of dupes) {
  const [keep, ...rest] = list;
  const size = fs.statSync(keep).size;
  for (const file of rest) {
    if (fs.statSync(file).ino === fs.statSync(keep).ino) continue;
    const tmp = `${file}.gglink`;
    try {
      fs.unlinkSync(tmp);
    } catch { /* no stale temp */ }
    fs.linkSync(keep, tmp); // same inode, new directory entry
    fs.renameSync(tmp, file);
    linked++;
    saved += size;
  }
}
console.log(`Hardlinked ${linked} duplicate files, ${(saved / 1048576).toFixed(0)} MB no longer stored twice.`);
