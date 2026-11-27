/**
 * The secret layer.
 *
 * Sixty features the site does not advertise: no menu entry, no tour step, no
 * hint anywhere except the unlisted vault page. They are discovered by typing
 * codes, pressing the oldest cheat sequence there is, using slash commands in
 * chat, playing the hidden game, or knowing the page address.
 *
 * Fifty of them are **warps** — full-site effects in the spirit of Ghost Mode:
 * they change the whole website, not a corner of it. Filters recolour every
 * pixel, transforms rotate or mirror the entire document, text warps rewrite
 * every font, overlays fill the screen. Every one is a switch: the same code
 * (or the vault's button) turns it on and off, and switching off restores
 * exactly what was underneath.
 *
 * This module holds everything that can be wrong without a DOM: the code
 * matcher, the konami matcher, the warp registry, the discovery store, the
 * chat command parser and the dice. The React side (SecretsProvider, the
 * WarpLayer, the vault page) only calls into it.
 *
 * Discovery is per browser, in localStorage. Nothing here is sent to the
 * server, and no other page links to the vault — the only way in is to know.
 */

export const SECRETS_KEY = 'gg_secrets_v1';

/* --------------------------------------------------------------- registry -- */

export const SECRET_IDS = [
  // the originals
  'konami', 'matrix', 'snow', 'xyzzy', 'timewarp', 'ghost', 'shuffle', 'chat', 'runner', 'vault',
  // theme warps — recolour every pixel
  'invert', 'nocolor', 'sepia', 'acid', 'oilslick', 'nightshift', 'eclipse', 'snowblind',
  'neon', 'vaporwave', 'arctic', 'candy', 'golden', 'thermal', 'dream',
  // layout warps — rotate, mirror, stretch, shake the whole document
  'mirror', 'downunder', 'tipsy', 'quake', 'jelly', 'funhouse', 'shrink', 'giant', 'floaty', 'drift',
  // text warps — rewrite every font
  'comic', 'oldpaper', 'hacker', 'glow', 'loud', 'rainbow',
  // overlay warps — things that fill the screen
  'meteor', 'starry', 'fireworks', 'rainfall', 'thunder', 'fireflies', 'bubbles', 'embers',
  'blossom', 'confetti', 'bats', 'ufo',
  // behaviour warps — change how the site reacts to you
  'disco', 'bigcursor', 'trail', 'ripples', 'party', 'clock', 'counter',
] as const;

export type SecretId = (typeof SECRET_IDS)[number];

/** What groups the vault page lists. */
export type SecretGroup = 'classic' | 'theme' | 'layout' | 'text' | 'overlay' | 'behavior';

export const GROUP_LABELS: Record<SecretGroup, string> = {
  classic: 'The originals',
  theme: 'Theme warps — the whole site, recoloured',
  layout: 'Layout warps — the whole site, twisted',
  text: 'Text warps — every font, replaced',
  overlay: 'Screen warps — things that fill the sky',
  behavior: 'Behaviour warps — the site acts differently',
};

/** How a warp is wired up by the WarpLayer. */
export type WarpEffect =
  /** a CSS filter chain, combined with any other active filters */
  | { kind: 'filter'; value: string }
  /** a CSS transform on the document, combined with other active transforms */
  | { kind: 'transform'; value: string }
  /** a zoom multiplier on the document */
  | { kind: 'zoom'; value: number }
  /** toggles the class `gg-warp-<id>` on <html>; the CSS lives in globals */
  | { kind: 'class' }
  /** renders an overlay component from the WarpLayer */
  | { kind: 'overlay' }
  /** no visual of its own (ghost mode lives in the presence layer) */
  | { kind: 'none' };

export type SecretKind =
  | /** typed code that toggles a warp */ 'typed-toggle'
  /** typed code that does one thing */ | 'typed-once'
  /** the arrow-sequence cheat */ | 'konami'
  /** unlocked by using a chat command */ | 'chat'
  /** unlocked by playing the hidden game */ | 'game'
  /** unlocked by visiting the hidden page */ | 'page';

export type SecretDef = {
  id: SecretId;
  name: string;
  /** Shown openly on the vault page. */
  code: string;
  /** What it actually does, in one line. */
  about: string;
  group: SecretGroup;
  kind: SecretKind;
  warp: WarpEffect;
};

