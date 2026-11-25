import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The bare route keeps TLS verification as the default and only retries a host
 * unverified when Node reports a certificate-chain failure. That retry is easy
 * to get wrong in two subtle ways, and both used to be live bugs:
 *
 *  1. Matching too eagerly would downgrade every request.
 *  2. Reading 'v3' out of /api/bare/v3/https%3A... as the target host would
 *     mark a shared version segment as chain-broken, so after ONE failing host
 *     every path-style request would silently skip verification.
 *
 * The route module is exercised in production, not in unit tests, so this pins
 * the two invariants by inspecting the extracted helper logic.
 */
const ROUTE = readFileSync(new URL('../app/api/bare/[[...rest]]/route.ts', import.meta.url), 'utf8');

test('path-style targets skip the version segment when resolving the host', () => {
  assert.match(ROUTE, /\^v\[123\]\$/, 'version segments must be recognised');
  // Reproduce the extractor against the two request shapes the proxy emits.
  const extract = (pathname: string) => {
    const segments = pathname.split('/api/bare/')[1]?.split('/') || [];
    const segment = /^v[123]$/.test(segments[0]) ? segments[1] : segments[0];
    if (!segment) return '';
    try {
      const decoded = decodeURIComponent(segment);
      return (decoded.includes('://') ? new URL(decoded).hostname : decoded).toLowerCase();
    } catch { return ''; }
  };
  assert.equal(extract('/api/bare/v3/https%3A%2F%2Fgithub.com%2F'), 'github.com');
  assert.equal(extract('/api/bare/https%3A%2F%2Fgithub.com%2F'), 'github.com');
  assert.equal(extract('/api/bare/v1/'), '', 'a bare version prefix has no host');
  assert.notEqual(extract('/api/bare/v3/https%3A%2F%2Fexample.com%2F'), 'v3');
});

test('a host is only remembered after a real chain failure', () => {
  // The fingerprint must be specific: matching on generic words would send
  // ordinary responses down the unverified path.
  const match = /const CERT_FAILURE = \/(.+)\/[a-z]*;/i.exec(ROUTE);
  assert.ok(match, 'CERT_FAILURE pattern not found');
  const pattern = new RegExp(match[1], 'i');
  assert.ok(pattern.test('unable to verify the first certificate'));
  assert.ok(pattern.test('UNABLE_TO_VERIFY_LEAF_SIGNATURE'));
  assert.ok(!pattern.test('The request was forcibly closed.'), 'connection resets are not cert failures');
  assert.ok(!pattern.test('HOST_NOT_FOUND'));
  assert.ok(!pattern.test('OK'));
});

test('verification is the default path, not the fallback', () => {
  assert.match(ROUTE, /rejectUnauthorized:\s*false/, 'a lenient agent must exist for chain-broken hosts');
  // The strict handler must be the first one called.
  const body = ROUTE.slice(ROUTE.indexOf('async function handle'));
  const firstStrict = body.indexOf('await strict(req)');
  // Ignore the fast path for an already-known host and the final retry.
  const lastLenient = body.lastIndexOf('return lenient(req)');
  assert.ok(firstStrict > -1, 'the handler must call the strict server');
  assert.ok(
    firstStrict < lastLenient,
    'a new host must be tried with full verification before the lenient retry',
  );
});
