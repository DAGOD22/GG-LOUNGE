import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The relay is the reason a room connects on a network that blocks peer-to-peer
 * traffic. The failure it fixes was total: two players on a school network got
 * "waiting" forever, with no error and nothing to retry, because ICE never
 * completed and the state stayed `connecting`.
 *
 * These tests are structural — they assert the properties that make the relay
 * safe — plus one behavioural check through the real store, because the first
 * version of it silently dropped every message (the local JSON store rebuilds
 * its object on read and dropped the unknown slice).
 */

const route = readFileSync(new URL('../app/api/coop/relay/route.ts', import.meta.url), 'utf8');
const room = readFileSync(new URL('../components/live/CoopRoom.tsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../lib/db/local-store.ts', import.meta.url), 'utf8');

test('relayed payloads are validated with the same parser as the data channel', () => {
  assert.match(route, /parseRoomMessage\(parsed\)/, 'the route must reuse the room message parser');
  // A relay that forwarded arbitrary strings would be a general-purpose bus.
  assert.match(route, /Not a room message/);
});

test('a relayed key press must be a key the room is allowed to forward', () => {
  assert.match(route, /shouldForwardKey\(message\.frame\.c\)/, 'keys are checked against the allow-list');
  assert.match(route, /Key not forwardable/);
});

test('the relay queue is bounded and short-lived', async () => {
  const source = readFileSync(new URL('../lib/db/relay.ts', import.meta.url), 'utf8');
  assert.match(source, /RELAY_TTL_MS = 2 \* 60_000/, 'messages expire in two minutes');
  assert.match(source, /MAX_QUEUE = 240/, 'the queue has a hard cap');
  assert.match(source, /MAX_BODY = 4096/, 'a single message has a hard cap');
  assert.match(source, /from !== side/, 'a peer never receives its own messages');
});

test('the relay queue survives the local store rebuild', () => {
  // This is the bug that made the first implementation look connected and lose
  // every message: readLocal() constructs a fresh object and drops any slice it
  // does not name.
  assert.match(store, /coopRelay\?: unknown;/, 'the slice is declared');
  assert.match(store, /coopRelay: \(parsed as any\)\.coopRelay/, 'the slice is carried across reads');
});

test('a room falls back to the relay instead of dead-ending on a failed connection', () => {
  assert.match(room, /startRelay\(/, 'the room can start the relay');
  // A failed state must not simply set an error and stop.
  const failure = room.match(/connectionState === 'failed'[\s\S]{0,700}/);
  assert.ok(failure, 'the failed-state handler must exist');
  assert.match(failure![0], /startRelay\(codeRef\.current\)/, 'it switches transport rather than giving up');
  assert.doesNotMatch(failure![0].slice(0, 40), /^.*setStatus\('error'\)/, 'it must not jump straight to an error');
});

test('a stuck connection is caught by a watchdog, not left spinning', () => {
  assert.match(room, /setTimeout\([\s\S]{0,400}7000\)/, 'there is a timeout on a room that never connects');
  assert.match(room, /No direct route between you/, 'and it says so');
});

test('the panel tells the player which transport is live', () => {
  // Sending chat through a server without saying so would be a privacy
  // surprise; the wording is part of the contract.
  assert.match(room, /through the relay/, 'the status line names the relay');
  assert.match(room, /peer to peer/, 'and names the direct case');
  assert.match(room, /In a room \(relay\)/, 'the collapsed trigger shows it too');
});

test('the relay store delivers between two sides and hides own messages', async () => {
  process.env.VERCEL = '';
  const { relayStore } = await import('../lib/db/relay');
  // A unique code per run: the store is shared across tests in one process, and
  // a time-derived code collided between runs, which made this test flaky rather
  // than wrong (it read two messages because it reused a room).
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  for (let i = 0; i < 8; i++) await relayStore.drain(code, 0, 'host');

  await relayStore.push(code, 'host', '{"t":"chat","text":"one"}');
  const guestSees = await relayStore.drain(code, 0, 'guest');
  assert.equal(guestSees.length, 1, 'the guest receives the host message');
  assert.equal(guestSees[0].body, '{"t":"chat","text":"one"}');

  const hostSees = await relayStore.drain(code, 0, 'host');
  assert.equal(hostSees.length, 0, 'the host does not receive its own message');

  await relayStore.push(code, 'guest', '{"t":"chat","text":"two"}');
  const afterCursor = await relayStore.drain(code, guestSees[0].seq, 'host');
  assert.equal(afterCursor.length, 1, 'the cursor only returns what is new');
  assert.equal(afterCursor[0].body, '{"t":"chat","text":"two"}');
});
