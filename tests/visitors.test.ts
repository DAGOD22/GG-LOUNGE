/**
 * The real visitor counter.
 *
 * The LED counter used to increment a number in its own browser's localStorage
 * — it counted nobody but itself. These tests pin the honest version: one
 * anonymous cookie per visitor, one row per visitor in shared storage, and a
 * hit total that belongs to the whole site rather than to a tab.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanVisitorId, recordVisit, visitorStats } from '../lib/db/visitors';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

test('visitors: an id we did not issue is not stored', () => {
  assert.equal(cleanVisitorId('drop table; --'), null);
  assert.equal(cleanVisitorId(''), null);
  assert.equal(cleanVisitorId(42), null);
  assert.equal(cleanVisitorId('definitely-not-a-uuid-because-of-underscores_x'), null);
  assert.ok(cleanVisitorId('3f9c24e2-8a71-4b6e-9c1d-0a5f7e2b9d11'), 'a proper uuid passes');
});

test('visitors: the same visitor counts once, the visits count always', async () => {
  // The local store persists across runs, so every id this test uses is
  // unique to this run — the assertions must hold on a busy counter, not
  // just on a fresh one.
  const run = `visitor-test-${Date.now()}`;
  const firstVisit = await recordVisit(`${run}-a`);
  const returnVisit = await recordVisit(`${run}-a`);
  // The same id again: still one visitor, but the visit was counted.
  assert.equal(returnVisit.visitors, firstVisit.visitors, 'a returning visitor is still one visitor');
  assert.equal(returnVisit.hits, firstVisit.hits + 1, 'the hit total grows with every visit');
  // A different id is a different person.
  const secondVisit = await recordVisit(`${run}-b`);
  assert.equal(secondVisit.visitors, firstVisit.visitors + 1, 'distinct ids are distinct visitors');
});

test('visitors: the stats read the same store the counting writes', async () => {
  const before = await visitorStats();
  const after = await recordVisit('visitor-test-stats');
  assert.equal(after.hits, before.hits + 1);
  assert.ok(after.visitors >= before.visitors);
});

test('visitors: the endpoint counts anonymously and never caches', () => {
  const route = read('app/api/visits/route.ts');
  // Anonymous: no auth, no session — the cookie is issued by the server and
  // carries nothing but a random id.
  assert.match(route, /gg_vid/);
  assert.doesNotMatch(route, /isChatverseMember|getUserFromToken/);
  assert.match(route, /force-dynamic/, 'a cached visitor count would show everyone the same number');
  assert.match(route, /maxAge/, 'the id must survive long enough to be "across visits"');
  assert.match(route, /status: 503/, 'a storage failure answers in JSON, not as a silent HTML 500');
  // Every table the counter touches is in the schema the health check expects.
  const tables = read('lib/db/schema-check.ts');
  assert.match(tables, /site_visitor/);
  assert.match(tables, /site_hit/);
  const schema = read('lib/db/connection.ts');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "site_visitor"/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "site_hit"/);
});

test('visitors: the counter strip covers nothing and reports the real total', () => {
  const component = read('components/live/secrets/Particles.tsx');
  // Once per browser session, not once per render — refreshes do not spam the
  // count, but every new session is counted.
  assert.match(component, /sessionStorage/);
  assert.match(component, /gg_counted/);
  assert.match(component, /\/api\/visits/);
  // The strip takes space the content flows around, so nothing is covered.
  const css = read('app/globals.css');
  assert.match(css, /gg-counter-live body/);
  assert.match(css, /padding-bottom: 30px/);
  assert.match(css, /\.gg-counter-bar \{/);
});
