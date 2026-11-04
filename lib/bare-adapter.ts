import { Readable, PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

const BARE_STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  408: 'Request Timeout', 413: 'Payload Too Large', 429: 'Too Many Requests',
  499: 'Client Closed Request', 500: 'Internal Server Error', 502: 'Bad Gateway',
  503: 'Service Unavailable', 504: 'Gateway Timeout',
};

function bareProtocolError(status: number, message: string, cors: Record<string, string>): Response {
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
  const bareHeaders = {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  };
  const headers = new Headers({
    ...cors,
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'x-bare-status': String(safeStatus),
    'x-bare-status-text': BARE_STATUS_TEXT[safeStatus] || 'Proxy Error',
    'x-bare-headers': JSON.stringify(bareHeaders),
  });
  // Bare v3 transports destination status in x-bare-status. Keep the outer
  // transport response 200 so gateways do not replace a valid Bare response
  // with an HTML error document that BareClient then tries to parse as JSON.
  return new Response(message, { status: 200, headers });
}

function isSameAppOrigin(req: Request, requestUrl: URL, origin: string, trustProxyHeaders: boolean): boolean {
  try {
    const originUrl = new URL(origin);
    if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.origin !== origin) return false;
    if (origin === requestUrl.origin) return true;

    const forwardedHost = trustProxyHeaders ? req.headers.get('x-forwarded-host')?.split(',')[0].trim() : undefined;
    const host = forwardedHost || req.headers.get('host') || requestUrl.host;
    if (originUrl.host.toLowerCase() !== host.toLowerCase()) return false;

    const forwardedProto = trustProxyHeaders ? req.headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase() : undefined;
    return !forwardedProto || originUrl.protocol === `${forwardedProto}:`;
  } catch {
    return false;
  }
}

/** Preserve Bare's JSON headers and stream with Node backpressure. In particular,
 * never truncate x-bare-headers (breaks cookies/range/video), override .end(), or
 * construct a Response with a body for HEAD/204/304. WebSockets use Wisp. */
export function createBareHandler(
  bare: { routeRequest: (req: IncomingMessage, res: ServerResponse) => Promise<void> },
  options: { requestTimeoutMs?: number } = {},
) {
const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) && (options.requestTimeoutMs ?? 0) > 0
  ? options.requestTimeoutMs!
  : 55_000;
return async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  // Never let an arbitrary caller spoof the same-origin check with forwarded
  // headers. Production Node hosts must opt in only behind a sanitizing proxy.
  const trustProxyHeaders = process.env.NODE_ENV !== 'production'
    || process.env.VERCEL === '1'
    || process.env.TRUST_PROXY_HEADERS === '1';
  // The browser-facing adapter is intentionally same-origin for proxy control,
  // but proxied game/video responses need permissive CORS for CDN-style assets.
  // OPTIONS is answered locally so engines can preflight before their first
  // texture/audio request.
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Content-Type, Accept-Ranges, ETag, Last-Modified',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Cache-Control': 'no-store' } });
  if (origin && !isSameAppOrigin(req, url, origin, trustProxyHeaders)) return Response.json({ error: 'Cross-origin proxy use is not allowed.', ...cors }, { status: 403 });
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
    const timer = setTimeout(() => fail(504, 'The upstream connection timed out.'), requestTimeoutMs);
    function cleanup() { if (finished) return; finished = true; clearTimeout(timer); req.signal.removeEventListener('abort', abort); }
    function abort() { incoming.aborted = true; fail(499, 'The client disconnected.'); }
    function fail(status: number, message: string) {
      if (!resolved) { resolved = true; resolve(bareProtocolError(status, message, cors)); }
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
          // Bare's own protocol errors can contain exception text and stacks.
          // Convert them into a valid Bare v3 response, not an outer 4xx/5xx:
          // gateways can replace non-2xx responses with HTML error pages, which
          // makes BareClient's response.json() fail with "Unexpected token '<'".
          if (status >= 400 && !responseHeaders.has('x-bare-status')) {
            const safeStatus = status >= 500 ? 502 : status;
            const safeMessage = status === 404
              ? 'The Bare route was not found.'
              : 'The Bare HTTP proxy could not complete this request.';
            resolved = true;
            resolve(bareProtocolError(safeStatus, safeMessage, cors));
            outgoing.resume();
            return response;
          }
          const bodyless = req.method === 'HEAD' || [204, 205, 304].includes(status);
          const body = bodyless ? null : Readable.toWeb(outgoing) as ReadableStream<Uint8Array>;
          if (bodyless) outgoing.resume();
          // Upstream status is carried in x-bare-status; only the Bare transport
          // envelope itself should use an outer 2xx status.
          const transportStatus = responseHeaders.has('x-bare-status') ? 200 : status;
          const webResponse = new Response(body, { status: transportStatus, headers: responseHeaders });
          resolved = true; resolve(webResponse);
        } catch { fail(502, 'The upstream returned invalid HTTP headers.'); }
        return response;
      },
    });
    outgoing.once('finish', () => { if (!resolved) fail(502, 'The upstream ended without a response.'); else cleanup(); });
    outgoing.once('error', () => fail(502, 'The upstream proxy stream failed.'));
    req.signal.addEventListener('abort', abort, { once: true });
    if (req.signal.aborted) { abort(); return; }
    bare.routeRequest(incoming as unknown as IncomingMessage, response as unknown as ServerResponse).catch(() => fail(502, 'The upstream proxy request failed.'));
  });
};
}
