import test from 'node:test';
import assert from 'node:assert/strict';

import {
  codeToKey,
  decodeSignal,
  dispatchKey,
  encodeOffer,
  isValidRoomCode,
  normalizeRoomCode,
  parseInputFrame,
  parseRoomMessage,
  roomCodeFrom,
  shouldForwardKey,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  REACTION_SET,
  type InputFrame,
} from '../lib/coop';
import { cleanCursor, cleanGameId, cleanName } from '../lib/db/presence';
import { burstFor, docSlice, essayLength, DOC_ESSAYS, shouldExitOnWord, wordCount } from '../lib/panic-doc';

/* ------------------------------------------------------------------ codes */

test('room codes omit the characters that are misheard out loud', () => {
  // The code gets read down a phone or typed from a screenshot, so the letters
  // that collide with digits are simply not in the alphabet.
  for (const banned of ['I', 'L', 'O', 'U']) {
    assert.ok(!ROOM_ALPHABET.includes(banned), `${banned} must not be in the alphabet`);
  }
  assert.equal(new Set(ROOM_ALPHABET).size, ROOM_ALPHABET.length, 'no duplicates');
});

test('a room code is derived from the offer and is stable', () => {
  const offer = 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
  const first = roomCodeFrom(offer);
  assert.equal(first, roomCodeFrom(offer), 'same offer must give the same code');
  assert.equal(first.length, ROOM_CODE_LENGTH);
  assert.ok([...first].every(char => ROOM_ALPHABET.includes(char)));
  assert.notEqual(first, roomCodeFrom(`${offer}m=ice\r\n`), 'a different offer must not collide');
});

test('a code typed by a friend is normalised, including their typos', () => {
  assert.equal(normalizeRoomCode(' ab-cd 3e '), 'ABCD3E');
  assert.equal(normalizeRoomCode('abcd3e'), 'ABCD3E');
  // read-aloud confusion: O→0, I/L→1, U→V
  // 'OIlu' reads as "O I L U" — each is mapped onto the letter it is confused with
  assert.equal(normalizeRoomCode('OIlu'), '011V');
  assert.equal(normalizeRoomCode('abc'), 'ABC', 'short input is not padded into a valid code');
});

test('code validity requires the full length', () => {
  assert.equal(isValidRoomCode('ABCD3E'), true);
  assert.equal(isValidRoomCode('ABCD3'), false);
  assert.equal(isValidRoomCode(''), false);
});

/* -------------------------------------------------------------- signalling */

test('an offer survives a base64url round trip', () => {
  const sdp = 'v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\na=group:BUNDLE 0\r\n';
  const encoded = encodeOffer({ type: 'offer', sdp });
  assert.ok(!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='), 'url-safe, paste-safe');
  const decoded = decodeSignal(encoded);
  assert.equal(decoded?.t, 'offer');
  assert.equal(decoded?.sdp, sdp);
});

test('a mangled payload decodes to nothing rather than throwing', () => {
  assert.equal(decodeSignal(''), null);
  assert.equal(decodeSignal('not-a-real-payload'), null);
  // valid base64, wrong shape
  assert.equal(decodeSignal(Buffer.from(JSON.stringify({ v: 2, t: 'offer', sdp: 'v=0' })).toString('base64')), null);
  assert.equal(decodeSignal(Buffer.from(JSON.stringify({ v: 1, t: 'offer', sdp: 'nope' })).toString('base64')), null);
});

/* ------------------------------------------------------------- input frames */

test('input frames are bounded when they arrive from the wire', () => {
  assert.deepEqual(parseInputFrame({ t: 'down', c: 'KeyW', k: 'w' }), { t: 'down', c: 'KeyW', k: 'w' });
  assert.deepEqual(parseInputFrame({ t: 'up', c: 'KeyW' }), { t: 'up', c: 'KeyW' });
  assert.deepEqual(parseInputFrame({ t: 'release-all' }), { t: 'release-all' });
  assert.equal(parseInputFrame({ t: 'down' }), null);
  assert.equal(parseInputFrame({ t: 'nope' }), null);
  assert.equal(parseInputFrame(null), null);
  // an oversized code is truncated rather than trusted
  const long = parseInputFrame({ t: 'down', c: 'X'.repeat(200) });
  assert.equal(long?.t === 'down' ? long.c.length : -1, 32);
});

test('only game keys are forwarded, never browser keys', () => {
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'Space', 'ShiftLeft', 'Enter']) {
    assert.equal(shouldForwardKey(code), true, `${code} must be forwardable`);
  }
  for (const code of ['F12', 'Tab', 'Escape', 'KeyT', 'MetaLeft', 'ControlLeft', 'Digit9']) {
    assert.equal(shouldForwardKey(code), false, `${code} must never be forwarded`);
  }
});

