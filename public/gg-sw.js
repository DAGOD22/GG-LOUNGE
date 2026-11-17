/* Scramjet owns ONLY /browse/. It must never intercept game files or Next.js. */
importScripts("/proxy-runtime/scramjet/scramjet.all.js");
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

/**
 * The controller hands its config to the worker by postMessage during init(),
 * which is a race: on a cold load the message can arrive before this worker is
 * listening, leaving `scramjet.config` undefined and every route throwing
 * "reading 'prefix'". The controller ALSO persists the same config into the
 * `$scramjet` IndexedDB, so read it from there as well and treat whichever
 * arrives first as authoritative.
 */
/**
 * The rewriter reads its prefix from module state set by the runtime's
 * setConfig(), not from `worker.config`. loadConfig() restores the object but
 * the fetch path still throws until setConfig() has run in THIS context.
 */
function applyRuntimeConfig(config) {
  if (!config) return;
  scramjet.config = config;
  const setConfig = globalThis.$scramjetSetConfig;
  if (typeof setConfig === 'function') setConfig(config);
}

async function ensureConfig() {
  if (scramjet.config) {
    applyRuntimeConfig(scramjet.config);
    return true;
  }
  try { await scramjet.loadConfig(); } catch { /* fall through to the DB */ }
  if (scramjet.config) { applyRuntimeConfig(scramjet.config); return true; }
  try {
    const stored = await new Promise((resolve, reject) => {
      const request = indexedDB.open('$scramjet', 1);
      request.onupgradeneeded = () => reject(new Error('schema missing'));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('config')) { db.close(); return reject(new Error('no config store')); }
        const get = db.transaction('config', 'readonly').objectStore('config').get('config');
        get.onsuccess = () => { db.close(); resolve(get.result); };
        get.onerror = () => { db.close(); reject(get.error); };
      };
    });
    if (stored && stored.prefix) applyRuntimeConfig(stored);
  } catch { /* the page-side message may still land */ }
  return Boolean(scramjet.config);
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data && event.data.scramjet$type === 'loadConfig' && event.data.config) applyRuntimeConfig(event.data.config);
});
self.addEventListener('fetch', event => {
  if (!new URL(event.request.url).pathname.startsWith('/browse/')) return;
  event.respondWith((async () => {
    try {
      if (!(await ensureConfig())) throw new Error('The proxy runtime configuration did not load. Reload the page.');
      return scramjet.route(event) ? await scramjet.fetch(event) : fetch(event.request);
    } catch (error) {
      self.__gglogs = self.__gglogs || [];
      self.__gglogs.push(String(error && error.stack || error).slice(0, 900));
      console.error('[gg-sw] proxy error:', error && error.stack ? error.stack : error);
      // A useful, non-success HTTP response; never an apparently working blank frame.
      const message = String(error?.message || error).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Proxy connection failed</title></head><body style="font:16px system-ui;padding:32px;background:#111;color:#eee"><h1>Proxy connection failed</h1><p>${message}</p><p>Check the lounge connection status. Video, WebSockets and cloud games need a working Wisp backend; a school network or the destination can still block access.</p><button onclick="location.reload()">Retry</button></body></html>`, { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  })());
});
