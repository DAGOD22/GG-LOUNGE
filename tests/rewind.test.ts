/**
 * The pure side of Rewind.
 *
 * The rewind feature is mostly DOM, but the maths underneath it is where the
 * history actually lives, and it is exactly the part that can be silently
 * wrong: a ring buffer walked from the wrong end shows frames in the wrong
 * order, a scrubber that lies about its seconds makes "go back in time" a
 * guess, and a clip name that collides overwrites the last export.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BUFFER_SECONDS,
  FRAMES,
  SAMPLE_MS,
  clipName,
  filledOrder,
  secondsBack,
  tapeLabel,
} from '../components/live/arcade/rewind-core';

test('rewind: the buffer holds nine seconds', () => {
  assert.equal(FRAMES * SAMPLE_MS, 9_000);
  assert.equal(BUFFER_SECONDS, 9);
});

test('rewind: a full buffer walks oldest-first from the head', () => {
  // head is the NEXT write, so slot head-1 is the newest frame and head is
  // the oldest live one. The order must start at head and wrap.
  const order = filledOrder(7, FRAMES, FRAMES);
  assert.equal(order[0], 7);
  assert.equal(order[order.length - 1], 6);
  assert.equal(order.length, FRAMES);
  // Every index exactly once — a ring that repeats a slot would replay one
  // frame twice and silently drop another.
  assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: FRAMES }, (_, i) => i));
});

test('rewind: a partially filled buffer is in write order, not ring order', () => {
  // Five frames recorded (head at 5). Ring order would start at slot 5 —
  // which has never been written — and show an empty frame first.
  const order = filledOrder(5, 5, FRAMES);
  assert.deepEqual(order, [0, 1, 2, 3, 4]);
});

test('rewind: an empty buffer has no order', () => {
  assert.deepEqual(filledOrder(0, 0, FRAMES), []);
});

test('rewind: secondsBack measures from the newest frame', () => {
  assert.equal(secondsBack(9, 10), 0, 'the newest frame is live');
  assert.equal(secondsBack(0, 10), (9 * SAMPLE_MS) / 1000, 'the oldest is (count-1) samples back');
  assert.equal(secondsBack(5, 10), ((9 - 5) * SAMPLE_MS) / 1000);
});

test('rewind: the scrubber cannot ask for time that does not exist', () => {
  assert.equal(secondsBack(-4, 10), secondsBack(0, 10), 'below the range clamps to the oldest');
  assert.equal(secondsBack(99, 10), 0, 'above the range clamps to live');
});

test('rewind: the tape clock reads like a tape clock', () => {
  assert.equal(tapeLabel(9, 10), 'live');
  assert.equal(tapeLabel(5, 10), '−1.2s');
  // A single frame is not history; calling it anything but "live" is a lie.
  assert.equal(tapeLabel(0, 1), 'live');
  assert.equal(tapeLabel(0, 0), 'live');
});

test('rewind: clip names sort by time and carry their extension', () => {
  const name = clipName('webm', new Date(2026, 10, 27, 14, 5, 9));
  assert.match(name, /^gg-rewind-20261127-140509\.webm$/);
  const later = clipName('webm', new Date(2026, 10, 27, 14, 5, 10));
  assert.ok(name < later, 'two exports one second apart must sort correctly');
  assert.match(clipName('PNG', new Date(2026, 0, 1)), /\.png$/, 'the extension is cleaned, not trusted');
});
