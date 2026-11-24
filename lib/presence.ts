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

export type PresencePeer = {
  id: string;
  name: string;
  /** null for a guest, so the UI can label them without an account. */
  username: string | null;
  cursor: GhostCursor;
  /** Which game this player has open, if any. */
  game: string | null;
  /** ms epoch the server saw them last. */
  seen: number;
};

export type PresenceEvent = {
  id: number;
  kind: string;
  name: string;
  message: string;
  game: string | null;
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
