#!/usr/bin/env node
/**
 * Turns on persistent Flash storage for every Ruffle-hosted game.
 *
 * Ruffle can back Flash "shared objects" (high scores, saved levels, unlocked
 * content) with localStorage instead of keeping them in memory for the tab's
 * lifetime. It reads window.RufflePlayer.config at load time, so the setting has
 * to be present before ruffle.js runs — which is why this injects a small block
 * immediately before the ruffle.js script tag rather than editing each game's
 * own loader.
 *
 *   node scripts/enable-flash-saves.mjs            # report only
 *   node scripts/enable-flash-saves.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';

const GAMES = path.resolve(import.meta.dirname, '..', 'public', 'games');
const MARKER = 'data-gg-flash-saves';
const APPLY = process.argv.includes('--apply');

const SNIPPET = `<script ${MARKER}>
      // Keep Flash shared objects (scores, saved levels, unlocks) on disk
      // instead of in memory, so progress survives a reload.
      window.RufflePlayer = window.RufflePlayer || {};
      window.RufflePlayer.config = Object.assign(
        { storage: "disk", localStorage: true, letterbox: "on" },
        window.RufflePlayer.config || {}
      );
    </script>
    `;

let patched = 0;
let already = 0;
const skipped = [];

for (const entry of fs.readdirSync(GAMES, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
  const index = path.join(GAMES, entry.name, 'index.html');
  if (!fs.existsSync(index)) continue;
  let html;
  try { html = fs.readFileSync(index, 'utf8'); } catch { continue; }
  if (!/ruffle(?:-player)?\.js|RufflePlayer/.test(html)) continue; // not a Flash title
  if (html.includes(MARKER)) { already++; continue; }
  const re = /([ \t]*)<script[^>]+src=["'][^"']*ruffle[^"']*\.js["'][^>]*>/i;
  const match = re.exec(html);
  if (!match) { skipped.push(entry.name); continue; }
  if (APPLY) {
    const indented = SNIPPET.replace(/^ {4}/gm, match[1]);
    fs.writeFileSync(index, html.slice(0, match.index) + indented + html.slice(match.index));
  }
  patched++;
}

console.log(`${APPLY ? 'Enabled' : 'Would enable'} Flash saves for ${patched} game(s); ${already} already done.`);
if (skipped.length) console.log(`No ruffle.js script tag found in: ${skipped.join(', ')}`);
if (!APPLY) console.log('Re-run with --apply to write.');
