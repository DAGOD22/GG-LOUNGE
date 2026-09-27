/**
 * Pure error-classification helpers shared by server (errors.ts/handler.ts)
 * and the client chrome (app/proxy/page.tsx). No Node APIs — safe to bundle.
 *
 * The proxy must distinguish and LABEL six failure classes instead of
 * collapsing everything into one vague message:
 *   network    — DNS/TCP/TLS failed; the site was never reached
 *   timeout    — the site accepted the connection but did not answer in time
 *   blocked    — our security policy refused the target (SSRF/allowlist input)
 *   unsupported — the proxy does not support this (scheme, size, not on list)
 *   provider   — the remote site itself refused (protection, rate limits,
 *                playback tokens) — the connection worked
 *   server     — the remote site answered with a server-side failure
 */

export type ErrorKind = 'network' | 'timeout' | 'blocked' | 'unsupported' | 'provider' | 'server'

export const KIND_LABEL: Record<ErrorKind, string> = {
  network: 'NETWORK FAILURE',
  timeout: 'TIMEOUT',
  blocked: 'BLOCKED BY SECURITY',
  unsupported: 'NOT SUPPORTED',
  provider: 'PROVIDER RESTRICTION',
  server: 'SERVER ERROR',
}

/** Sentence-case label for the chrome status line. */
export function kindTitle(kind: ErrorKind): string {
  switch (kind) {
    case 'network':
      return 'Network failure'
    case 'timeout':
      return 'Timeout'
    case 'blocked':
      return 'Blocked by security'
    case 'unsupported':
      return 'Not supported by this proxy'
    case 'provider':
      return 'Provider restriction'
    case 'server':
      return 'Server error'
  }
}

const BY_CODE: Record<string, ErrorKind> = {
  UPSTREAM_TIMEOUT: 'timeout',
  REQUEST_TOO_LARGE: 'unsupported',
  RESPONSE_TOO_LARGE: 'unsupported',
  BAD_SCHEME: 'unsupported',
  BAD_URL: 'unsupported',
  BAD_PORT: 'unsupported',
  BAD_TARGET: 'unsupported',
  BAD_SEGMENT: 'unsupported',
  TOO_LONG: 'unsupported',
  NOT_ALLOWED: 'unsupported', // target.ts overrides per-instance
  PRIVATE_IP: 'blocked',
  LOOP: 'blocked',
  CREDENTIALS: 'blocked',
  REDIRECT_BLOCKED: 'blocked',
  INTERNAL_HOST: 'blocked',
  UPSTREAM_FAILED: 'network',
  DNS_FAILURE: 'network',
  PROVIDER_RESTRICTED: 'provider',
  INTERNAL: 'server',
}

export function kindForCode(code: string): ErrorKind {
  return BY_CODE[code] ?? 'server'
}

/**
 * Short note for an upstream status the page PASSED THROUGH (the provider's
 * own document rendered inside the frame) — used by the chrome status line so
 * "upstream 403" is never a mystery number.
 */
export function upstreamStatusNote(status: number): string | null {
  if (status === 401 || status === 403 || status === 407 || status === 429 || status === 451) {
    return `${status} · provider refused the request`
  }
  if (status === 504) return `${status} · site timed out`
  if (status >= 500) return `${status} · site is failing`
  if (status === 404 || status === 410) return `${status} · page not found`
  return null
}

/** Signatures that a body is an anti-bot/interstitial challenge, not content. */
const CHALLENGE_SIGNS = /cf-chl-|challenge-platform|turnstile\.cloudflare|g-recaptcha|hcaptcha\.com|_cf_chl|botguard/i

export type UpstreamClassified = {
  status: number
  code: string
  kind: ErrorKind
  message: string
  host?: string
  hint?: string
}

/**
 * Decide whether an HTML navigation that came back >=400 should be replaced
 * with an honest classification card instead of the raw upstream body.
 * Returns null → pass the provider's response through untouched.
 *
 * Only replaces when we can be SURE of the classification:
 *  - googlevideo.com refusals (documented playback-token restriction),
 *  - hard auth/rate-limit statuses (401/407/429/451),
 *  - 403/503 that is an anti-bot challenge or has no body at all,
 *  - 5xx with an empty body (a blank page would look like a broken proxy).
 * Regular 403/404 pages with real content pass through — that is the site
 * speaking for itself, which is the most honest outcome.
 */
export function classifyUpstreamHtml(host: string, status: number, bodyText: string): UpstreamClassified | null {
  if (!(status >= 400)) return null
  const h = String(host || '').toLowerCase()
  const sample = String(bodyText || '').slice(0, 4000)
  const empty = !sample.trim()

  if (h === 'googlevideo.com' || h.endsWith('.googlevideo.com')) {
    return {
      status,
      code: 'PROVIDER_RESTRICTED',
      kind: 'provider',
      host,
      message: `The video server ${h} refused the request (HTTP ${status}).`,
      hint: 'YouTube issues short-lived playback tokens for its video streams and this proxy cannot mint them. The connection itself worked — this is YouTube’s restriction, not a network failure. Official embeds remain the supported way to watch.',
    }
  }
  if (
    status === 401 ||
    status === 407 ||
    status === 429 ||
    status === 451 ||
    (status === 403 && (empty || CHALLENGE_SIGNS.test(sample))) ||
    (status === 503 && CHALLENGE_SIGNS.test(sample))
  ) {
    return {
      status,
      code: 'PROVIDER_RESTRICTED',
      kind: 'provider',
      host,
      message: `${h} refused this request (HTTP ${status}).`,
      hint: 'The site’s own access protection, rate limits or regional rules rejected it — the connection worked. This proxy does not bypass those controls. If the site opens normally in a regular browser, use the direct link.',
    }
  }
  if (status >= 500 && empty) {
    return {
      status,
      code: 'UPSTREAM_FAILED',
      kind: 'server',
      host,
      message: `${h} answered with a server error (HTTP ${status}).`,
      hint: 'The site itself is failing right now — this is not your connection and not a proxy block. Try again later or open the original site.',
    }
  }
  return null
}

/**
 * Refine a generic connection failure with the most accurate plain-English
 * cause we can give from the errno.
 */
export function networkFailureHint(err: { code?: string; message?: string }): string {
  const code = err.code || ''
  const specific = (() => {
    switch (code) {
      case 'ENOTFOUND':
      case 'EAI_AGAIN':
        return 'The host name could not be resolved (DNS). The site may be down, misspelled, or DNS is blocked on the lounge server’s network.'
      case 'ECONNREFUSED':
        return 'The remote server actively refused the connection. The site may be offline or blocking this server’s address.'
      case 'ECONNRESET':
      case 'EPIPE':
        return 'The connection was cut mid-request. The site or an intermediary closed it — usually transient, try again.'
      case 'ETIMEDOUT':
        return 'The site accepted the connection but never responded in time.'
      case 'ENETUNREACH':
      case 'EHOSTUNREACH':
        return 'The lounge server has no route to that host (network unreachable).'
      case 'CERT_HAS_EXPIRED':
      case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      case 'ERR_TLS_CERT_ALTNAME_INVALID':
        return 'The site’s TLS certificate failed verification, so the secure connection was refused. This proxy never disables certificate checks.'
      default:
        return 'The connection to the site failed. It may be down, overloaded, or blocking this server.'
    }
  })()
  // Universal clarification: the failure happened on the SERVER side of the
  // proxy. It must never be read as “your device has no internet”.
  return specific + ' This happened between the lounge server and the site — it is not a client-side connectivity failure on your device.'
}
