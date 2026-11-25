/**
 * The proxy's service worker, and the reason it kept "failing to install".
 *
 * A scope holds exactly one service worker registration. This site had two
 * — `/uv/uv.sw.js` for the proxy and `/gg-app-sw.js` for the offline shell —
 * both registering at `/`. Whichever installed second replaced the first, and
 * the replaced worker went to `state === 'redundant'`, which the proxy page
 * reported as "Proxy worker installation failed". Worse, when the *proxy*
 * worker was the one replaced, nothing controlled `/service/…`, so a proxied
 * navigation fell through to Next.js, hit the old /service redirect, and put
 * the user back on GG-Lounge.
 *
 * These tests are narrow on purpose: they assert the invariants that made that
 * bug possible, not the internals of Ultraviolet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

test('exactly one component registers a service worker, and it is not the app shell', () => {
  const sources = [
    'app/global-sw.tsx',
    'lib/proxy-client.ts',
    'components/GlobalSW.tsx',
  ].filter(file => existsSync(path.join(ROOT, file)));

  const registered = sources.filter(file =>
    /serviceWorker\.register\(\s*['"]/.test(read(file)),
  );
  assert.deepEqual(registered, ['lib/proxy-client.ts'], 'only the proxy may register a worker');

  // The standalone offline worker is gone; its behaviour lives inside the proxy
  // worker, which is the only way both features can coexist at one scope.
  assert.equal(existsSync(path.join(ROOT, 'public/gg-app-sw.js')), false);
  assert.doesNotMatch(read('app/global-sw.tsx'), /serviceWorker\.register/);
});

test('the proxy worker also owns the offline shell', () => {
  const sw = read('public/uv/uv.sw.js');
  // Proxied traffic goes to Ultraviolet…
  assert.match(sw, /if \(proxied\(event\)\) \{\s*\n\s*event\.respondWith\(sw\.fetch\(event\)\)/);
  // …and everything else to the cache, with the offline fallbacks intact.
  assert.match(sw, /ggl-app-v2/);
  assert.match(sw, /offline\.html/);
  // Two fetch handlers both calling respondWith is how a request gets answered
  // twice, which throws and kills the page. There must be exactly one listener.
  assert.equal((sw.match(/self\.addEventListener\('fetch'/g) || []).length, 1);
});

test('the worker never unregisters itself before it registers', () => {
  const client = read('lib/proxy-client.ts');
  const unregisterBlock = client.slice(client.indexOf('const existing = await navigator.serviceWorker.getRegistrations()'));
  const before = unregisterBlock.slice(0, unregisterBlock.indexOf('/**'));
  // The old filter matched /uv/uv.sw.js, so boot unregistered the very worker
  // it was about to register — and lost the race with its own install.
  assert.doesNotMatch(before, /uv\\\.sw\\\.js\$/, 'the proxy worker must not match its own cleanup filter');
  assert.doesNotMatch(before, /\/service\/uv\.sw\.js', \s*$/);
});

test('the Ultraviolet config is a constant, not a per-visitor route', () => {
  const route = read('app/uv/uv.config.js/route.ts');
  assert.match(route, /force-static/, 'a dynamic config can fail an install');
  assert.doesNotMatch(route, /cookies\(\)/, 'the config must not depend on the request');
  // The keys Ultraviolet actually reads.
  for (const key of ['prefix', 'bare', 'encodeUrl', 'decodeUrl', 'handler', 'bundle', 'config', 'sw']) {
    assert.match(route, new RegExp(`${key}:`), `config must define ${key}`);
  }
  assert.match(route, /prefix: "\/service\/"/);
  assert.match(route, /bare: "\/api\/bare\/"/);
});

test('/service/ explains itself instead of bouncing to the lounge', () => {
  const page = read('app/service/[[...path]]/page.tsx');
  // The old page called location.replace('/proxy'), which destroyed the
  // evidence and looked exactly like "the proxy redirects me to GG-Lounge".
  // Comments are stripped first so the explanation of the old bug is not the
  // thing the assertion trips over.
  const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /location\.replace/);
  assert.doesNotMatch(page, /['"]use client['"]/);
  // It still has to be able to offer "try again" for the decoded destination.
  assert.match(page, /decodeXor/);
  assert.match(page, /\/proxy\?url=/);
});

test('the transport probe opens a WebSocket instead of trusting a JSON body', () => {
  const client = read('lib/proxy-client.ts');
  const probe = client.slice(client.indexOf('function wispAvailable'));
  assert.match(probe.slice(0, 2000), /new WebSocket\(/);
  // Fetching /api/wisp returns 200 JSON on any host, including the serverless
  // one where no upgrade is possible — that false positive is the bug.
  assert.doesNotMatch(probe.slice(0, 2000), /await fetch\('\/api\/wisp'/);
});
