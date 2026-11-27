/**
 * The pure part of Vault Runner — the maths node can test without a canvas.
 *
 * The component (VaultRunner.tsx) owns the loop and the paint; this file owns
 * the numbers, which is what makes "the game gets faster but never impossible"
 * something the tests can hold the line on.
 */

export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 260;
export const GROUND_Y = 218;
export const PLAYER_SIZE = 22;
export const PLAYER_X = 74;

/** Upward velocity of a jump and the gravity that pulls it back. */
export const JUMP_VELOCITY = -10.6;
export const GRAVITY = 0.62;

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Run speed from the score. It climbs with the score but hits a ceiling —
 * the game should end because someone mistimed a jump, not because the game
 * became physically unplayable at 12 px/frame.
 */
export function speedFor(score: number): number {
  return Math.min(7.2, 3.4 + score * 0.02);
}

/**
 * Horizontal distance to the next obstacle.
 *
 * `random` is injected so tests can pin it. The gap tightens as the score
 * climbs (−2 px per point) but never below 170 px — at the top speed that is
 * still a beat and a half to react, and below that it stops being a reflex
 * game and becomes a coin flip.
 */
export function gapFor(score: number, random: number): number {
  const floor = Math.max(170, 330 - score * 2);
  return floor + random * 140;
}

/** Axis-aligned overlap. Two rects that only touch at an edge do not hit. */
export function hitsPlayer(player: Rect, obstacle: Rect): boolean {
  return (
    player.x < obstacle.x + obstacle.w &&
    player.x + player.w > obstacle.x &&
    player.y < obstacle.y + obstacle.h &&
    player.y + player.h > obstacle.y
  );
}

/**
 * One tick of vertical physics.
 *
 * The player falls until the ground stops them; landing zeroes the velocity so
 * the next jump starts from standstill, not from a leftover upward nudge.
 */
export function stepFall(y: number, velocityY: number): { y: number; velocityY: number; grounded: boolean } {
  const nextY = y + velocityY;
  if (nextY >= GROUND_Y - PLAYER_SIZE) {
    return { y: GROUND_Y - PLAYER_SIZE, velocityY: 0, grounded: true };
  }
  return { y: nextY, velocityY: velocityY + GRAVITY, grounded: false };
}

/** Score is distance, rounded to a human granularity: one point per 10 px. */
export function scoreFor(distancePx: number): number {
  return Math.max(0, Math.floor(distancePx / 10));
}
