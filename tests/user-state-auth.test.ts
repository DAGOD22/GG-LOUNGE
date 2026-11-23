import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestIdFromToken, mintGuestToken } from '../lib/owner';

/**
 * Regression cover for an IDOR: /api/user-state used to take the row id from
 * the query string / body, so any id (which is not a secret, and appears in
 * share links) granted full read and write access to that user's favorites and
 * play history.
 */

test('a minted guest token resolves back to its own id', () => {
  const id = 'anon_abc123';
  const token = mintGuestToken(id);
  assert.equal(guestIdFromToken(token), id);
});

test('a bare id is not accepted as proof of ownership', () => {
  assert.equal(guestIdFromToken('anon_abc123'), null);
});

test('a token with a tampered id is rejected', () => {
  const token = mintGuestToken('anon_abc123');
  const signature = token.slice(token.lastIndexOf('.') + 1);
  assert.equal(guestIdFromToken(`anon_someoneelse.${signature}`), null);
});

test('a token with a tampered signature is rejected', () => {
  const token = mintGuestToken('anon_abc123');
  const id = token.slice(0, token.lastIndexOf('.'));
  assert.equal(guestIdFromToken(`${id}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`), null);
});

test('malformed tokens are rejected rather than throwing', () => {
  for (const bad of ['', '.', 'noise', 'anon_abc123.', '.abc', 'anon_abc123.sig.extra']) {
    assert.equal(guestIdFromToken(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('ids that are not shaped like ours are rejected even when signed', () => {
  assert.equal(guestIdFromToken(mintGuestToken('someone-else')), null);
});
