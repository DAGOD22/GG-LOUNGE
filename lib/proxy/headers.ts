/**
 * Request/response header policy for the GG Lounge proxy.
 *
 * Goals: forward what the target legitimately needs, rewrite origin signals
 * (Origin/Referer/Sec-Fetch-Site) so requests look same-origin to the target,
 * and never leak lounge auth material upstream.
 */
import { JAR_HEADER, cookiesFromHeader, upstreamCookieHeader } from './jar.ts'

/** Browser → proxy request headers we drop outright. */
const REQUEST_DROP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'http2-settings',
  'content-length', // recomputed by node for the body we forward
  'accept-encoding', // set deliberately per content class (see below)
  'cookie', // rebuilt from namespaced jar (never forwards lounge cookies)
  // Lounge/session material that must never reach a third party:
  'authorization-strength',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'forwarded',
])

/** Hop-by-hop + policy headers dropped from upstream responses. */
const RESPONSE_DROP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'set-cookie', // re-emitted namespaced (handled separately)
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'x-content-security-policy',
  'strict-transport-security',
  'public-key-pins',
  'public-key-pins-report-only',
  'clear-site-data',
  'report-to',
  'nel',
  'alt-svc',
  'alt-used',
  'server-timing',
  'access-control-allow-origin', // replaced with ours
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-expose-headers',
  'access-control-request-headers',
  'access-control-request-method',
  'timing-allow-origin',
  'digest',
  'content-md5',
  'etag', // invalid after rewriting; safe to drop
  'link', // preload hints would point browsers at real origins
  'x-cache', // upstream CDN internals confuse users
])

export const FORWARD_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'range',
  'if-match',
  'if-none-match',
  'if-modified-since',
  'if-range',
  'if-unmodified-since',
  'cache-control',
  'pragma',
  'x-requested-with',
  'authorization',
  'origin',
  'referer',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'upgrade-insecure-requests',
  'user-agent',
] as const

export type UpstreamRequestHeaders = {
  headers: Record<string, string>
  /** Namespaced cookies extracted for this target (for jar bookkeeping). */
  seenCookies: Record<string, string>
}

/**
 * Build the request header set sent to the target.
 * - Drops hop-by-hop and lounge-only headers.
 * - Rewrites Origin/Referer so the request looks same-origin at the target
 *   (that is what a proxy is) — but only sets Origin when a browser would:
 *   state-changing methods always carry one; plain GET/HEAD navigations
 *   keep their existing (possibly absent) Origin, because strict WAFs treat
 *   a surprise Origin on a navigation as bot traffic.
 * - Forces Sec-Fetch-Site to same-origin.
 * - Rebuilds Cookie strictly from this target's namespaced jar (lounge auth
 *   cookies can never travel).
 * - Accept-Encoding: identity for Range/media (byte-faithful 206), compressed
 *   classes allowed otherwise (the handler decompresses before rewriting).
 */
export function buildUpstreamRequestHeaders(opts: {
  incoming: Headers
  method: string
  target: URL
  rule: string
  jarCookies: Record<string, string>
  forMedia: boolean
}): UpstreamRequestHeaders {
  const { incoming, method, target, rule, jarCookies, forMedia } = opts
  const headers: Record<string, string> = {}
  for (const name of FORWARD_REQUEST_HEADERS) {
    if (REQUEST_DROP.has(name)) continue
    const value = incoming.get(name)
    if (value !== null) headers[name] = value
  }
  const upperMethod = method.toUpperCase()
  if (incoming.has('origin') || !['GET', 'HEAD', 'OPTIONS'].includes(upperMethod)) {
    headers['origin'] = target.origin
  } else {
    delete headers['origin']
  }
  const referer = incoming.get('referer')
  headers['referer'] = referer ? rewriteReferer(referer, target) : target.href
  if (headers['sec-fetch-site']) headers['sec-fetch-site'] = 'same-origin'
  // Byte-faithful where it matters (media + Range), compressed otherwise.
  headers['accept-encoding'] = forMedia ? 'identity' : 'gzip, deflate, br'
  const cookie = upstreamCookieHeader(jarCookies)
  if (cookie) headers['cookie'] = cookie
  else delete headers['cookie']
  const seen = cookiesFromHeader(incoming.get('cookie'), rule)
  return { headers, seenCookies: seen }
}

