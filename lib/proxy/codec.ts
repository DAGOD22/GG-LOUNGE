/**
 * URL codec between the real web and the proxy route.
 *
 * Canonical proxy form:  /api/proxy/<base64url(absolute-url)>
 * One path segment keeps Node/Vercel URL limits predictable and makes
 * double-proxying easy to detect.
 */

/** Encode any absolute http(s) URL into its proxy path. */
export function encodeProxyPath(absolute: string | URL): string {
  const href = typeof absolute === 'string' ? absolute : absolute.href
  return '/api/proxy/' + Buffer.from(href, 'utf8').toString('base64url')
}

export type DecodeResult =
  | { ok: true; href: string }
  | { ok: false; reason: 'BAD_SEGMENT' | 'BAD_FORMAT' | 'LOOP' | 'BAD_SCHEME'; scheme?: string }

/**
 * Decode a proxy path segment back to an absolute URL.
 * Rejects non-http(s) schemes and proxy loops (a target that itself points
 * back at /api/proxy/).
 */
export function decodeProxySegment(segment: string): DecodeResult {
  if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) return { ok: false, reason: 'BAD_SEGMENT' }
  let href: string
  try {
    href = Buffer.from(segment, 'base64url').toString('utf8')
  } catch {
    return { ok: false, reason: 'BAD_FORMAT' }
  }
  if (!href) return { ok: false, reason: 'BAD_FORMAT' }
  try {
    const url = new URL(href)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, reason: 'BAD_SCHEME', scheme: url.protocol.replace(':', '') }
    }
    if (url.pathname.startsWith('/api/proxy/') || /\/api\/proxy\//.test(url.hostname)) {
      // A proxied URL pointing back at ourselves would loop.
      if (url.pathname.startsWith('/api/proxy/')) return { ok: false, reason: 'LOOP' }
    }
    return { ok: true, href: url.href }
  } catch {
    return { ok: false, reason: 'BAD_FORMAT' }
  }
}

/**
 * Resolve a reference found in proxied content against the real base URL and
 * return its proxy path. Returns null for references that must pass through
 * untouched (data:, blob:, mailto:, javascript:, #fragment-only, …).
 */
export function proxiedRef(ref: string, baseHref: string): string | null {
  const value = ref.trim()
  if (!value) return null
  // Leave non-network schemes and pure fragments alone.
  if (
    value.startsWith('#') ||
    /^(data|blob|about|javascript|mailto|tel|sms|ftp|ws|wss|chrome|moz-extension|view-source):/i.test(value)
  ) {
    return null
  }
  let absolute: URL
  try {
    absolute = new URL(value, baseHref)
  } catch {
    return null
  }
  if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return null
  // Already pointing at this proxy? Keep it (idempotent rewriting).
  if (absolute.origin === PROXY_SELF_ORIGIN && absolute.pathname.startsWith('/api/proxy/')) {
    return absolute.pathname + absolute.search + absolute.hash
  }
  return encodeProxyPath(absolute) + absolute.hash
}

/**
 * The page's own origin at runtime. Injected into documents as a literal so
 * the client runtime does not need to guess (sandboxed frames report "null").
 */
export const PROXY_SELF_ORIGIN = '__GG_ORIGIN__'

/** Runtime boot marker present on every rewritten document. */
export const GG_META = 'gg-proxy'
