/* Scramjet owns ONLY /browse/. It must never intercept game files or Next.js. */
importScripts('/proxy-runtime/scramjet/scramjet.all.js');
importScripts('/adblock.js');

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const SAFE_ERROR_CODES = new Set([
  'Error', 'TypeError', 'NetworkError', 'AbortError', 'TimeoutError', 'SecurityError',
  'SyntaxError', 'InvalidStateError', 'NotSupportedError', 'URIError',
]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const SAFE_REQUEST_TYPES = new Set([
  'document', 'iframe', 'script', 'style', 'image', 'font', 'audio', 'video', 'track',
  'worker', 'sharedworker', 'empty', 'fetch', 'other',
]);

let diagnosticsEnabled = false;
let transportMode = 'scramjet';
let blockedCount = 0;
let failureSequence = 0;

function safeErrorCode(error) {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : 'Error';
  return SAFE_ERROR_CODES.has(name) ? name : 'Error';
}

function requestType(request) {
  const destination = request?.destination || 'fetch';
  return SAFE_REQUEST_TYPES.has(destination) ? destination : 'other';
}

/* No URL, query, headers, body, cookie, exception message or stack is emitted. */
async function reportDiagnostic(event, stage, details) {
  if (!diagnosticsEnabled) return;
  const safe = { ggLounge: 'proxy-diagnostic', source: 'service-worker', stage };
  if (details && Number.isInteger(details.status) && details.status >= 0 && details.status <= 599) safe.status = details.status;
  if (details && Number.isInteger(details.requestId) && details.requestId >= 0) safe.requestId = details.requestId;
  if (details && ['scramjet', 'wisp', 'http'].includes(details.transport)) safe.transport = details.transport;
  else safe.transport = transportMode;
  if (details && SAFE_ERROR_CODES.has(details.code)) safe.code = details.code;
  if (details && SAFE_METHODS.has(details.method)) safe.method = details.method;
  if (details && SAFE_REQUEST_TYPES.has(details.requestType)) safe.requestType = details.requestType;
  if (details && ['ok', 'failed', 'blocked'].includes(details.outcome)) safe.outcome = details.outcome;

  console.info('[GG-Lounge proxy]', {
    source: safe.source, stage: safe.stage, outcome: safe.outcome,
    transport: safe.transport, status: safe.status, requestId: safe.requestId, code: safe.code,
    method: safe.method, requestType: safe.requestType,
  });
  try {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) client.postMessage(safe);
  } catch { /* diagnostics must never interrupt the proxied request */ }
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/* The page sends ad-block and diagnostics settings without storing site data. */
self.addEventListener('message', event => {
  const data = event.data;
  if (data && data.ggLounge === 'adblock' && typeof data.enabled === 'boolean') {
    self.GGAdblock.setEnabled(data.enabled);
  }
  if (data && data.ggLounge === 'diagnostics' && typeof data.enabled === 'boolean') {
    diagnosticsEnabled = data.enabled;
    if (['scramjet', 'wisp', 'http'].includes(data.transport)) transportMode = data.transport;
  }
});

self.addEventListener('error', event => {
  void reportDiagnostic(null, 'worker.error', { outcome: 'failed', code: safeErrorCode(event.error) });
});
self.addEventListener('unhandledrejection', event => {
  void reportDiagnostic(null, 'worker.unhandled-rejection', { outcome: 'failed', code: safeErrorCode(event.reason) });
});

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
    void reportDiagnostic(event, 'request.blocked', {
      outcome: 'blocked', status: 200, method: event.request.method, requestType: requestType(event.request),
    });
    event.respondWith(self.GGAdblock.emptyResponse(event.request));
    return;
  }

  event.respondWith((async () => {
    try {
      await scramjet.loadConfig();
      const response = scramjet.route(event) ? await scramjet.fetch(event) : await fetch(event.request);
      if (response && response.status >= 400) {
        await reportDiagnostic(event, 'response.http-error', {
          outcome: 'failed', status: response.status, method: event.request.method, requestType: requestType(event.request),
        });
      }

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
      // Return an actionable status and reference only; never echo a URL, token,
      // cookie, request header, exception message or stack into the proxied page.
      const requestId = ++failureSequence;
      await reportDiagnostic(event, 'request.failed', {
        outcome: 'failed', status: 502, requestId, code: safeErrorCode(error),
        method: event.request.method, requestType: requestType(event.request),
      });
      const reference = `SJ-${requestId}`;
      return new Response(
        `<!doctype html><html><head><meta charset="utf-8"><title>Proxy connection failed</title></head><body style="font:16px system-ui;padding:32px;background:#111;color:#eee"><h1>Proxy connection failed</h1><p>Scramjet could not complete this request (HTTP 502). Reference ${reference}.</p><p>Check the lounge transport status and browser console. A Wisp backend is required for WebSockets and realtime traffic; a school network or destination can still block access.</p><button onclick="location.reload()">Retry</button></body></html>`,
        { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
      );
    }
  })());
});