/**
 * A Referer we send upstream: if the browser sent one of our proxied URLs,
 * decode it back to the real page; otherwise fall back to the target itself.
 */
function rewriteReferer(referer: string, target: URL): string {
  try {
    const url = new URL(referer)
    if (url.pathname.startsWith('/api/proxy/')) {
      const decoded = Buffer.from(url.pathname.slice('/api/proxy/'.length), 'base64url').toString('utf8')
      if (/^https?:\/\//.test(decoded)) return decoded
    }
    // A referer on our own site that isn't a proxy URL: point at target.
    return target.href
  } catch {
    return target.href
  }
}

/**
 * Prepare upstream response headers for the browser. Drops CSP/frame/HSTS
 * policy that would apply to GG Lounge instead of the target, strips
 * encodings we recompute, and returns namespaced Set-Cookie lines separately.
 */
export function buildDownstreamResponseHeaders(opts: {
  upstream: Record<string, string | string[] | undefined>
  setCookieLines: string[]
  rule: string
  overHttps: boolean
  /** Content was rewritten → framing headers must be recomputed. */
  rewrote: boolean
  /** CORS echo for the sandboxed frame (null | our origin). */
  corsOrigin: string | null
  browserJar: string | null
}): { headers: Headers; dropSetCookie: boolean } {
  const { upstream, setCookieLines, rule, overHttps, rewrote, corsOrigin, browserJar } = opts
  const headers = new Headers()
  for (const [rawKey, value] of Object.entries(upstream)) {
    if (value === undefined) continue
    const key = rawKey.toLowerCase()
    if (RESPONSE_DROP.has(key)) continue
    if (rewrote && (key === 'content-length' || key === 'content-encoding')) continue
    const lines = Array.isArray(value) ? value : [String(value)]
    for (const line of lines) {
      try {
        headers.append(key, line)
      } catch {
        // Ignore invalid upstream header values rather than failing the page.
      }
    }
  }
  headers.set('referrer-policy', 'no-referrer')
  if (corsOrigin) {
    headers.set('access-control-allow-origin', corsOrigin)
    headers.set('access-control-allow-credentials', 'true')
    headers.set('access-control-expose-headers', 'content-range, content-length, accept-ranges, content-type, last-modified, content-disposition, x-gg-jar')
    headers.append('vary', 'Origin')
  }
  if (browserJar) headers.set(JAR_HEADER, browserJar)
  void setCookieLines
  void rule
  void overHttps
  return { headers, dropSetCookie: true }
}

/** Answer browser CORS preflights for the proxy itself (never forwarded). */
export function preflightResponse(request: Request, ourOrigin: string): Response {
  const origin = request.headers.get('origin')
  const allowed = origin === 'null' || origin === ourOrigin
  if (!allowed || !origin) {
    return new Response(null, { status: 403, headers: { 'content-type': 'application/json' } })
  }
  const headers = new Headers({
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': request.headers.get('access-control-request-method') || 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
    'access-control-allow-headers': request.headers.get('access-control-request-headers') || '*',
    'access-control-max-age': '600',
    'access-control-expose-headers': 'x-gg-jar',
    vary: 'Origin',
  })
  return new Response(null, { status: 204, headers })
}

/** Headers that must be present on our sandboxed documents. */
export function documentPolicyHeaders(): { csp: string; referrerPolicy: string } {
  return {
    // Response-level sandbox: applies even when a proxied URL is opened
    // directly (not only inside the /proxy iframe), and the page cannot
    // remove a response-header CSP. NO allow-same-origin: proxied code can
    // never read lounge cookies, storage or APIs with the user's session.
    csp:
      'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock allow-storage-access-by-user-activation',
    referrerPolicy: 'no-referrer',
  }
}
