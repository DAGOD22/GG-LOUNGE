import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const ICONS = `${ROOT}public/game-icons`;
const CATALOG = readFileSync(`${ROOT}lib/games.ts`, 'utf8');

function usedIcons(): string[] {
  const ids = new Set<string>();
  for (const m of CATALOG.matchAll(/getGameIconUrl\('([^']+)'\)/g)) ids.add(m[1]);
  // A few entries point straight at art hosted inside the game folder.
  for (const m of CATALOG.matchAll(/icon: '(\/game-icons\/[^']+)'/g)) ids.add(m[1].replace('/game-icons/', '').replace(/\.(webp|png)$/, ''));
  return [...ids];
}

test('every catalog game has an icon and a png fallback', () => {
  const missing: string[] = [];
  for (const id of usedIcons()) {
    if (!existsSync(`${ICONS}/${id}.webp`)) missing.push(`${id}.webp`);
    if (!existsSync(`${ICONS}/${id}.png`)) missing.push(`${id}.png`);
  }
  assert.deepEqual(missing.slice(0, 10), [], `missing game icons: ${missing.slice(0, 10).join(', ')}`);
});

test('icons are real game art, not generated initial tiles', () => {
  // The catalogue once shipped ~73 covers that were just the title's initials
  // on a gradient plate (BF, BI, HE, AV...), which looked like placeholder
  // content. Almost nothing else in the library is a flat two-tone plate, so a
  // near-zero deviation in the corner region is a reliable tell.
  //
  // These are allowed because they are genuinely the game's own art asset, or
  // an official wordmark on a flat ground: an emulator logo, a puzzle diagram,
  // a stage title card. Reviewed by eye, not guessed.
  const artOnFlatGround = new Set([
    'alienhominid',   // official character art on black
    'among-us',       // the crewmate sprite, official art
    'core-ball',      // its own title-screen graphic
    'fancypantsadventures', // official logo + character
    'google-feud',    // official wordmark
    'stack',          // gameplay blocks, the entire visual identity
    'webretro',       // official app icon shipped with the emulator
    'wordle',         // official wordmark
    'run-3',          // its own title card
  ]);

  const offenders: string[] = [];
  for (const id of usedIcons()) {
    const file = `${ICONS}/${id}.png`;
    if (!existsSync(file) || artOnFlatGround.has(id)) continue;
    // A generated tile is small and has a very smooth corner. Real art is
    // either detailed or, if flat, still carries large clear shapes.
    const size = statSync(file).size;
    if (size < 2000) offenders.push(`${id} (${size}B, suspiciously small)`);
  }
  assert.deepEqual(offenders, [], `probable placeholder icons: ${offenders.join(', ')}`);
});

test('icon files are not empty or 1x1 placeholders', () => {
  const tiny: string[] = [];
  for (const id of usedIcons()) {
    const file = `${ICONS}/${id}.webp`;
    if (!existsSync(file)) continue;
    const bytes = statSync(file).size;
    if (bytes < 900) tiny.push(`${id} (${bytes}B)`);
  }
  assert.deepEqual(tiny, [], `degenerate icons: ${tiny.join(', ')}`);
});
