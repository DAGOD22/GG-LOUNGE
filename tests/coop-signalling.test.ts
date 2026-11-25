import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeOffer, encodeAnswer, decodeSignal } from '../lib/coop';

/**
 * The signalling store accepted nothing, and nobody noticed for a release.
 *
 * `lib/db/coop.ts` validated a stored offer with `value.includes('v=0')` — a
 * check that the *raw* SDP carries its version line. But the client never
 * sends raw SDP: it sends `encodeOffer()` output, base64url, which cannot
 * contain the literal text `v=0` under any input. So `createRoom` returned
 * null for every real offer, the API answered 503, and the panel showed
 * "Could not open a room" 100% of the time, on every network, for every user.
 *
 * The lesson pinned here: validate the *decoded* envelope. A test that only
 * called `createRoom` with a hand-written `v=0` string would have passed while
 * the feature was completely broken, so these tests go through the real
 * encoder the browser uses.
 */

const OFFER_SDP = 'v=0\r\no=- 46117316 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=fingerprint:sha-256 AB:CD\r\n';
const ANSWER_SDP = 'v=0\r\no=- 99887766 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';

test('a real encoded offer round-trips through the decoder', () => {
  const encoded = encodeOffer({ type: 'offer', sdp: OFFER_SDP });
  assert.ok(!encoded.includes('v=0'), 'base64url cannot contain literal "v=0" — this is the whole bug');
  const decoded = decodeSignal(encoded);
  assert.ok(decoded, 'the encoded offer must decode');
  assert.equal(decoded.t, 'offer');
  assert.equal(decoded.sdp, OFFER_SDP);
});

test('a real encoded answer round-trips through the decoder', () => {
  const decoded = decodeSignal(encodeAnswer({ type: 'answer', sdp: ANSWER_SDP }));
  assert.ok(decoded);
  assert.equal(decoded.t, 'answer');
});

test('junk is rejected by the decoder, not accepted as an offer', () => {
  for (const junk of ['', 'not-an-offer', 'AAAA', Buffer.from('{"hello":1}').toString('base64url')]) {
    assert.equal(decodeSignal(junk), null, `should reject ${JSON.stringify(junk)}`);
  }
});

test('the signalling store validates the decoded envelope, not a raw v=0 substring', () => {
  // A source-level assertion is the honest one here: the store pulls in
  // Postgres and the filesystem, so the thing worth guarding is that the
  // validation function stays envelope-aware.
  const source = readFileSync(new URL('../lib/db/coop.ts', import.meta.url), 'utf8');
  const body = source.match(/function validSdp\([\s\S]*?\n}/);
  assert.ok(body, 'validSdp must exist');
  assert.match(body![0], /decodeSignal\(/, 'validSdp must decode the envelope');
  assert.ok(
    !/value\.includes\('v=0'\)/.test(body![0]),
    'validSdp must not test raw SDP text: the client sends base64url',
  );
});

test('the API distinguishes an unreadable offer from a storage failure', () => {
  const source = readFileSync(new URL('../app/api/coop/route.ts', import.meta.url), 'utf8');
  assert.match(source, /decodeSignal\(offer\)/, 'the create path must branch on decodability');
  assert.match(source, /was not readable/);
});
