/**
 * Re-prove every claim in lib/two-player.ts against the shipped game source.
 *
 * The rule this enforces: a game is only offered as "2 Player" if its own code
 * shows a second player. A list that drifts from reality is worse than no list,
 * because it sends two people into a room to discover the game will not take
 * them both.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'public/games';
const LIST = 'lib/two-player.ts';

function sourceFor(id) {
  const dir = path.join(ROOT, id);
  let text = '';
  const walk = (d, depth) => {
    if (depth > 2) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.git|bower_components/.test(entry.name)) walk(p, depth + 1);
      } else if (/\.(js|json|html)$/.test(entry.name)) {
        // Some engines keep the proof in a data file rather than code: a
        // Construct project declares its two-player layout in data.json, and
        // restricting the scan to .js reported a real 2P game as unproven.
        try { if (fs.statSync(p).size < 8e6) text += fs.readFileSync(p, 'utf8'); } catch { /* unreadable */ }
      }
    }
  };
  walk(dir, 0);
  return text;
}

function proves(text, evidence) {
  if (!text) return { ok: false, why: 'no source found' };
  switch (evidence) {
    default:
      return new RegExp(evidence, 'i').test(text)
        ? { ok: true }
        : { ok: false, why: `evidence "${evidence}" not found in source` };
  }
}

const declared = [...fs.readFileSync(LIST, 'utf8').matchAll(/\{ id: '([^']+)'[^}]*evidence: '([^']+)'/g)]
  .map(m => ({ id: m[1], evidence: m[2] }));

let bad = 0;
for (const { id, evidence } of declared) {
  const text = sourceFor(id);
  const result = proves(text, evidence);
  if (!result.ok) {
    bad++;
    console.log(`FAIL ${id} (${evidence}): ${result.why}`);
  }
}
console.log(`\n${declared.length - bad}/${declared.length} two-player claims verified against shipped source`);
if (!declared.length) { console.log('FAIL: no claims parsed — did the list format change?'); process.exit(1); }
process.exit(bad ? 1 : 0);