const filter = (value: string): WarpEffect => ({ kind: 'filter', value });
const transform = (value: string): WarpEffect => ({ kind: 'transform', value });
const zoom = (value: number): WarpEffect => ({ kind: 'zoom', value });
const css = (): WarpEffect => ({ kind: 'class' });
const overlay = (): WarpEffect => ({ kind: 'overlay' });
const none = (): WarpEffect => ({ kind: 'none' });

export const SECRETS: SecretDef[] = [
  /* ------------------------- the originals ------------------------------- */
  {
    id: 'konami', name: 'Arcade Godmode', code: '↑ ↑ ↓ ↓ ← → ← → B A', group: 'classic', kind: 'konami',
    about: 'The oldest cheat sequence there is: retro CRT scanlines and a confetti burst.',
    warp: overlay(),
  },
  {
    id: 'matrix', name: 'Code Rain', code: 'matrix', group: 'classic', kind: 'typed-toggle',
    about: 'Falling green characters over the whole site.',
    warp: overlay(),
  },
  {
    id: 'snow', name: 'Snowfall', code: 'snow', group: 'classic', kind: 'typed-toggle',
    about: 'Snow, anywhere, any month.',
    warp: overlay(),
  },
  {
    id: 'xyzzy', name: 'Privacy Spotlight', code: 'xyzzy', group: 'classic', kind: 'typed-toggle',
    about: 'Dims everything except a small circle that follows your cursor.',
    warp: overlay(),
  },
  {
    id: 'timewarp', name: 'Time Warp', code: '1997', group: 'classic', kind: 'typed-toggle',
    about: 'A warm 1997 tint and a scrolling "best viewed at 800×600" ribbon.',
    warp: overlay(),
  },
  {
    id: 'ghost', name: 'Ghost Mode', code: 'ghost', group: 'classic', kind: 'typed-toggle',
    about: 'You stop appearing in presence entirely: no cursor, no activity, no roster row, no announcements.',
    warp: none(),
  },
  {
    id: 'shuffle', name: 'Lucky Dip', code: 'shuffle', group: 'classic', kind: 'typed-once',
    about: 'Throws you into a random game from the catalogue, instantly.',
    warp: none(),
  },
  {
    id: 'chat', name: 'Whisper Commands', code: '/roll · /flip · /8ball · /pick', group: 'classic', kind: 'chat',
    about: 'The chat box answers to a slash: dice, coins, the eight ball and a decider.',
    warp: none(),
  },
  {
    id: 'runner', name: 'Vault Runner', code: 'a game in the vault', group: 'classic', kind: 'game',
    about: 'A complete endless runner hidden in the vault, with a saved best score.',
    warp: none(),
  },
  {
    id: 'vault', name: 'The Vault', code: '/secrets', group: 'classic', kind: 'page',
    about: 'This page: every secret, every code, every switch, in the open.',
    warp: none(),
  },

  /* ------------------------- theme warps --------------------------------- */
  {
    id: 'invert', name: 'Negative World', code: 'invert', group: 'theme', kind: 'typed-toggle',
    about: 'Every pixel inverted — the site becomes its own photo negative.',
    warp: filter('invert(1) hue-rotate(180deg)'),
  },
  {
    id: 'nocolor', name: 'No Colour', code: 'nocolor', group: 'theme', kind: 'typed-toggle',
    about: 'The entire site in black and white.',
    warp: filter('grayscale(1)'),
  },
  {
    id: 'sepia', name: 'Vintage Print', code: 'sepia', group: 'theme', kind: 'typed-toggle',
    about: 'The whole site aged a century: warm browns, old-paper feel.',
    warp: filter('sepia(.9)'),
  },
  {
    id: 'acid', name: 'Acid Trip', code: 'acid', group: 'theme', kind: 'typed-toggle',
    about: 'Every hue spun halfway round the wheel.',
    warp: filter('hue-rotate(180deg) saturate(1.4)'),
  },
  {
    id: 'oilslick', name: 'Oil Slick', code: 'oilslick', group: 'theme', kind: 'typed-toggle',
    about: 'The colours of the whole site drift through the rainbow, forever.',
    warp: css(),
  },
  {
    id: 'nightshift', name: 'Night Shift', code: 'nightshift', group: 'theme', kind: 'typed-toggle',
    about: 'Amber, warm and dim — the whole site after dark.',
    warp: filter('sepia(.65) saturate(1.35) brightness(.9)'),
  },
  {
    id: 'eclipse', name: 'Eclipse', code: 'eclipse', group: 'theme', kind: 'typed-toggle',
    about: 'Deep darkness with harder contrast — the site at midnight.',
    warp: filter('brightness(.55) contrast(1.3)'),
  },
  {
    id: 'snowblind', name: 'Snowblind', code: 'snowblind', group: 'theme', kind: 'typed-toggle',
    about: 'Bleached, bright and washed out — the site in a blizzard.',
    warp: filter('brightness(1.32) contrast(.82) saturate(.7)'),
  },
  {
    id: 'neon', name: 'Neon Mode', code: 'neon', group: 'theme', kind: 'typed-toggle',
    about: 'Saturated, contrasty, electric — everything looks like a sign.',
    warp: filter('contrast(1.45) saturate(2.6)'),
  },
  {
    id: 'vaporwave', name: 'Vaporwave', code: 'vaporwave', group: 'theme', kind: 'typed-toggle',
    about: 'Pink-and-cyan grade with a soft gradient haze over everything.',
    warp: css(),
  },
  {
    id: 'arctic', name: 'Arctic', code: 'arctic', group: 'theme', kind: 'typed-toggle',
    about: 'The whole palette shoved towards cold blues.',
    warp: filter('hue-rotate(160deg) saturate(.85)'),
  },
  {
    id: 'candy', name: 'Candyshop', code: 'candy', group: 'theme', kind: 'typed-toggle',
    about: 'Pale, soft and sugary — every colour turned to pastel.',
    warp: filter('saturate(.55) brightness(1.12) contrast(.88)'),
  },
  {
    id: 'golden', name: 'Golden Era', code: 'golden', group: 'theme', kind: 'typed-toggle',
    about: 'A warm gold grade over the entire site.',
    warp: filter('sepia(.45) saturate(1.35) contrast(1.06)'),
  },
  {
    id: 'thermal', name: 'Thermal Cam', code: 'thermal', group: 'theme', kind: 'typed-toggle',
    about: 'The site through an infrared camera: hot colours on black.',
    warp: filter('invert(1) saturate(3.2) hue-rotate(95deg) contrast(1.15)'),
  },
  {
    id: 'dream', name: 'Dreamscape', code: 'dream', group: 'theme', kind: 'typed-toggle',
    about: 'A gentle soft-focus over everything, like remembering the site.',
    warp: filter('blur(1.1px) saturate(1.35)'),
  },

  /* ------------------------- layout warps -------------------------------- */
  {
    id: 'mirror', name: 'Mirror World', code: 'mirror', group: 'layout', kind: 'typed-toggle',
    about: 'The entire site flipped left-to-right, everything.',
    warp: transform('scaleX(-1)'),
  },
  {
    id: 'downunder', name: 'Down Under', code: 'downunder', group: 'layout', kind: 'typed-toggle',
    about: 'The site rotated a full 180°. Australia approved.',
    warp: transform('rotate(180deg)'),
  },
  {
    id: 'tipsy', name: 'Tipsy', code: 'tipsy', group: 'layout', kind: 'typed-toggle',
    about: 'The whole site leans a couple of degrees and will not apologise.',
    warp: transform('rotate(-2.2deg)'),
  },
  {
    id: 'quake', name: 'Earthquake', code: 'quake', group: 'layout', kind: 'typed-toggle',
    about: 'The entire page jitters like something is falling over somewhere.',
    warp: css(),
  },
  {
    id: 'jelly', name: 'Jelly Web', code: 'jelly', group: 'layout', kind: 'typed-toggle',
    about: 'The site breathes — everything pulses, gently and unstoppably.',
    warp: css(),
  },
  {
    id: 'funhouse', name: 'Funhouse', code: 'funhouse', group: 'layout', kind: 'typed-toggle',
    about: 'Everything stretched tall and squeezed thin, mirror-maze style.',
    warp: transform('scaleY(1.07) scaleX(.93)'),
  },
  {
    id: 'shrink', name: 'Mini Mode', code: 'shrink', group: 'layout', kind: 'typed-toggle',
    about: 'The whole site shrinks to toy size.',
    warp: zoom(0.82),
  },
  {
    id: 'giant', name: 'Giant Mode', code: 'giant', group: 'layout', kind: 'typed-toggle',
    about: 'Everything grows. Scroll bars Optional.',
    warp: zoom(1.18),
  },
  {
    id: 'floaty', name: 'Zero Gravity', code: 'floaty', group: 'layout', kind: 'typed-toggle',
    about: 'The page bobs up and down like it forgot gravity exists.',
    warp: css(),
  },
  {
    id: 'drift', name: 'Slow Drift', code: 'drift', group: 'layout', kind: 'typed-toggle',
    about: 'The site rocks side to side, very slowly, forever.',
    warp: css(),
  },

  /* ------------------------- text warps ---------------------------------- */
  {
    id: 'comic', name: 'Comic Sans Everything', code: 'comic', group: 'text', kind: 'typed-toggle',
    about: 'Every single word on the site, in Comic Sans. You were warned.',
    warp: css(),
  },
  {
    id: 'oldpaper', name: 'Old Paper', code: 'oldpaper', group: 'text', kind: 'typed-toggle',
    about: 'Every font becomes a bookish serif.',
    warp: css(),
  },
  {
    id: 'hacker', name: 'Hacker Type', code: 'hacker', group: 'text', kind: 'typed-toggle',
    about: 'Every font becomes a terminal monospace.',
    warp: css(),
  },
  {
    id: 'glow', name: 'Glow Text', code: 'glow', group: 'text', kind: 'typed-toggle',
    about: 'All text glows in its own colour.',
    warp: css(),
  },
  {
    id: 'loud', name: 'Loud Text', code: 'loud', group: 'text', kind: 'typed-toggle',
    about: 'Every word on the site goes extra-bold.',
    warp: css(),
  },
  {
    id: 'rainbow', name: 'Rainbow Text', code: 'rainbow', group: 'text', kind: 'typed-toggle',
    about: 'All text cycles through the rainbow.',
    warp: css(),
  },

  /* ------------------------- screen warps -------------------------------- */
  {
    id: 'meteor', name: 'Meteor Shower', code: 'meteor', group: 'overlay', kind: 'typed-toggle',
    about: 'Streaks keep falling across the whole page.',
    warp: overlay(),
  },
  {
    id: 'starry', name: 'Starry Sky', code: 'starry', group: 'overlay', kind: 'typed-toggle',
    about: 'The site sits under a sky of twinkling stars.',
    warp: overlay(),
  },
  {
    id: 'fireworks', name: 'Fireworks', code: 'fireworks', group: 'overlay', kind: 'typed-toggle',
    about: 'Rockets go up, bursts come down, all night.',
    warp: overlay(),
  },
  {
    id: 'rainfall', name: 'Rainfall', code: 'rainfall', group: 'overlay', kind: 'typed-toggle',
    about: 'Heavy rain over the whole site, no umbrella provided.',
    warp: overlay(),
  },
  {
    id: 'thunder', name: 'Thunderstorm', code: 'thunder', group: 'overlay', kind: 'typed-toggle',
    about: 'Rain plus lightning flashes that light the page up.',
    warp: overlay(),
  },
  {
    id: 'fireflies', name: 'Fireflies', code: 'fireflies', group: 'overlay', kind: 'typed-toggle',
    about: 'Little glowing lights wander the page.',
    warp: overlay(),
  },
  {
    id: 'bubbles', name: 'Bubbles', code: 'bubbles', group: 'overlay', kind: 'typed-toggle',
    about: 'Bubbles rise from the bottom of the browser.',
    warp: overlay(),
  },
  {
    id: 'embers', name: 'Ember Rise', code: 'embers', group: 'overlay', kind: 'typed-toggle',
    about: 'Glowing sparks drift up from the bottom edge.',
    warp: overlay(),
  },
  {
    id: 'blossom', name: 'Cherry Blossom', code: 'blossom', group: 'overlay', kind: 'typed-toggle',
    about: 'Pink petals fall and spin over everything.',
    warp: overlay(),
  },
  {
    id: 'confetti', name: 'Confetti Rain', code: 'confetti', group: 'overlay', kind: 'typed-toggle',
    about: 'A celebration that never ends, falling from the top.',
    warp: overlay(),
  },
  {
    id: 'bats', name: 'Bat Swarm', code: 'bats', group: 'overlay', kind: 'typed-toggle',
    about: 'Bats flap across the site. Do not stand up.',
    warp: overlay(),
  },
  {
    id: 'ufo', name: 'UFO Visit', code: 'ufo', group: 'overlay', kind: 'typed-toggle',
    about: 'A saucer crosses the page every few seconds, beaming down.',
    warp: overlay(),
  },

  /* ------------------------- behaviour warps ----------------------------- */
  {
    id: 'disco', name: 'Disco Floor', code: 'disco', group: 'behavior', kind: 'typed-toggle',
    about: 'A hue-cycling light wash over the whole site. Stayin alive.',
    warp: css(),
  },
  {
    id: 'bigcursor', name: 'Giant Cursor', code: 'bigcursor', group: 'behavior', kind: 'typed-toggle',
    about: 'Your pointer becomes a huge glowing dot.',
    warp: css(),
  },
  {
    id: 'trail', name: 'Rainbow Trail', code: 'trail', group: 'behavior', kind: 'typed-toggle',
    about: 'A fading rainbow ribbon follows your cursor everywhere.',
    warp: overlay(),
  },
  {
    id: 'ripples', name: 'Click Ripples', code: 'ripples', group: 'behavior', kind: 'typed-toggle',
    about: 'Every click sends a ring across the page.',
    warp: overlay(),
  },
  {
    id: 'party', name: 'Party Clicks', code: 'party', group: 'behavior', kind: 'typed-toggle',
    about: 'Every click explodes into confetti.',
    warp: overlay(),
  },
  {
    id: 'clock', name: 'The Clock', code: 'clock', group: 'behavior', kind: 'typed-toggle',
    about: 'A big always-on clock floats in the corner.',
    warp: overlay(),
  },
  {
    id: 'counter', name: 'Hit Counter', code: 'counter', group: 'behavior', kind: 'typed-toggle',
    about: 'A retro LED visitor counter, like 1997 promised.',
    warp: overlay(),
  },
];