test('key codes map to the character a game actually reads', () => {
  assert.equal(codeToKey('KeyW'), 'w');
  assert.equal(codeToKey('Digit4'), '4');
  assert.equal(codeToKey('Space'), ' ');
  assert.equal(codeToKey('ArrowLeft'), 'ArrowLeft');
  assert.equal(codeToKey('ShiftLeft'), 'Shift');
});

/* ---------------------------------------------------------- frame injection */

function wiredWindow() {
  const seen: string[] = [];
  const fakeWindow = {
    KeyboardEvent: class {
      type: string;
      code: string;
      key: string;
      bubbles: boolean;
      composed: boolean;
      constructor(type: string, init: { code: string; key: string; bubbles: boolean; composed: boolean }) {
        this.type = type;
        this.code = init.code;
        this.key = init.key;
        this.bubbles = init.bubbles;
        this.composed = init.composed;
      }
    },
    document: {
      defaultView: null as unknown,
      body: {},
      activeElement: null,
      dispatchEvent(event: { type: string; code: string }) {
        seen.push(`${event.type}:${event.code}`);
        return true;
      },
    },
  };
  fakeWindow.document.defaultView = fakeWindow;
  return { fakeWindow, seen };
}

test('a remote key reaches the game as a real KeyboardEvent', () => {
  const { fakeWindow, seen } = wiredWindow();
  assert.equal(dispatchKey(fakeWindow as never, { t: 'down', c: 'KeyW', k: 'w' }), true);
  assert.equal(dispatchKey(fakeWindow as never, { t: 'up', c: 'KeyW' }), true);
  assert.deepEqual(seen, ['keydown:KeyW', 'keyup:KeyW']);
});

test('release-all lifts every key the remote player may be holding', () => {
  const { fakeWindow, seen } = wiredWindow();
  assert.equal(dispatchKey(fakeWindow as never, { t: 'release-all' }), true);
  assert.ok(seen.length >= 10, 'every holdable key gets a keyup');
  assert.ok(seen.every(entry => entry.startsWith('keyup:')), 'nothing is pressed during a release');
});

test('a missing or cross-origin frame is a false return, not a crash', () => {
  assert.equal(dispatchKey(null, { t: 'down', c: 'KeyW', k: 'w' }), false);
  assert.equal(dispatchKey(undefined, { t: 'down', c: 'KeyW', k: 'w' }), false);
  // a frame whose document throws (cross-origin) must not propagate
  const hostile = {
    get document(): never {
      throw new Error('SecurityError');
    },
  };
  assert.equal(dispatchKey(hostile as never, { t: 'down', c: 'KeyW', k: 'w' }), false);
});

/* ----------------------------------------------------------- room messages */

test('room messages are validated field by field', () => {
  assert.equal(parseRoomMessage({ t: 'hello', name: 'Sam' })?.t, 'hello');
  const longName = parseRoomMessage({ t: 'hello', name: 'x'.repeat(80) });
  assert.ok(longName && longName.t === 'hello');
  if (longName && longName.t === 'hello') assert.equal(longName.name.length, 24, 'a long name is truncated, not rejected');
  assert.equal(parseRoomMessage(null), null);
  assert.equal(parseRoomMessage({ t: 'chat', text: '   ' }), null, 'an empty chat line is not a message');
  assert.equal(parseRoomMessage({ t: 'chat', text: 'gg' })?.t, 'chat');
  assert.equal(parseRoomMessage({ t: 'launch', gameId: 'not a game!' }), null);
  assert.equal(parseRoomMessage({ t: 'launch', gameId: 'slope' })?.t, 'launch');
  assert.equal(parseRoomMessage({ t: 'reaction', emoji: '🔥' })?.t, 'reaction');
  assert.equal(parseRoomMessage({ t: 'reaction', emoji: '💩' }), null, 'only the offered reactions');
  for (const emoji of REACTION_SET) assert.ok(parseRoomMessage({ t: 'reaction', emoji }));
});

