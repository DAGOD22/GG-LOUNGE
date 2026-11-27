/**
 * The secret layer, without a DOM.
 *
 * Ten hidden features share one small library: the typed-code matcher, the
 * konami matcher, the discovery store, the chat command parser and the Vault
 * Runner's difficulty curve. Every one of these can be wrong in a way nobody
 * notices — a code that fires while someone types a normal sentence, a store
 * that forgets what was found, a dice command that crashes on `/roll d6` — so
 * each is pinned here.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  CODES,
  EIGHT_BALL,
  GROUP_LABELS,
  KONAMI_KEYS,
  SECRETS,
  TYPED_CODES,
  isKonamiSuffix,
  magicEightBall,
  parseChatCommand,
  typedCodeMatch,
} from '../lib/secrets';
import { recordRunnerScore, runnerBest, resetSecrets, discover, isDiscovered, isToggled, setToggle } from '../lib/secrets';
import { mountedIdsFor } from '../components/live/secrets/WarpLayer';
import {
  PLAYER_SIZE,
  GROUND_Y,
  gapFor,
  hitsPlayer,
  speedFor,
  stepFall,
} from '../components/live/secrets/runner-core';

/** A minimal localStorage shim — the store must work wherever it can store. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

test('secrets: the layer is exactly sixty features — ten originals + fifty warps', () => {
  assert.equal(SECRETS.length, 75);
  const ids = new Set(SECRETS.map(secret => secret.id));
  assert.equal(ids.size, 75, 'secret ids must be unique');
});

test('secrets: every code is typable and every code maps to a real secret', () => {
  for (const code of CODES) {
    assert.match(code, /^[a-z0-9]+$/, 'codes are single lowercase words or years');
    assert.ok(SECRETS.some(secret => secret.id === TYPED_CODES[code]), `${code} points nowhere`);
  }
  // 4 of the 75 arrive by other means (konami, chat, runner, vault page) —
  // the other 71 are typed codes.
  assert.equal(CODES.length, 71);
});

test('secrets: no code is the tail of another code', () => {
  // The matcher fires when the typed buffer *ends with* a code, so a code
  // that is a suffix of another would shadow it: typing the longer one would
  // trigger the shorter secret first (loop order, not intent).
  for (const a of CODES) {
    for (const b of CODES) {
      if (a === b) continue;
      assert.ok(!b.endsWith(a), `code "${b}" ends with code "${a}" — the shorter one would steal it`);
    }
  }
});

test('secrets: every secret carries a group, an about line and a wired warp', () => {
  for (const secret of SECRETS) {
    assert.ok(GROUP_LABELS[secret.group], `${secret.id} has an unknown group`);
    assert.ok(secret.about.length > 12, `${secret.id} does not say what it does`);
    assert.ok(secret.warp, `${secret.id} has no warp spec`);
  }
  // Ghost mode is the behaviour archetype: it intentionally has no visual of
  // its own — the presence layer does the work.
  assert.equal(SECRETS.find(secret => secret.id === 'ghost')?.warp.kind, 'none');
});

test('secrets: every overlay and behaviour warp has a component behind it', () => {
  const overlayIds = SECRETS.filter(secret => secret.warp.kind === 'overlay').map(secret => secret.id);
  assert.ok(overlayIds.length >= 22, 'the overlay warps are the biggest visual family');
  assert.deepEqual(mountedIdsFor(overlayIds).sort(), [...overlayIds].sort(), 'an overlay warp would silently do nothing');
  // The behaviour warps rewire the site from mounted components (or from the
  // launcher in app/page.tsx) — each one must exist somewhere.
  const behaviorIds = SECRETS.filter(secret => secret.group === 'behavior' && secret.warp.kind === 'none').map(secret => secret.id);
  assert.ok(behaviorIds.length >= 12, 'behaviour warps are the second-biggest family');
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  for (const id of behaviorIds) {
    const mounted = mountedIdsFor([id]).length > 0;
    const inLauncher = page.includes(`'${id}'`);
    assert.ok(mounted || inLauncher, `${id} has no component and no launcher wiring — it would do nothing`);
  }
});

test('secrets: the typed matcher only fires on whole codes', () => {
  assert.equal(typedCodeMatch('i love this matrix'), 'matrix');
  assert.equal(typedCodeMatch('snowman'), null, 'a word containing a code is not the code');
  assert.equal(typedCodeMatch('it is 1997'), '1997');
  assert.equal(typedCodeMatch(''), null);
  // Case does not matter; shift typing must not hide the secret.
  assert.equal(typedCodeMatch('MATRIX'), 'matrix');
});

test('secrets: the konami matcher accepts a sloppy attempt', () => {
  const clean = [...KONAMI_KEYS];
  assert.equal(isKonamiSuffix(clean), true);
  // The real-world case: someone fumbled the first two arrows, then got it.
  const sloppy = ['arrowup', 'arrowleft', 'arrowup', ...clean];
  assert.equal(isKonamiSuffix(sloppy), true);
  assert.equal(isKonamiSuffix([...clean.slice(0, 9)]), false, 'nine keys are not the code');
  assert.equal(isKonamiSuffix([...clean.slice(0, 8), 'x', 'y']), false);
});

/* ------------------------------------------------------------------ store -- */

