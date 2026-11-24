/*
 * GG-Lounge's own service worker.
 *
 * This is NOT the proxy worker (`/gg-sw.js` owns Scramjet and /browse/). This
 * one exists so the installed app is useful offline: the shell, the game icons
 * and the games a person actually plays are cached, and everything else falls
 * back to /offline.html instead of the browser's dinosaur.
 *
 * Three rules keep it from becoming a liability:
 *
 *   · Never cache an API response. Presence, saves and auth are all live data,
 *     and a stale save is worse than no save.
 *   · Never touch /browse/, /proxy/, /service/ or /apps/ — the proxy has its own
 *     worker with its own rules, and two workers fighting over a request is how
 *     a proxy breaks in a way nobody can debug.
 *   · Network-first for navigations. The cache is a fallback, not the source of
 *     truth, so a deploy is visible on the next load.
 */

const VERSION = 'ggl-app-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const GAMES = `${VERSION}-games`;

const SHELL_FILES = ['/', '/offline.html', '/manifest.json', '/icon.svg', '/apple-icon.png'];
const MAX_GAME_ENTRIES = 120;

/** Paths another worker owns, or that must never be served from a cache. */
const HANDS_OFF = ['/browse/', '/proxy/', '/service/', '/apps/', '/api/', '/uv/', '/_next/', '/gg-sw.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Individually, so one 404 cannot fail the whole install and leave the
      // site with no worker at all.
      await Promise.all(SHELL_FILES.map(file => cache.add(file).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(name => name.startsWith('ggl-app-') && !name.startsWith(VERSION))
          .map(name => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isHandsOff(url) {
  return HANDS_OFF.some(prefix => url.pathname.startsWith(prefix));
}

/** Only same-origin, only GET. */
function cacheable(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && !isHandsOff(url);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (!cacheable(request)) return;

  const url = new URL(request.url);

  // Navigations: network first, cache second, offline page last.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put(request, response.clone()).catch(() => {});
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match('/');
          if (shell) return shell;
          return (await caches.match('/offline.html')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Game files and icons: cache first, because they are immutable and are the
  // difference between an installed app that opens instantly and one that
  // stares at a spinner on a school network.
  if (url.pathname.startsWith('/games/') || url.pathname.startsWith('/game-icons/') || url.pathname.startsWith('/app-frames/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(GAMES);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            // Bound the cache: a 254-game catalogue would otherwise fill the
            // quota and get the whole origin evicted.
            const keys = await cache.keys();
            if (keys.length >= MAX_GAME_ENTRIES) await cache.delete(keys[0]);
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        } catch {
          return new Response('', { status: 504, statusText: 'Offline' });
        }
      })(),
    );
    return;
  }

  // Everything else cacheable: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSETS);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response.clone()).catch(() => {});
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});

/**
 * The page can ask for a game to be kept offline, which is what makes the
 * "download for offline" affordance honest rather than decorative.
 */
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'ggl-precache' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(GAMES);
      let stored = 0;
      for (const raw of data.urls.slice(0, 40)) {
        try {
          const url = new URL(raw, self.location.origin);
          if (url.origin !== self.location.origin) continue;
          const response = await fetch(url);
          if (!response.ok) continue;
          await cache.put(url.href, response);
          stored++;
        } catch {
          /* skip this one, keep going */
        }
      }
      const client = event.source;
      if (client && typeof client.postMessage === 'function') {
        client.postMessage({ type: 'ggl-precached', stored });
      }
    })(),
  );
});
