/* Scramjet owns ONLY /browse/. It must never intercept game files or Next.js. */
importScripts('/proxy-runtime/scramjet/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (!new URL(event.request.url).pathname.startsWith('/browse/')) return;
  event.respondWith((async () => {
    try {
      await scramjet.loadConfig();
      return scramjet.route(event) ? await scramjet.fetch(event) : fetch(event.request);
    } catch (error) {
      // A useful, non-success HTTP response; never an apparently working blank frame.
      const message = String(error?.message || error).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Proxy connection failed</title></head><body style="font:16px system-ui;padding:32px;background:#111;color:#eee"><h1>Proxy connection failed</h1><p>${message}</p><p>Check the lounge connection status. Video, WebSockets and cloud games need a working Wisp backend; a school network or the destination can still block access.</p><button onclick="location.reload()">Retry</button></body></html>`, { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  })());
});