/** The typed codes and the secret each one triggers. */
export const TYPED_CODES: Record<string, SecretId> = Object.fromEntries(
  SECRETS.filter(secret => secret.kind === 'typed-toggle' || secret.kind === 'typed-once')
    .map(secret => [secret.code, secret.id]),
);

export const CODES = Object.keys(TYPED_CODES);

/** The konami sequence, lowercased key names in order. */
export const KONAMI_KEYS = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
];

/**
 * Does a rolling buffer of recent keys end with the konami sequence?
 *
 * Matching the *suffix* rather than requiring a clean start is what makes the
 * code work after an accidental half-attempt: nobody types it perfectly while
 * playing, and a matcher that lost its place on a stray keypress would feel
 * broken.
 */
export function isKonamiSuffix(keys: string[]): boolean {
  if (keys.length < KONAMI_KEYS.length) return false;
  const tail = keys.slice(-KONAMI_KEYS.length).map(key => key.toLowerCase());
  return KONAMI_KEYS.every((key, index) => tail[index] === key);
}

/**
 * Does a rolling buffer of typed characters end with one of the codes?
 *
 * Returns the code, or null. The buffer is lowercase — the codes are not
 * case-sensitive, because nobody types secrets with shift held on purpose.
 */
export function typedCodeMatch(buffer: string, codes: string[] = CODES): string | null {
  const typed = buffer.toLowerCase();
  for (const code of codes) {
    if (code && typed.endsWith(code)) return code;
  }
  return null;
}

