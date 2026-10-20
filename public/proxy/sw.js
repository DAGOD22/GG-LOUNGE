/* Scramjet owns ONLY /browse/. It must never intercept game files or Next.js. */
importScripts('/proxy-runtime/scramjet/scramjet.all.js');
importScripts('/adblock.js');

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/* The page tells us whether the ad blocker is on (Settings → Customize, or the
 * toggle on the proxy page). postMessage is instant; the cookie set alongside it
 * keeps the value across service-worker restarts. */
self.addEventListener('message', event => {
  const data = event.data;
  if (data && data.ggLounge === 'adblock' && typeof data.enabled === 'boolean') {
    self.GGAdblock.setEnabled(data.enabled);
  }
});

/* Count of requests dropped since this worker started — shown in the UI. */
let blockedCount = 0;

function isHtml(response) {
  const type = response.headers.get('content-type') || '';
  return /text\/html/i.test(type);
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/browse/')) return;

  /* Ad blocking runs before Scramjet so blocked requests never leave the browser. */
  if (self.GGAdblock && self.GGAdblock.enabled() && self.GGAdblock.isAd(event.request.url)) {
    blockedCount += 1;
    event.respondWith(self.GGAdblock.emptyResponse(event.request));
    return;
  }

  event.respondWith((async () => {
    try {
      await scramjet.loadConfig();
      const response = scramjet.route(event) ? await scramjet.fetch(event) : await fetch(event.request);

      /* Cosmetic pass: collapse the empty boxes that blocked ads leave behind. */
      if (self.GGAdblock && self.GGAdblock.enabled() && response && response.ok && isHtml(response)) {
        try {
          const html = await response.text();
          const patched = self.GGAdblock.injectHtml(html);
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.set('x-gg-lounge-adblock', String(blockedCount));
          return new Response(patched, { status: response.status, statusText: response.statusText, headers });
        } catch {
          return response;   // never break a page just to hide an ad box
        }
      }
      return response;
    } catch (error) {
      // A useful, non-success HTTP response; never an apparently working blank frame.
      const message = String(error?.message || error).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Proxy connection failed</title></head><body style="font:16px system-ui;padding:32px;background:#111;color:#eee"><h1>Proxy connection failed</h1><p>${message}</p><p>Check the lounge connection status. Video, WebSockets and cloud games need a working Wisp backend; a school network or the destination can still block access.</p><button onclick="location.reload()">Retry</button></body></html>`, { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  })());
});
