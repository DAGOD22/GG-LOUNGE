import { Readable, PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Preserve Bare's JSON headers and stream with Node backpressure. In particular,
 * never truncate x-bare-headers (breaks cookies/range/video), override .end(), or
 * construct a Response with a body for HEAD/204/304. WebSockets use Wisp. */
export function createBareHandler(bare: { routeRequest: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) {
return async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  // The browser-facing adapter is intentionally same-origin for proxy control,
  // but proxied game/video responses need permissive CORS for CDN-style assets.
  // OPTIONS is answered locally so engines can preflight before their first
  // texture/audio request.
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Content-Type, Accept-Ranges, ETag, Last-Modified',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Cache-Control': 'no-store' } });
  if (origin && origin !== url.origin && origin !== `https://${req.headers.get('host')}`) return Response.json({ error: 'Cross-origin proxy use is not allowed.', ...cors }, { status: 403 });
  let pathname = url.pathname.replace(/^\/api\/(bare|edu|learn|t|math|science|history|english)(?=\/|$)/, '/api/bare');
  pathname = pathname.replace(/^(\/api\/bare(?:\/v[123])?)$/, '$1/');
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.body;
  const incoming = Object.assign(hasBody ? Readable.fromWeb(req.body as never) : Readable.from([]), {
    url: pathname + url.search, method: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    socket: { remoteAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown' },
    aborted: false,
  });
  const outgoing = new PassThrough({ highWaterMark: 64 * 1024 });
  // Observe errors even when a bodyless response has no stream consumer.
  incoming.on('error', () => {});
  outgoing.on('error', () => {});
  return new Promise(resolve => {
    let resolved = false;
    let finished = false;
    const responseHeaders = new Headers();
    const timer = setTimeout(() => fail(504, 'The upstream connection timed out.'), 55000);
    function cleanup() { if (finished) return; finished = true; clearTimeout(timer); req.signal.removeEventListener('abort', abort); }
    function abort() { incoming.aborted = true; fail(499, 'The client disconnected.'); }
    function fail(status: number, message: string) {
      if (!resolved) { resolved = true; resolve(Response.json({ code: 'PROXY_ERROR', message }, { status, headers: { 'Cache-Control': 'no-store' } })); }
      outgoing.destroy(new Error(message)); incoming.destroy(); cleanup();
    }
    const response = Object.assign(outgoing, {
      setHeader(name: string, value: string | string[]) { responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value)); return response; },
      getHeader(name: string) { return responseHeaders.get(name); },
      writeHead(status: number, textOrHeaders?: string | Record<string,string>, headers?: Record<string,string>) {
        if (resolved) return response;
        try {
          const raw = typeof textOrHeaders === 'string' ? headers : textOrHeaders;
          for (const [key, value] of Object.entries(raw || {})) {
            if (value != null && !['connection','transfer-encoding','keep-alive'].includes(key.toLowerCase())) responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value));
          }
          // Stream bytes without a transport Content-Length. The upstream length
          // is preserved untouched inside Bare's x-bare-headers JSON.
          // Range is already present in incoming.headers and Bare forwards it
          // verbatim. Do not normalize or drop 206/Content-Range: media players
          // use these values to request the next byte window.
          responseHeaders.delete('content-length');
          responseHeaders.set('Cache-Control', 'no-store');
          for (const [key, value] of Object.entries(cors)) responseHeaders.set(key, value);
          const bodyless = req.method === 'HEAD' || [204, 205, 304].includes(status);
          const body = bodyless ? null : Readable.toWeb(outgoing) as ReadableStream<Uint8Array>;
          if (bodyless) outgoing.resume();
          const webResponse = new Response(body, { status, headers: responseHeaders });
          resolved = true; resolve(webResponse);
        } catch { fail(502, 'The upstream returned invalid HTTP headers.'); }
        return response;
      },
    });
    outgoing.once('finish', () => { if (!resolved) fail(502, 'The upstream ended without a response.'); else cleanup(); });
    outgoing.once('error', error => fail(502, error.message));
    req.signal.addEventListener('abort', abort, { once: true });
    if (req.signal.aborted) { abort(); return; }
    bare.routeRequest(incoming as unknown as IncomingMessage, response as unknown as ServerResponse).catch(() => fail(502, 'The upstream proxy request failed.'));
  });
};
}