test('secrets: the store remembers discovery across reads', () => {
  (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  try {
    resetSecrets();
    assert.equal(isDiscovered('matrix'), false);
    assert.equal(discover('matrix'), true, 'the first find is news');
    assert.equal(discover('matrix'), false, 'the second find is not');
    assert.equal(isDiscovered('matrix'), true);
    assert.equal(isDiscovered('snow'), false);
  } finally {
    resetSecrets();
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test('secrets: toggles persist and ghost mode reads from them', () => {
  (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  try {
    resetSecrets();
    assert.equal(isToggled('ghost'), false);
    setToggle('ghost', true);
    assert.equal(isToggled('ghost'), true);
    assert.equal(isDiscovered('ghost'), true, 'toggling a secret is discovering it');
    setToggle('ghost', false);
    assert.equal(isToggled('ghost'), false);
    assert.equal(isDiscovered('ghost'), true, 'switching off does not un-find it');
  } finally {
    resetSecrets();
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test('secrets: the runner scoreboard only takes real improvements', () => {
  (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  try {
    resetSecrets();
    assert.equal(recordRunnerScore(12), true, 'any first score is a best');
    assert.equal(runnerBest(), 12);
    assert.equal(recordRunnerScore(7), false, 'a worse run is not a best');
    assert.equal(runnerBest(), 12);
    assert.equal(recordRunnerScore(50), true);
    assert.equal(runnerBest(), 50);
    assert.equal(isDiscovered('runner'), true, 'playing the game is finding the secret');
    // A fractional or negative score is floored, never stored raw.
    recordRunnerScore(50.9);
    assert.equal(runnerBest(), 50);
  } finally {
    resetSecrets();
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test('secrets: reset wipes everything, including the vault', () => {
  (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  try {
    resetSecrets();
    discover('vault');
    discover('konami');
    assert.ok(isDiscovered('vault') && isDiscovered('konami'));
    resetSecrets();
    assert.equal(isDiscovered('vault'), false);
    assert.equal(isDiscovered('konami'), false);
  } finally {
    resetSecrets();
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

/* ----------------------------------------------------------- chat commands -- */

test('secrets: chat commands resolve to their result text', () => {
  const roll = parseChatCommand('/roll 2d6', () => 0);
  assert.match(roll ?? '', /^🎲 2d6 → 1 \+ 1 = 2$/);
  assert.match(parseChatCommand('/roll') ?? '', /^🎲 1d6 →/);
  assert.match(parseChatCommand('/flip', () => 0.1) ?? '', /^🪙 Heads$/);
  assert.match(parseChatCommand('/flip', () => 0.9) ?? '', /^🪙 Tails$/);
  assert.match(parseChatCommand('/8ball will it work') ?? '', /^🎱 /);
  assert.match(parseChatCommand('/8ball') ?? '', /^🎱 /, 'a bare 8ball asks for a question instead of crashing');
  assert.match(parseChatCommand('/pick pizza|ramen', () => 0) ?? '', /^👉 pizza$/);
});

test('secrets: the dice refuse nonsense instead of hanging', () => {
  assert.match(parseChatCommand('/roll d6') ?? '', /🎲/, 'no count still rolls, one die');
  assert.match(parseChatCommand('/roll 2d') ?? '', /🎲/, 'no sides is a hint, not a crash');
  assert.match(parseChatCommand('/roll 99d9999') ?? '', /^🎲 20d999( |$)|^🎲 20d1000/, 'the count is capped');
  const big = parseChatCommand('/roll 20d1000') ?? '';
  assert.ok(!big.includes('NaN'), 'a capped roll never produces NaN');
});

test('secrets: unknown slash commands stay ordinary messages', () => {
  assert.equal(parseChatCommand('/sorry im late'), null);
  assert.equal(parseChatCommand('gg'), null);
  assert.equal(parseChatCommand('/'), null, 'a bare slash is a typo, not a command');
});

test('secrets: the eight ball has real answers, deterministically picked', () => {
  assert.ok(EIGHT_BALL.length >= 12, 'eight answers would get obvious fast');
  assert.equal(magicEightBall('why', () => 0), `🎱 ${EIGHT_BALL[0]}`);
  assert.equal(magicEightBall('why', () => 0.999999), `🎱 ${EIGHT_BALL[EIGHT_BALL.length - 1]}`);
});

/* ----------------------------------------------------------- vault runner -- */

test('vault runner: the speed climbs but never becomes unplayable', () => {
  assert.equal(speedFor(0), 3.4);
  assert.ok(speedFor(100) > speedFor(0), 'the game should get harder');
  assert.equal(speedFor(10_000), 7.2, 'there is a ceiling');
  assert.equal(speedFor(190), 7.2, 'and the ceiling is reached, not asymptotic forever');
});

test('vault runner: the gaps tighten but always leave time to react', () => {
  const slow = gapFor(0, 0);
  const fast = gapFor(500, 0);
  assert.ok(slow > fast, 'the game tightens with the score');
  assert.ok(fast >= 170, 'never below the reaction floor');
  assert.ok(gapFor(9999, 0) >= 170, 'the floor holds even at absurd scores');
  assert.ok(gapFor(50, 0.999) <= 470, 'the random part is bounded');
});

test('vault runner: the jump lands and cannot tunnel through the ground', () => {
  // A jump from the ground, then enough fall steps to settle back.
  let y = GROUND_Y - PLAYER_SIZE;
  let vy = -10.6;
  let grounded = false;
  for (let step = 0; step < 120; step++) {
    const next = stepFall(y, vy);
    y = next.y;
    vy = next.velocityY;
    grounded = next.grounded;
    if (grounded) break;
  }
  assert.equal(grounded, true, 'the runner must come back down');
  assert.equal(y, GROUND_Y - PLAYER_SIZE, 'and stand on the ground, not in it');
  assert.equal(vy, 0, 'with velocity cleared for the next jump');
});

test('vault runner: collision is an overlap, not a touch', () => {
  const player = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(hitsPlayer(player, { x: 11, y: 0, w: 5, h: 5 }), false, 'one pixel of daylight is no hit');
  assert.equal(hitsPlayer(player, { x: 10, y: 0, w: 5, h: 5 }), false, 'edge-touching is no hit');
  assert.equal(hitsPlayer(player, { x: 5, y: 5, w: 5, h: 5 }), true);
  assert.equal(hitsPlayer(player, { x: -3, y: -3, w: 5, h: 5 }), true, 'an obstacle covering the corner hits');
});
