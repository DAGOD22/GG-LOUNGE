/**
 * Live presence: what this player looks like to everyone else.
 *
 * The wire format is deliberately tiny and percentage-based. A ghost cursor is
 * drawn from `x`/`y` in 0–100, so the same payload renders correctly on a 4K
 * monitor and on a phone, and a resize on either end does not require a
 * re-send. Nothing here is a pixel coordinate or a DOM reference.
 *
 * Nothing in this module is secret. It is what the server validates on the way
 * in and what every other client trusts on the way out, so it is the one place
 * to look when asking "what does the site actually tell other players?".
 */
import type { Settings } from '@/lib/customization/settings';
import { ANIMATED_CURSOR_IDS } from '@/lib/customization/cursor-presets';

/** Cursor presets we are willing to draw on someone else's screen. */
export const GHOST_PRESETS = new Set<string>([
  'system',
  'custom',
  ...ANIMATED_CURSOR_IDS,
]);

export type GhostCursor = {
  /** Normalised position, 0–100, of the viewport this player is looking at. */
  x: number;
  y: number;
  preset: string;
  /** Uploaded cursor image, already a data: URL. Capped hard by the server. */
  image: string;
  size: number;
  accent: string;
};

/**
 * What a player is doing, in one field.
 *
 * A game id alone was not enough: the roster could not say "in the proxy, on
 * youtube.com" or "reading the apps page", and the feed could only ever
 * announce launches. `kind` is from a fixed set so the client can pick an icon
 * and a verb without trusting a sentence, and `label` is display-ready text
 * the *server* derived — for a proxy destination it is just a hostname, never
 * a path or a query, so nothing private rides along.
 */
export type ActivityKind = 'game' | 'app' | 'page' | 'proxy' | 'tools' | 'idle';

export type Activity = {
  kind: ActivityKind;
  /** Human-readable: a catalogue title, an app name, "youtube.com", "/tools". */
  label: string;
  /** The game id when kind is 'game', so the ghost tag can deep-link. */
  game: string | null;
};

export type PresencePeer = {
  id: string;
  name: string;
  /** null for a guest, so the UI can label them without an account. */
  username: string | null;
  cursor: GhostCursor;
  /** Which game this player has open, if any. */
  game: string | null;
  /** What they are doing right now. Absent from an older server. */
  activity?: Activity;
  /** ms epoch the server saw them last. */
  seen: number;
};

/**
 * Can two people be shown the same roster row?
 *
 * Presence ids are per-tab (a signed guest token, or an account id), so the
 * same person in a second tab is a second peer. That is correct for cursors —
 * two tabs really are two pointers — but wrong for a roster, which should say
 * "Pix Fox" once with their two tabs counted, not list them twice with the
 * same name and a confusing double cursor.
 */
export function rosterKey(peer: PresencePeer): string {
  const name = (peer.username ?? peer.name ?? '').trim().toLowerCase();
  return name || peer.id;
}

export type PresenceEvent = {
  id: number;
  kind: string;
  name: string;
  message: string;
  game: string | null;
  /** Same shape as a peer's activity, so the feed can icon it identically. */
  target?: string | null;
  label?: string | null;
  /** ms epoch. The wire field is `createdAt`; `at` is kept for older callers. */
  at: number;
  createdAt?: number;
};

export type PresenceSnapshot = {
  /**
   * How many players are in the room *including this one*. Kept because it is
   * the honest total, but never display it as "N players online" — see
   * `others`, which is the number a person actually cares about.
   */
  online: number;
  /**
   * How many *other* players are here right now.
   *
   * This exists because `online` counting the caller made every single visitor
   * see "1 player online", which is always true and therefore told nobody
   * anything. A lone visitor is now told they are alone.
   */
  others: number;
  peers: PresencePeer[];
  events: PresenceEvent[];
};

/**
 * The line to show for the room.
 *
 * Returns null when there is nothing worth saying, so the pill disappears
 * instead of showing a permanent, meaningless "1".
 */
export function roomLabel(others: number): string | null {
  if (others <= 0) return null;
  return others === 1 ? '1 other player here' : `${others} other players here`;
}


/**
 * Anonymous display name.
 *
 * Derived from the id so the same guest keeps the same name between polls
 * without the server having to store one, and chosen from syllables rather
 * than random letters so a ghost cursor reads as "Mango Fox" instead of
 * "x7f2a".
 */
const SYLLABLES_A = ['Pix', 'Neon', 'Moon', 'Turbo', 'Pixel', 'Cosmic', 'Velvet', 'Lucky', 'Quiet', 'Rapid', 'Sneaky', 'Solar', 'Vapor', 'Retro', 'Maple', 'Echo'];
const SYLLABLES_B = ['Fox', 'Comet', 'Otter', 'Raven', 'Pixel', 'Ninja', 'Wizard', 'Falcon', 'Tiger', 'Ghost', 'Badger', 'Wombat', 'Dragon', 'Panda', 'Lynx', 'Koala'];

export function ghostName(id: string): string {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const positive = hash >>> 0;
  return `${SYLLABLES_A[positive % SYLLABLES_A.length]} ${SYLLABLES_B[(positive >>> 8) % SYLLABLES_B.length]}`;
}

/** The name to show: the account name when signed in, the derived one otherwise. */
export function displayName(peer: { id: string; username: string | null }): string {
  return peer.username?.trim() || ghostName(peer.id);
}

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

/**
 * Build the cursor half of a presence payload from local settings.
 *
 * Only the four things a ghost cursor needs are sent. Trail, glow, speed and
 * the rest of the cursor engine are local rendering choices — shipping them
 * would let a rival's settings change how someone else's pointer looks.
 */
export function cursorForPresence(cursor: Settings['cursor'], accent: string): GhostCursor {
  const preset = GHOST_PRESETS.has(cursor.preset) ? cursor.preset : 'system';
  return {
    x: 50,
    y: 50,
    preset,
    // A remote upload is a 32px PNG data URL; anything longer is not ours.
    image: preset === 'custom' && cursor.image.length <= 40_000 ? cursor.image : '',
    size: clamp(cursor.size, 16, 64),
    accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#d7f34a',
  };
}

/** Drop a cursor update that did not actually move, to keep polls cheap. */
export function sameCursor(a: GhostCursor | null, b: GhostCursor): boolean {
  if (!a) return false;
  return a.preset === b.preset && a.size === b.size && a.accent === b.accent && a.image === b.image;
}

/**
 * "playing Slope" / "in the proxy, on youtube.com" / "on the apps page".
 *
 * Kept here rather than in the component because three surfaces need the same
 * wording — the ghost tag, the feed and the roster — and three copies of a
 * sentence is three chances for them to disagree.
 */
export function activityLine(activity: Activity | null | undefined): string | null {
  if (!activity || !activity.label) return null;
  switch (activity.kind) {
    case 'game':
      return `playing ${activity.label}`;
    case 'app':
      return `using ${activity.label}`;
    case 'proxy':
      return `in the proxy on ${activity.label}`;
    case 'tools':
      return `using ${activity.label}`;
    case 'page':
      return `on ${activity.label}`;
    default:
      return null;
  }
}

/** The short verb the feed uses: "just opened", "just launched", "is on". */
export function activityVerb(activity: Activity | null | undefined): string {
  switch (activity?.kind) {
    case 'game':
      return 'launched';
    case 'proxy':
      return 'browsing';
    case 'app':
    case 'tools':
      return 'opened';
    default:
      return 'is on';
  }
}