/* --------------------------------------------------------------- store ---- */

type SecretStore = {
  found: SecretId[];
  toggles: Partial<Record<SecretId, boolean>>;
  runnerBest: number;
};

function emptyStore(): SecretStore {
  return { found: [], toggles: {}, runnerBest: 0 };
}

function storage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function readStore(): SecretStore {
  try {
    const raw = storage()?.getItem(SECRETS_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<SecretStore>;
    const found = Array.isArray(parsed.found)
      ? parsed.found.filter((id): id is SecretId => SECRET_IDS.includes(id as SecretId))
      : [];
    const toggles: SecretStore['toggles'] = {};
    if (parsed.toggles && typeof parsed.toggles === 'object') {
      for (const [id, value] of Object.entries(parsed.toggles)) {
        if (SECRET_IDS.includes(id as SecretId) && typeof value === 'boolean') {
          toggles[id as SecretId] = value;
        }
      }
    }
    return { found, toggles, runnerBest: Number(parsed.runnerBest) || 0 };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: SecretStore) {
  try {
    storage()?.setItem(SECRETS_KEY, JSON.stringify(store));
  } catch {
    /* private mode: secrets last for the session only */
  }
  for (const listener of listeners) listener();
}

const listeners = new Set<() => void>();

export function subscribeSecrets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isDiscovered(id: SecretId): boolean {
  return readStore().found.includes(id);
}

/** Marks a secret found. Returns true only the first time, so callers can tell discovery from a re-trigger. */
export function discover(id: SecretId): boolean {
  const store = readStore();
  if (store.found.includes(id)) return false;
  store.found.push(id);
  writeStore(store);
  return true;
}

export function discoveredCount(): number {
  return readStore().found.length;
}

export function isToggled(id: SecretId): boolean {
  return readStore().toggles[id] === true;
}

export function setToggle(id: SecretId, on: boolean) {
  // One snapshot: discovering through `discover()` here would write its own
  // copy of the store, and the outer write would then clobber the find.
  const store = readStore();
  if (on && !store.found.includes(id)) store.found.push(id);
  store.toggles[id] = on;
  writeStore(store);
}

/** Ghost mode is the toggle other modules read synchronously. */
export function isGhostOn(): boolean {
  return isToggled('ghost');
}

/** Every warp currently switched on, in registry order. */
export function activeWarps(): SecretId[] {
  const store = readStore();
  return SECRET_IDS.filter(id => store.toggles[id] === true);
}

/** Switch every warp off (the vault's big red button). */
export function clearWarps() {
  const store = readStore();
  for (const id of SECRET_IDS) store.toggles[id] = false;
  writeStore(store);
}

export function runnerBest(): number {
  return readStore().runnerBest;
}

/** Records a Vault Runner score. Returns true when it is a new best. */
export function recordRunnerScore(score: number): boolean {
  const clean = Math.max(0, Math.floor(score));
  discover('runner');
  const store = readStore();
  if (clean <= store.runnerBest) return false;
  store.runnerBest = clean;
  writeStore(store);
  return true;
}

/** The vault page's own button: forget every secret. */
export function resetSecrets() {
  writeStore(emptyStore());
}

/* ------------------------------------------------------- chat commands ---- */

export const EIGHT_BALL = [
  'It is certain.',
  'It is decidedly so.',
  'Without a doubt.',
  'Yes — definitely.',
  'You may rely on it.',
  'As I see it, yes.',
  'Most likely.',
  'Outlook good.',
  'Yes.',
  'Signs point to yes.',
  'Reply hazy, try again.',
  'Ask again later.',
  'Better not tell you now.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  "Don't count on it.",
  'My reply is no.',
  'My sources say no.',
  'Outlook not so good.',
  'Very doubtful.',
];

const DICE_RE = /^(\d{1,2})?d(\d{1,4})$/i;

/** `2d6` → `🎲 2d6 → 4 + 3 = 7`. Caps the count so a troll cannot roll 99d9999. */
export function rollDice(spec: string, random: () => number = Math.random): string {
  const match = DICE_RE.exec(spec.trim());
  if (!match) return '🎲 Tell me the dice like `2d6` — count and sides.';
  const count = Math.min(20, Math.max(1, Number(match[1] ?? '1')));
  const sides = Math.min(1000, Math.max(2, Number(match[2])));
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(random() * sides));
  const total = rolls.reduce((sum, value) => sum + value, 0);
  const detail = count > 1 ? ` ${rolls.join(' + ')} = ` : ' ';
  return `🎲 ${count}d${sides} →${detail}${total}`;
}

export function flipCoin(random: () => number = Math.random): string {
  return random() < 0.5 ? '🪙 Heads' : '🪙 Tails';
}

export function magicEightBall(question: string, random: () => number = Math.random): string {
  const trimmed = question.trim();
  if (!trimmed) return '🎱 Ask me a question after the command.';
  const answer = EIGHT_BALL[Math.floor(random() * EIGHT_BALL.length)];
  return `🎱 ${answer}`;
}

/** `/pick pizza|ramen|regret` — an empty list asks for options instead of crashing. */
export function pickFrom(list: string, random: () => number = Math.random): string {
  const options = list
    .split(/[|,]/)
    .map(option => option.trim())
    .filter(Boolean);
  if (options.length < 2) return '🤔 Give me options: `/pick one|two|three`.';
  return `👉 ${options[Math.floor(random() * options.length)]}`;
}

/**
 * Turns a chat message into a command result, or null when it is not one.
 *
 * Unknown slash commands fall through to a normal message — the parser claims
 * only what it understands, so `/sorry` is still a message anyone can read.
 */
export function parseChatCommand(raw: string, random: () => number = Math.random): string | null {
  const text = raw.trim();
  if (!text.startsWith('/')) return null;
  const body = text.slice(1);
  const space = body.indexOf(' ');
  const head = (space === -1 ? body : body.slice(0, space)).toLowerCase();
  const rest = space === -1 ? '' : body.slice(space + 1).trim();
  switch (head) {
    case 'roll':
      return rollDice(rest || '1d6', random);
    case 'flip':
      return flipCoin(random);
    case '8ball':
    case 'eightball':
      return magicEightBall(rest, random);
    case 'pick':
      return pickFrom(rest, random);
    default:
      return null;
  }
}
