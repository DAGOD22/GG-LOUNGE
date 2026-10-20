import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

/** Loads the service-worker ad blocker (plain JS) into a browser-like context. */
function loadAdblock() {
  const source = readFileSync('public/adblock.js', 'utf8');
  const sandbox: Record<string, unknown> = {
    URL,
    atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    Uint8Array,
    Response,
    Headers,
    Object,
    Math,
    JSON,
    console,
  };
  const context = createContext(sandbox);
  (sandbox as any).self = sandbox;
  runInContext(source, context);
  return (sandbox as any).GGAdblock;
}

const A = loadAdblock();
// The service worker always sees absolute request URLs.
const proxied = (target: string) => 'http://lounge.test/browse/' + encodeURIComponent(target);

test('ad blocker exposes a populated rule set', () => {
  assert.ok(A.hostCount > 80, `expected many ad hosts, got ${A.hostCount}`);
});

test('blocks well-known advertising and analytics hosts', () => {
  for (const target of [
    'https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-1',
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
    'https://www.googletagmanager.com/gtm.js?id=GTM-ABC',
    'https://www.google-analytics.com/analytics.js',
    'https://connect.facebook.net/en_US/fbevents.js',
    'https://analytics.tiktok.com/i18n/pixel/events.js',
    'https://static.criteo.net/js/ld/publishertag.js',
    'https://cdn.taboola.com/libtrc/x/loader.js',
    'https://simage2.pubmatic.com/AdServer/js/gshowad.js',
    'https://ads.pubmatic.com/AdServer/js/showad.js',
    'https://popads.net/js/ads.js',
    'https://cdn.hotjar.com/modules.abc.js',
    'https://api.mixpanel.com/track/?data=x',
    'https://c.clarity.ms/collect',
    'https://sb.scorecardresearch.com/beacon.js',
  ]) {
    assert.equal(A.isAd(proxied(target)), true, `should block ${target}`);
  }
});

test('blocks ad-shaped paths on otherwise ordinary hosts', () => {
  for (const target of [
    'https://example.com/pagead/js/adsbygoogle.js',
    'https://example.com/js/advertising.min.js',
    'https://example.com/__utm.gif?utm_source=x',
    'https://example.com/ads.txt',
    'https://example.com/assets/popunder.js',
    'https://example.com/beacon/collect?v=1&tid=UA-1',
  ]) {
    assert.equal(A.isAd(proxied(target)), true, `should block ${target}`);
  }
});

test('never blocks the site the user actually asked for', () => {
  for (const target of [
    'https://monkeytype.com/',
    'https://monkeytype.com/js/app.js',
    'https://monkeytype.com/css/style.css',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://en.wikipedia.org/wiki/Service_worker',
    'https://example.com/app/main.js',
    'https://example.com/api/user/profile',
  ]) {
    assert.equal(A.isAd(proxied(target)), false, `should allow ${target}`);
  }
});

test('ignores requests that are not proxied through /browse/', () => {
  for (const path of ['/games/cookie-clicker/index.html', '/api/health', '/proxy-runtime/scramjet/scramjet.all.js', '/tools', '/remote?url=https%3A%2F%2Fmonkeytype.com'])
    assert.equal(A.isAd('http://lounge.test' + path), false, path);
});

test('decodes the real destination out of a Scramjet URL', () => {
  assert.equal(A.decodeTarget(proxied('https://monkeytype.com/a b?x=1')), 'https://monkeytype.com/a b?x=1');
  assert.equal(A.decodeTarget('http://lounge.test/games/x/index.html'), null);
});

test('blocked responses keep a type the page can swallow', async () => {
  const image = A.emptyResponse({ destination: 'image' });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/gif');
  assert.ok((await image.arrayBuffer()).byteLength > 0, 'a real 1x1 gif is returned, not an error');

  const script = A.emptyResponse({ destination: 'script' });
  assert.match(script.headers.get('content-type') ?? '', /javascript/);
  assert.match(await script.text(), /blocked/);

  assert.equal(A.emptyResponse({ destination: 'video' }).status, 204);
  assert.equal(A.emptyResponse({ destination: 'font' }).status, 204);
});

test('cosmetic injection hides ad slots without corrupting the document', () => {
  const page = '<html><head><title>Keep me</title></head><body><p>Real content</p></body></html>';
  const patched = A.injectHtml(page);
  assert.match(patched, /<title>Keep me<\/title>/);
  assert.match(patched, /<p>Real content<\/p>/);
  assert.match(patched, /\[id\*="google_ads"\]/);
  assert.ok(patched.indexOf('<style data-gg-adblock="1">') < patched.indexOf('</head>'));
  // A document with no head still gets the layer.
  assert.match(A.injectHtml('<html><body>hi</body></html>'), /adblock/);
});

test('enabled state defaults off and can be toggled', () => {
  assert.equal(A.enabled(), false);
  A.setEnabled(true);
  assert.equal(A.enabled(), true);
  A.setEnabled(false);
  assert.equal(A.enabled(), false);
});
