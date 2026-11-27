/**
 * CHATVERSE: the door, the storage rules and the "no bots" promise.
 *
 * The interesting failures in a private chat are not "does it render" — they are
 * "can somebody who was not let in read this", "can an upload become a script",
 * and "is this message actually from a person". Each has a test here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { cleanBody, cleanRoomName, roomIdFrom } from '../lib/db/chat';
import { sniffMedia } from '../lib/db/chat-media';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

test('CHATVERSE is gated on its own password and its own cookie', () => {
  const auth = read('lib/chatverse-auth.ts');
  // Its own cookie, not the admin session: typing the chat password must not
  // hand over the admin console.
  assert.match(auth, /gg_chatverse/);
  assert.match(auth, /timingSafeEqual/);
  const gate = read('app/chatverse/page.tsx');
  assert.match(gate, /isChatverseMember\(\)/);
  assert.match(gate, /noindex|index: false/);

  // Every API route behind it checks the cookie itself; a page-level check is
  // not an API-level check.
  for (const route of [
    'app/api/chat/rooms/route.ts',
    'app/api/chat/messages/route.ts',
    'app/api/chat/poll/route.ts',
    'app/api/chat/media/route.ts',
    'app/api/chat/media/[id]/route.ts',
  ]) {
    assert.match(read(route), /isChatverseMember\(\)/, `${route} must gate itself`);
  }
});

test('nothing seeds the chat — an empty room is an empty room', () => {
  // No system messages, no welcome text, no fake activity anywhere in the
  // feature. This is the user's explicit requirement and it is easy to regress
  // by "helpfully" adding a joined-the-room line.
  // Comments are stripped first: the module explains this rule in prose, and
  // the prose is not the thing under test.
  const code = (file: string) =>
    read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const file of ['lib/db/chat.ts', 'components/chatverse/ChatverseApp.tsx']) {
    assert.doesNotMatch(code(file), /welcome|joined the room|system message|\bbot\b/i, `${file} must not add chatter`);
  }
  // And the UI says so, rather than showing a blank pane.
  assert.match(read('components/chatverse/ChatverseApp.tsx'), /only when somebody sends one/);
});

test('an upload is typed by its bytes, not by its name', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(sniffMedia(png), 'image/png');
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(sniffMedia(jpeg), 'image/jpeg');
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(sniffMedia(webm), 'video/webm');
  // An SVG is a document that can run script; a text file is not an image.
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(sniffMedia(svg), null);
  const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
  assert.equal(sniffMedia(html), null);
});

test('messages are text, collapsed and capped', () => {
  assert.equal(cleanBody('  hi  '), 'hi');
  assert.equal(cleanBody('a\r\nb'), 'a\nb');
  assert.equal(cleanBody('a\n\n\n\n\n\nb'), 'a\n\n\nb');
  assert.ok(cleanBody('x'.repeat(5000)).length <= 2000);
  // Zero-width characters would let a message render as something it is not.
  assert.equal(cleanBody('a\u200bb'), 'ab');
  assert.equal(cleanBody(42), '');
  assert.equal(cleanBody(null), '');
});

test('room names are words, and their ids are safe path segments', () => {
  assert.equal(cleanRoomName('late night'), 'late night');
  assert.equal(cleanRoomName('<script>'), 'script');
  assert.equal(roomIdFrom('Late Night!'), 'late-night');
  assert.match(roomIdFrom('../../etc/passwd'), /^[a-z0-9-]+$/);
});

test('the chat page is not indexed and is not in the sitemap', () => {
  const sitemap = read('app/sitemap.ts');
  assert.doesNotMatch(sitemap, /chatverse/);
  assert.equal(existsSync(path.join(ROOT, 'app/chatverse/page.tsx')), true);
});

test('the coop host opens the data channel before it makes the offer', () => {
  // Without this, two peers connect at the ICE level and then have nothing to
  // talk over — the room says "connected" and no message ever arrives.
  const coop = read('components/live/CoopRoom.tsx');
  assert.match(coop, /buildConnection\(myName, true\)/);
  assert.match(coop, /buildConnection\(myName, false\)/);
  assert.match(coop, /pc\.createDataChannel\('ggl-coop'/);
  assert.doesNotMatch(coop, /void onOffer/);
});

test('the custom cursor is not hidden behind the customize dialog', () => {
  // A modal <dialog> paints above every z-index, so the cursor canvas cannot be
  // drawn over it — the panel must simply keep the native pointer.
  const css = read('app/customization.css');
  assert.match(css, /ggl-dialog-open/);
  const dialog = read('components/customization/CustomizationDialog.tsx');
  assert.match(dialog, /ggl-dialog-open/);
});

test('a database failure in a chat route answers in JSON, never as a silent HTML 500', () => {
  // The failure that ate messages: an unhandled throw produced an HTML 500,
  // the client's response.json() failed, the message was marked "not sent"
  // with no reason, and a send looked identical to a save that vanished.
  // Every route that touches the database now catches and answers 503 JSON.
  for (const route of [
    'app/api/chat/rooms/route.ts',
    'app/api/chat/messages/route.ts',
    'app/api/chat/poll/route.ts',
    'app/api/chat/media/route.ts',
  ]) {
    const source = read(route);
    assert.match(source, /describeDbError/, `${route} must translate database errors`);
    assert.match(source, /catch \(cause\)/, `${route} must catch its own failures`);
    assert.match(source, /status: 503/, `${route} must answer a storage failure as 503`);
  }
});

test('a failed send is loud and recoverable', () => {
  const app = read('components/chatverse/ChatverseApp.tsx');
  // The old code only surfaced errors for media sends (`if (!text)`), so a
  // refused text message showed "not sent" and nothing else.
  assert.doesNotMatch(app, /if \(!text\) setError/);
  assert.match(app, /Your message is back in the box/, 'the error names what happened to the text');
  assert.match(app, /cv-retry/, 'a failed row carries a retry affordance');
  assert.match(app, /Try again/);
  // A failed rooms load is an error, not an empty list: an empty list reads
  // as "every room vanished", which is how a storage outage gaslights people.
  assert.match(app, /Could not load the rooms/);
});

test('a chat room leads somewhere playable', () => {
  // "I made a room, a friend joined, and then nothing happens" — the room
  // header now carries a door into the co-op panel, and the co-op panel
  // listens for it.
  const app = read('components/chatverse/ChatverseApp.tsx');
  assert.match(app, /ggl:coop-open/, 'the chat dispatches the open event');
  const coop = read('components/live/CoopRoom.tsx');
  assert.match(coop, /ggl:coop-open/, 'the co-op panel answers the chat');
});

test('the long poll declares its duration, so the host does not kill it mid-wait', () => {
  // A serverless function killed at its timeout ends the poll with no
  // response — the client then waits two seconds and re-polls, which works,
  // but an explicit maxDuration keeps the long wait legal in the first place.
  const poll = read('app/api/chat/poll/route.ts');
  assert.match(poll, /maxDuration/);
  assert.match(poll, /force-dynamic/);
});

test('the behaviour warps that rewire the home page are wired in the page', () => {
  const page = read('app/page.tsx');
  // Incognito: the history writes and the account sync stand down.
  assert.match(page, /useSecretFlag\('incognito'\)/);
  assert.match(page, /if\(incognitoOn\) return; try\{localStorage\.setItem\('ggl_recent'/);
  assert.match(page, /if\(incognitoOn\) return/, 'the account sync sends nothing while incognito is on');
  // Roulette re-rolls launches through the same random picker the palette's
  // "play a random game" uses; Full Blast goes fullscreen inside the click.
  assert.match(page, /useSecretFlag\('chaos'\)/);
  assert.match(page, /if \(chaosOn\) \{\s*const roll = pickRandom\(allGames\)/);
  assert.match(page, /requestFullscreen/, 'fullscreen must be requested inside the launch (user activation)');
  // Backwards reverses the catalogue; the Power Menu's hidden games vanish.
  assert.match(page, /useSecretFlag\('backwards'\)/);
  assert.match(page, /hiddenSet\.size\)/);
});
