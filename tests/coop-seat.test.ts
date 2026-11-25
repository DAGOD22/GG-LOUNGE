import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { dispatchKey, legacyKeyCode, parseInputFrame, toSeatKey } from '../lib/coop';

/**
 * Forwarded keys must actually move the friend's avatar.
 *
 * Two separate faults made "send my keys" do nothing:
 *
 *  1. A KeyboardEvent built from an init dictionary reports `keyCode === 0`.
 *     Most of this catalogue is old enough to read `keyCode`, so the event
 *     arrived, looked like code zero, and was dropped.
 *  2. Both players were pressing player one's keys, so even a game that read
 *     the event saw one player fighting themselves.
 *
 * These tests pin the fixes against a real jsdom document, because the whole
 * question is "what does a listener in that document actually see".
 */

function doc() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  return { dom, document: dom.window.document };
}

test('a dispatched arrow carries a usable legacy keyCode', () => {
  const { document } = doc();
  const seen: Array<{ code: string; key: string; keyCode: number; which: number }> = [];
  document.addEventListener('keydown', event => {
    const e = event as KeyboardEvent;
    seen.push({ code: e.code, key: e.key, keyCode: e.keyCode, which: e.which });
  });

  assert.equal(dispatchKey(document.defaultView as never, { t: 'down', c: 'ArrowUp', k: 'ArrowUp' }), true);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].code, 'ArrowUp');
  assert.equal(seen[0].keyCode, 38, 'a keyCode listener must see 38, not 0');
  assert.equal(seen[0].which, 38);
});

test('keyCode is correct for the keys a game actually binds', () => {
  assert.equal(legacyKeyCode('KeyW'), 87);
  assert.equal(legacyKeyCode('KeyD'), 68);
  assert.equal(legacyKeyCode('Space'), 32);
  assert.equal(legacyKeyCode('ArrowLeft'), 37);
  assert.equal(legacyKeyCode('Digit1'), 49);
  assert.equal(legacyKeyCode('F13'), 0, 'unknown codes are zero, never NaN');
});

test('a seat-2 frame lands on player two controls, not player one', () => {
  const { document } = doc();
  const seen: string[] = [];
  document.addEventListener('keydown', event => seen.push((event as KeyboardEvent).code));

  // The friend (seat 2) presses their up key.
  dispatchKey(document.defaultView as never, { t: 'down', c: 'ArrowUp', k: 'ArrowUp', seat: 2 }, 'legacy');

  assert.deepEqual(seen, ['KeyW'], 'in the legacy scheme P2 is WASD');
  assert.notEqual(seen[0], 'ArrowUp', 'P2 must not press P1 keys');
});

test('seat 1 keeps the keys the host physically pressed', () => {
  assert.equal(toSeatKey('ArrowUp', undefined, 'legacy'), 'ArrowUp');
  assert.equal(toSeatKey('ArrowUp', 2, 'modern'), 'ArrowUp', 'modern scheme gives P2 the arrows');
  assert.equal(toSeatKey('KeyW', 2, 'modern'), 'ArrowUp');
});

test('an unrecognised key is forwarded unchanged rather than swallowed', () => {
  assert.equal(toSeatKey('KeyP', 2, 'legacy'), 'KeyP');
});

test('seat is validated on the wire and cannot be an arbitrary number', () => {
  assert.equal(parseInputFrame({ t: 'down', c: 'KeyW', k: 'w', seat: 2 })?.seat, 2);
  assert.equal(parseInputFrame({ t: 'down', c: 'KeyW', k: 'w', seat: 7 })?.seat, undefined);
  assert.equal(parseInputFrame({ t: 'down', c: 'KeyW', k: 'w', seat: '2' })?.seat, undefined);
});

test('release-all clears every key either scheme could be holding', () => {
  const { document } = doc();
  const released: string[] = [];
  document.addEventListener('keyup', event => released.push((event as KeyboardEvent).code));

  dispatchKey(document.defaultView as never, { t: 'release-all', seat: 2 });

  for (const code of ['ArrowUp', 'KeyW', 'KeyD', 'Space']) {
    assert.ok(released.includes(code), `${code} must be released`);
  }
});