test('peer cursor coordinates are clamped into the viewport', () => {
  const message = parseRoomMessage({ t: 'presence', name: 'Sam', x: 500, y: -80, game: 'slope' });
  assert.equal(message?.t, 'presence');
  if (message?.t === 'presence') {
    assert.equal(message.x, 100);
    assert.equal(message.y, 0);
    assert.equal(message.game, 'slope');
  }
  const floating = parseRoomMessage({ t: 'presence', name: 'Sam', x: Number.NaN, y: 50, game: null });
  if (floating?.t === 'presence') assert.equal(floating.x, 50);
});

/* ----------------------------------------------------------- presence guards */

test('presence names are trimmed, stripped of control characters and bounded', () => {
  assert.equal(cleanName('  Sam  '), 'Sam');
  assert.equal(cleanName('Sa\u0000m\u001b'), 'Sam');
  assert.equal(cleanName('x'.repeat(200))?.length, 24);
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(42), null);
});

test('game ids must look like catalogue ids', () => {
  assert.equal(cleanGameId('slope'), 'slope');
  assert.equal(cleanGameId(' ragdoll-archers '), 'ragdoll-archers');
  assert.equal(cleanGameId('not a game!'), null);
  assert.equal(cleanGameId('x'.repeat(80)), null);
  assert.equal(cleanGameId(null), null);
});

test('cursor payloads are clamped before they are stored', () => {
  const cursor = cleanCursor({ x: 400, y: -20, preset: 'comet', size: 999, accent: 'red' });
  assert.equal(cursor.x, 100);
  assert.equal(cursor.y, 0);
  assert.equal(cursor.size, 64, 'size is clamped to the drawable maximum');
  assert.equal(cursor.accent, '#d7f34a', 'a non-hex accent falls back to the lounge lime');
  assert.equal(cleanCursor({ x: 'left', y: null }).x, 50);
  assert.equal(cleanCursor({ x: 1, y: 1, size: 8 }).size, 16);
  assert.equal(cleanCursor({ image: 'x'.repeat(50_000) }).image, '', 'an oversized image is dropped');
});

/* --------------------------------------------------------------- fake doc */

test('every essay is long enough to pass as real work', () => {
  for (const essay of DOC_ESSAYS) {
    assert.ok(essay.paragraphs.length >= 4, `${essay.id} needs real paragraphs`);
    assert.ok(essayLength(essay) > 1200, `${essay.id} is too short to pass as an essay`);
    assert.ok(essay.title && essay.subtitle, `${essay.id} needs a title and a class line`);
  }
});

test('the document slice grows with the character count and never overshoots', () => {
  const essay = DOC_ESSAYS[0];
  const empty = docSlice(essay, 0);
  assert.equal(empty.text.length, 0);
  assert.equal(empty.done, false);

  const partial = docSlice(essay, 400);
  assert.ok(partial.text.length >= 1);
  assert.ok(partial.text[0].length > 0);
  assert.equal(partial.done, false);

  // monotonic: more characters never shows less text
  let previous = 0;
  for (const count of [100, 500, 900, 1300, 2000]) {
    const visible = docSlice(essay, count).text.join('').length;
    assert.ok(visible >= previous, 'the document never shrinks as you keep typing');
    previous = visible;
  }

  const full = docSlice(essay, essayLength(essay) + 9999);
  assert.equal(full.text.length, essay.paragraphs.length);
  assert.equal(full.text.at(-1), essay.paragraphs.at(-1));
  assert.equal(full.done, true);
});

test('the word count only counts visible words', () => {
  const essay = DOC_ESSAYS[1];
  assert.equal(wordCount(essay, 0), 0);
  const early = wordCount(essay, 60);
  const later = wordCount(essay, 600);
  assert.ok(early > 0 && later > early);
});

test('typing arrives in bursts, not one machine-perfect character', () => {
  const bursts = Array.from({ length: 8 }, (_, index) => burstFor(index));
  assert.ok(bursts.some(value => value > 1), 'some keystrokes must add more than one character');
  assert.ok(Math.max(...bursts) <= 3, 'a burst must stay small enough to look like typing');
  assert.deepEqual(bursts, Array.from({ length: 8 }, (_, index) => burstFor(index)), 'deterministic');
  assert.deepEqual(bursts, Array.from({ length: 8 }, (_, index) => burstFor(index + 8)), 'and it loops evenly');
});

test('the exit word is recognised without ever being shown', () => {
  assert.equal(shouldExitOnWord('ggo'), false);
  assert.equal(shouldExitOnWord('ggout'), true);
  assert.equal(shouldExitOnWord('somethingGGOUT'), true);
  assert.equal(shouldExitOnWord('ggoutt'), false);
});
