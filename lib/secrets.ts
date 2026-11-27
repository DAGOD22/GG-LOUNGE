/**
 * The secret layer.
 *
 * Ten features that the site does not advertise anywhere: no menu entry, no
 * tour step, no hint unless you already know. They are discovered by typing
 * codes, pressing the oldest cheat sequence there is, using a hidden page, or
 * a slash command in chat.
 *
 * This module holds everything that can be wrong without a DOM: the code
 * matcher, the konami matcher, the discovery store, the chat command parser
 * and the dice. The React side (SecretsProvider, the overlays, the vault page)
 * only calls into it.
 *
 * Discovery is per browser, in localStorage — a secret you found stays found.
 * Nothing here is sent to the server, and nothing in the UI reveals the codes
 * until they are discovered; the vault page then shows what you know.
 */

export const SECRETS_KEY = 'gg_secrets_v1';

export const SECRET_IDS = [
  'konami',
  'matrix',
  'snow',
  'xyzzy',
  'timewarp',
  'ghost',
  'shuffle',
  'chat',
  'runner',
  'vault',
] as const;

export type SecretId = (typeof SECRET_IDS)[number];

export type SecretKind =
  | /** typed code that toggles an effect */ 'typed-toggle'
  /** typed code that does one thing */ | 'typed-once'
  /** the arrow-sequence cheat */ | 'konami'
  /** unlocked by using a chat command */ | 'chat'
  /** unlocked by playing the hidden game */ | 'game'
  /** unlocked by visiting the hidden page */ | 'page';

export type SecretDef = {
  id: SecretId;
  name: string;
  /** Shown only after discovery. */
  code: string;
  /** The only thing shown before discovery. Deliberately vague. */
  hint: string;
  kind: SecretKind;
};

export const SECRETS: SecretDef[] = [
  {
    id: 'konami',
    name: 'Arcade Godmode',
    code: '↑ ↑ ↓ ↓ ← → ← → B A',
    hint: 'The oldest cheat sequence there is. Your hands probably remember it.',
    kind: 'konami',
  },
  {
    id: 'matrix',
    name: 'Code Rain',
    code: 'matrix',
    hint: 'Type the name of the film everyone claims to have understood.',
    kind: 'typed-toggle',
  },
  {
    id: 'snow',
    name: 'Snowfall',
    code: 'snow',
    hint: 'Four letters. Cold, white, falls in winter — except here it does not need the season.',
    kind: 'typed-toggle',
  },
  {
    id: 'xyzzy',
    name: 'Privacy Spotlight',
    code: 'xyzzy',
    hint: 'The magic word from the very first adventure game. It dims everything but a small circle.',
    kind: 'typed-toggle',
  },
  {
    id: 'timewarp',
    name: 'Time Warp',
    code: '1997',
    hint: 'Type a year. Pick the one the web forgot to grow out of.',
    kind: 'typed-toggle',
  },
  {
    id: 'ghost',
    name: 'Ghost Mode',
    code: 'ghost',
    hint: 'Type the word for what you become: online, but invisible to everyone.',
    kind: 'typed-toggle',
  },
  {
    id: 'shuffle',
    name: 'Lucky Dip',
    code: 'shuffle',
    hint: 'Type it, and the lounge picks your next game for you.',
    kind: 'typed-once',
  },
  {
    id: 'chat',
    name: 'Whisper Commands',
    code: '/roll · /flip · /8ball · /pick',
    hint: 'The chat box answers to a slash. Try asking it to roll.',
    kind: 'chat',
  },
  {
    id: 'runner',
    name: 'Vault Runner',
    code: 'it is on this page',
    hint: 'There is a game hidden inside the vault itself. Beat your own best.',
    kind: 'game',
  },
  {
    id: 'vault',
    name: 'The Vault',
    code: '/secrets',
    hint: 'You found the door.',
    kind: 'page',
  },
];

/** The typed codes and the secret each one triggers. */
export const TYPED_CODES: Record<string, SecretId> = {
  matrix: 'matrix',
  snow: 'snow',
  xyzzy: 'xyzzy',
  '1997': 'timewarp',
  ghost: 'ghost',
  shuffle: 'shuffle',
};

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

/* ----------------------------------------------------------------- store -- */

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

/* ---------------------------------------------------------- chat commands -- */

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
