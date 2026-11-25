/**
 * Which games can genuinely take a second player.
 *
 * This list is not curated by taste — every entry was verified against the game
 * source that ships in `public/games`. A title only qualifies if its own code
 * proves a second player exists, by one of:
 *
 *   - an explicit two-player mode in the engine (`2P_Score`, `2-Player`,
 *     `twoPlayer`, `TWO_PLAYER`);
 *   - a named second-player entity or score in the game's own code.
 *
 * A tempting fourth check — "arrows and WASD are both bound, so it must be
 * two-player" — was tried and thrown away. It matched `case 37:` inside Flash
 * bytecode tables and minified obfuscator state machines, and would have
 * labelled six single-player games as two-player. A grep that cannot tell a
 * key binding from a bytecode opcode is not evidence.
 *
 * The verification is re-run by `scripts/audit-two-player.mjs`, and the test
 * suite fails if an id is listed here that no longer proves it. That is the
 * rule that matters: the label "2 Player" has to mean a game actually accepts
 * two players, not that we hoped it would.
 */

export type TwoPlayerKind = 'local' | 'remote';

export type TwoPlayerGame = {
  id: string;
  /** What the game wants pressed. Shown in the room so nobody guesses. */
  controls: string;
  /** `local` ships a same-screen mode; `remote` is driven over the room data
   *  channel by a friend with a different keyboard. Both work in a room. */
  kind: TwoPlayerKind;
  /** Where the proof lives, so the audit can re-check it. */
  evidence: string;
};

/**
 * Ordered by "a person would actually pick this", which is the only ordering
 * that matters for a shelf.
 */
export const TWO_PLAYER_GAMES: TwoPlayerGame[] = [
  { id: 'level-devil', controls: 'P1 arrows + Space · P2 WASD', kind: 'local', evidence: '2P_Score' },
  { id: 'tank-trouble-2', controls: 'P1 WASD + Space · P2 arrows + Enter', kind: 'local', evidence: 'ChangeNames2P' },
  { id: 'bomberman', controls: 'P1 arrows + Space · P2 WASD + Shift', kind: 'local', evidence: 'up2' },
  { id: 'basketball-stars', controls: 'P1 arrows + Space · P2 WASD + Shift', kind: 'local', evidence: 'player2' },
  { id: 'boxing-random', controls: 'P1 arrows · P2 WASD', kind: 'local', evidence: 'player2Event' },
  { id: 'pong', controls: 'P1 W/S · P2 arrows', kind: 'local', evidence: 'scorePlayer2' },
  { id: 'classic-pool', controls: 'P1 mouse · P2 mouse (turn based)', kind: 'local', evidence: 'player2TotalScore' },
];

const BY_ID = new Map(TWO_PLAYER_GAMES.map(game => [game.id, game]));

export function twoPlayerGame(id: string | null | undefined): TwoPlayerGame | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

export function isTwoPlayerGame(id: string | null | undefined): boolean {
  return twoPlayerGame(id) !== null;
}

/** The ids in shelf order, for the room's picker. */
export function twoPlayerIds(): string[] {
  return TWO_PLAYER_GAMES.map(game => game.id);
}
