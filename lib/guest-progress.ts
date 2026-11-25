/**
 * Guest play tracking.
 *
 * A signed-out visitor's plays are kept in `localStorage` under `ggl_plays_<id>`
 * so the game modal can still show a play count. That part always worked. What
 * did not: the counts were never sent anywhere, so they evaporated on sign-in
 * and the account started at zero. These helpers are the transfer step.
 */

const KEY_PREFIX = 'ggl_plays_';
/** Plays above this per game are almost certainly local tampering; clamp. */
const MAX_PER_GAME = 500;
/** Games above this are not worth a request — take the most recent set. */
const MAX_GAMES = 60;

export type GuestPlays = Record<string, number>;

/** Read every guest play tally in this browser. */
export function readGuestPlays(): GuestPlays {
  const out: GuestPlays = {};
  if (typeof window === 'undefined') return out;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const gameId = key.slice(KEY_PREFIX.length);
      const count = Math.floor(Number(localStorage.getItem(key)));
      if (gameId && Number.isFinite(count) && count > 0) out[gameId] = Math.min(count, MAX_PER_GAME);
    }
  } catch {
    // Private mode / storage disabled — nothing to merge.
  }
  return out;
}

/** Remove the guest tallies, once they are safely on the account. */
export function clearGuestPlays(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // best effort
  }
}

/**
 * Send guest plays to the account. Returns how many plays were merged, or 0
 * when there was nothing to do or the request failed (in which case the guest
 * tallies are deliberately kept, so the next sign-in retries rather than losing
 * them).
 */
export async function mergeGuestPlays(): Promise<number> {
  const plays = readGuestPlays();
  const gameIds = Object.keys(plays);
  if (!gameIds.length) return 0;
  const payload: GuestPlays = {};
  for (const gameId of gameIds.slice(0, MAX_GAMES)) payload[gameId] = plays[gameId];
  try {
    const res = await fetch('/api/auth/merge-guest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plays: payload }),
    });
    if (!res.ok) return 0;
    const data = (await res.json().catch(() => ({}))) as { merged?: number };
    clearGuestPlays();
    return Number(data.merged) || 0;
  } catch {
    return 0;
  }
}
