/**
 * The pure part of Rewind — the maths that node can test without a DOM.
 *
 * The component (Rewind.tsx) owns canvases and timers; everything here owns
 * numbers. Keeping the ring-buffer arithmetic in one small module is what makes
 * "the oldest frame is at index 0" provable rather than assumed.
 */

/** Frames in the tape. 30 × 300 ms = nine seconds of history. */
export const FRAMES = 30;
/** How often the game's canvas is sampled, in ms. */
export const SAMPLE_MS = 300;
/** How long one replayed frame stays on screen, in ms. */
export const REPLAY_STEP_MS = 90;
/** The whole tape, in seconds. */
export const BUFFER_SECONDS = (FRAMES * SAMPLE_MS) / 1000;

/**
 * Indices of the buffer in playback order, oldest first.
 *
 * A ring buffer's `head` is the index of the *next* write, so the oldest live
 * frame is `head` — walk forward from there and wrap. A partially filled
 * buffer (fewer frames than slots) is simpler: everything recorded so far sits
 * in `0…count-1` in order.
 */
export function filledOrder(head: number, count: number, length: number): number[] {
  if (count <= 0) return [];
  if (count < length) return Array.from({ length: count }, (_, i) => i);
  return Array.from({ length }, (_, i) => (head + i) % length);
}

/**
 * Seconds a scrub position sits behind the live frame.
 *
 * `pos` counts from the oldest available frame (0) to the newest
 * (`count - 1`). The newest frame is "now", so the label it earns is zero.
 */
export function secondsBack(pos: number, count: number): number {
  const newest = Math.max(0, count - 1);
  const clamped = Math.min(Math.max(0, pos), newest);
  return ((newest - clamped) * SAMPLE_MS) / 1000;
}

/** The tape clock: `live` at the newest frame, `−4.2s` anywhere behind it. */
export function tapeLabel(pos: number, count: number): string {
  if (count <= 1) return 'live';
  const seconds = secondsBack(pos, count);
  return seconds <= 0 ? 'live' : `−${seconds.toFixed(1)}s`;
}

/** `gg-rewind-20261127-140532.webm` — sortable, unique per second, typed. */
export function clipName(extension: string, at: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp =
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  const clean = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `gg-rewind-${stamp}.${clean}`;
}
