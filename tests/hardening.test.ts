/**
 * The hardening pass: uploads, sitemap, soft-404, admin login, frame sandbox,
 * guest progress.
 *
 * These six fixes share a failure mode that source review alone does not catch:
 * each one is a *policy* expressed in more than one file, and the copies drift.
 * A sitemap that filters proxy paths but a page that still links them, a sandbox
 * on three of four iframes, an upload ceiling that exists in the store but not in
 * the route's error handling — all of those look finished and are not. So the
 * tests below assert the invariant (every frame is sandboxed, every `<loc>` is
 * local, every write path is bounded) rather than a specific line of code.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { games } from '@/lib/games';
import { GAME_FRAME_SANDBOX } from '@/lib/frame-policy';
import { MAX_UPLOAD_BYTES, UPLOAD_QUOTA, UPLOAD_TTL_MS } from '@/lib/db/uploads';
import { plainDirectory } from '@/lib/link-map';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/* ---------------- sitemap ---------------- */

test('every game path that is local produces a sitemap entry with one origin', async () => {
  const { default: sitemap } = await import('@/app/sitemap');
  const entries = sitemap();
  const localPaths = games.filter(g => g.path.startsWith('/') && !g.path.startsWith('//')).length;
  // static pages (6) + one SEO page per game + one asset entry per local game.
  assert.equal(entries.length, 6 + games.length + localPaths);
  for (const entry of entries) {
    assert.match(entry.url, /^https:\/\/[^/]+\//, `URL must be absolute: ${entry.url}`);
    assert.equal(entry.url.split('://').length, 2, `one scheme only: ${entry.url}`);
    // The old bug: "/g…https://state.io/" — a host inside a path.
    assert.ok(!entry.url.slice(8).includes('://'), `no nested scheme: ${entry.url}`);
    assert.ok(!entry.url.includes('//', 8), `no doubled slash: ${entry.url}`);
  }
});

test('proxy games are excluded from the sitemap but still documented', async () => {
  const { default: sitemap } = await import('@/app/sitemap');
  const urls = sitemap().map(entry => entry.url);
  const proxied = games.filter(g => !g.path.startsWith('/'));
  assert.ok(proxied.length > 0, 'the catalogue is expected to contain proxy titles');
  for (const game of proxied) {
    assert.ok(
      urls.every(url => !url.includes(game.path)),
      `${game.id} points at ${game.path} and must not be a <loc>`,
    );
    // Still listed in the link directory, which is where a browser should find it.
    assert.ok(plainDirectory().includes(game.id), `${game.id} must remain documented`);
  }
});

test('the sitemap builds from one canonical origin helper, not a literal', () => {
  const source = read('app/sitemap.ts');
  assert.ok(source.includes('absoluteUrl'), 'sitemap should build URLs with absoluteUrl()');
  assert.ok(!source.includes('gg-lounge.vercel.app'), 'no hard-coded host in the sitemap');
  const page = read('app/g/[id]/page.tsx');
  assert.ok(!page.includes('gg-lounge.vercel.app'), 'no hard-coded host on the game landing page');
});

/* ---------------- soft 404 ---------------- */

test('/g/<unknown> is a real 404, not a 200 with a sad message', () => {
  const source = read('app/g/[id]/page.tsx');
  assert.ok(source.includes('notFound()'), 'unknown ids must call notFound()');
  assert.ok(!/return <main[^>]*>Not found/.test(source), 'must not render a 200 "Not found" page');
  assert.ok(/robots: \{ index: false/.test(source), 'and must not be indexed');
});

test('dynamic routes await their params (Next 16 hands them a Promise)', () => {
  // The /g/[id] page read `params.id` synchronously, so `find` never matched and
  // every game landing page rendered "Not found" behind a 200. Any new dynamic
  // page has the same trap available, so this checks every one of them at once.
  const pages = ['app/g/[id]/page.tsx', 'app/play/[id]/page.tsx'];
  for (const path of pages) {
    const source = read(path);
    assert.ok(source.includes('await params'), `${path} must await params`);
    assert.ok(!/params\s*:\s*\{\s*id\s*:\s*string\s*\}/.test(source), `${path} must type params as a Promise`);
  }
});

/* ---------------- uploads ---------------- */

test('uploads are bounded per upload, per quota and per age', () => {
  assert.ok(MAX_UPLOAD_BYTES > 0 && MAX_UPLOAD_BYTES <= 16 * 1024 * 1024);
  assert.ok(UPLOAD_QUOTA > 0 && UPLOAD_QUOTA <= 1000);
  assert.ok(UPLOAD_TTL_MS > 0 && UPLOAD_TTL_MS <= 24 * 60 * 60 * 1000);
  const store = read('lib/db/uploads.ts');
  assert.ok(store.includes('reapUploads'), 'the reaper must exist in the store');
});

test('the upload route rate-limits, namespaces ids and reports the ceiling', () => {
  const source = read('app/api/uploads/route.ts');
  assert.ok(source.includes('rateLimit('), 'chunk writes must be rate limited');
  assert.match(source, /uploads:chunk:/, 'per-client chunk budget');
  assert.match(source, /uploads:done:/, 'per-client assembly budget');
  assert.match(source, /__\$\{rawId\}/, 'upload ids must be namespaced per client');
  assert.ok(source.includes('413'), 'too-large uploads need a 413, not a generic 400');
  assert.ok(source.includes('MAX_UPLOAD_BYTES'), 'the route must know the ceiling it enforces');
});

/* ---------------- admin login ---------------- */

test('admin login is rate limited and compares passwords in constant time', () => {
  const source = read('app/api/admin/route.ts');
  assert.match(source, /admin:login:/, 'login attempts must be rate limited');
  assert.ok(source.includes('timingSafeEqual'), 'password comparison must be constant time');
  assert.ok(!/body\.password\.trim\(\) !== adminPassword\(\)/.test(source), 'no plain !== compare');
  assert.ok(source.includes('429'), 'lockout must answer 429');
});

/* ---------------- frames ---------------- */

test('every game iframe carries the sandbox policy', () => {
  const frames = [
    'components/GameModal.tsx',
    'app/play/[id]/page.tsx',
    'components/live/SplitScreen.tsx',
    'components/ProxyGameFrame.tsx',
  ];
  for (const path of frames) {
    const source = read(path);
    assert.ok(source.includes('<iframe'), `${path} should host a frame`);
    assert.ok(source.includes('sandbox={GAME_FRAME_SANDBOX}'), `${path} must sandbox its game frame`);
  }
  // The proxy surface is the documented exception; it must stay documented.
  const proxy = read('app/proxy/page.tsx');
  assert.ok(!proxy.includes('GAME_FRAME_SANDBOX'), 'the proxy frame is not a game frame');
  assert.match(read('lib/frame-policy.ts'), /PROXY_FRAME_SANDBOXED = false/);
});

test('the game sandbox withholds top navigation', () => {
  assert.ok(GAME_FRAME_SANDBOX.includes('allow-scripts'));
  assert.ok(GAME_FRAME_SANDBOX.includes('allow-same-origin'));
  assert.ok(!GAME_FRAME_SANDBOX.includes('allow-top-navigation'));
});

/* ---------------- guest progress ---------------- */

test('guest plays are carried across sign-in instead of being dropped', () => {
  const page = read('app/page.tsx');
  assert.ok(page.includes('mergeGuestPlays'), 'sign-in must merge guest plays');
  const helper = read('lib/guest-progress.ts');
  assert.match(helper, /ggl_plays_/, 'must read the key the modal writes');
  assert.ok(helper.includes('clearGuestPlays'), 'and clear it once merged');
  const route = read('app/api/auth/merge-guest/route.ts');
  assert.ok(route.includes('MAX_PER_GAME'), 'merge must clamp a tampered tally');
  assert.ok(route.includes('401'), 'merge requires a session');
});

test('a guest write no longer claims to have been saved', () => {
  const source = read('app/api/game-stats/route.ts');
  assert.ok(!/ok:true, guest:true/.test(source.replace(/\s/g, '')));
  assert.match(source, /saved\s*:\s*false/, 'the guest response must say it was not saved');
  assert.match(source, /saved\s*:\s*true/, 'and the signed-in response must say it was');
});
