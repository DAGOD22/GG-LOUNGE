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

/**
 * The report endpoint used to double as an unthrottled upvote endpoint, and
 * its GET listed every report to anyone. isAdmin() needs a live request scope,
 * so this asserts the shape of the route rather than invoking it.
 */
test('report route no longer proxies upvotes and gates its list', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../app/api/report/route.ts', import.meta.url), 'utf8');
  // Strip comments: the file documents the hole it closed.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/upvoteRequestId|upvoteRequest\(/.test(code), false, 'upvotes must go through the rate-limited endpoint');
  assert.match(code, /isAdmin\(\)/, 'GET must check for an admin session');
  const mod = await import('../app/api/report/route');
  assert.equal(typeof mod.POST, 'function');
  assert.equal(typeof mod.GET, 'function');
});
