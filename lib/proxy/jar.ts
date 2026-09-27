/**
 * Cookie-jar namespacing.
 *
 * Upstream cookies must never touch the lounge's own cookie jar (auth
 * isolation), and cookies for one proxied site must never be sent to another.
 * Strategy:
 *   - Browser-facing cookies are renamed `ggc_<ruleHash8>_<name>` and scoped
 *     to Path=/api/proxy/ (HttpOnly, SameSite=None so sandboxed frames send
 *     them where the browser allows; the runtime header jar is the fallback).
 *   - The runtime also carries a compact JSON jar in `X-GG-Jar`, keyed by
 *     allowlist rule. Header + cookie jars are merged server-side (header
 *     wins) and a trimmed merge is returned in `X-GG-Jar` for the client to
 *     persist via its parent frame.
 */

export const JAR_HEADER = 'x-gg-jar'
const COOKIE_PREFIX = 'ggc_'

/** Caps keep us inside 8KB header budgets. */
export const MAX_JAR_CHARS = 4000
export const MAX_COOKIES_PER_RULE = 40
export const MAX_VALUE_CHARS = 1024

export type Jar = Record<string, Record<string, string>>

function hash8(input: string): string {
  // FNV-1a — small, stable, dependency-free.
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function cookieName(rule: string, name: string): string {
  return COOKIE_PREFIX + hash8(rule) + '_' + name.replace(/[^A-Za-z0-9!#$%&'*+.^_`|~-]/g, '_').slice(0, 80)
}

/** Extract upstream cookies for `rule` from a browser Cookie header. */
export function cookiesFromHeader(cookieHeader: string | null, rule: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!cookieHeader) return out
  const marker = COOKIE_PREFIX + hash8(rule) + '_'
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq).trim()
    if (!name.startsWith(marker)) continue
    out[name.slice(marker.length)] = part.slice(eq + 1).trim()
  }
  return out
}

/**
 * Parse the runtime's X-GG-Jar (base64url JSON, rule → name → value).
 * Malformed input yields an empty jar — never throws.
 */
export function parseJarHeader(value: string | null): Jar {
  if (!value) return {}
  try {
    const json = Buffer.from(value, 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const jar: Jar = {}
    for (const [rule, cookies] of Object.entries(parsed as Record<string, unknown>)) {
      if (!cookies || typeof cookies !== 'object' || Array.isArray(cookies)) continue
      if (!/^[a-z0-9.-]{1,120}$/.test(rule)) continue
      const entry: Record<string, string> = {}
      let n = 0
      for (const [k, v] of Object.entries(cookies as Record<string, unknown>)) {
        if (n++ >= MAX_COOKIES_PER_RULE) break
        if (typeof v !== 'string' || !k || v.length > MAX_VALUE_CHARS) continue
        entry[k.slice(0, 80)] = v
      }
      if (Object.keys(entry).length) jar[rule] = entry
    }
    return jar
  } catch {
    return {}
  }
}

/** Serialize a jar for X-GG-Jar, respecting the size cap (keeps newest). */
export function serializeJar(jar: Jar): string {
  // Trim per rule first, then globally drop oldest rules if still too big.
  const trimmed: Jar = {}
  for (const [rule, cookies] of Object.entries(jar)) {
    const entries = Object.entries(cookies).slice(-MAX_COOKIES_PER_RULE)
    if (entries.length) trimmed[rule] = Object.fromEntries(entries)
  }
  let encoded = Buffer.from(JSON.stringify(trimmed), 'utf8').toString('base64url')
  const rules = Object.keys(trimmed)
  while (encoded.length > MAX_JAR_CHARS && rules.length > 0) {
    const drop = rules.shift()!
    delete trimmed[drop]
    encoded = Buffer.from(JSON.stringify(trimmed), 'utf8').toString('base64url')
  }
  return encoded
}

/** Merge cookie-header and header jars for a request (header wins). */
export function mergeForRequest(rule: string, fromCookies: Record<string, string>, fromHeader: Jar): Record<string, string> {
  return { ...fromCookies, ...(fromHeader[rule] ?? {}) }
}

export type ParsedSetCookie = {
  name: string
  value: string
  /** Milliseconds epoch, or null for session cookies. */
  expires: number | null
  /** Attributes we re-emit on the browser-facing cookie. */
  httpOnly: boolean
  sameSite: string | null
  secure: boolean
  path: string | null
}

/** Minimal Set-Cookie parser: name, value, Expires/Max-Age, flags we need. */
export function parseSetCookie(line: string): ParsedSetCookie | null {
  const parts = line.split(';')
  const first = parts[0]?.trim()
  if (!first) return null
  const eq = first.indexOf('=')
  if (eq <= 0) return null
  const name = first.slice(0, eq).trim()
  const value = first.slice(eq + 1).trim()
  if (!name || /[^\x20-\x7e]/.test(name)) return null
  let expires: number | null = null
  let httpOnly = false
  let sameSite: string | null = null
  let secure = false
  let path: string | null = null
  let maxAge: number | null = null
  for (const attr of parts.slice(1)) {
    const a = attr.trim()
    const [kRaw, ...rest] = a.split('=')
    const k = kRaw.trim().toLowerCase()
    const v = rest.join('=').trim()
    if (k === 'expires') {
      const t = Date.parse(v)
      if (!Number.isNaN(t)) expires = t
    } else if (k === 'max-age') {
      const n = Number(v)
      if (Number.isFinite(n)) maxAge = n
    } else if (k === 'httponly') httpOnly = true
    else if (k === 'secure') secure = true
    else if (k === 'samesite') sameSite = v
    else if (k === 'path') path = v
    // Domain is intentionally dropped: browser cookies are host-scoped to us.
  }
  if (maxAge !== null) expires = Date.now() + maxAge * 1000
  return { name, value, expires, httpOnly, sameSite, secure, path }
}

/** Store a parsed upstream cookie in the jar under its rule. */
export function applySetCookie(jar: Jar, rule: string, parsed: ParsedSetCookie): void {
  const bucket = (jar[rule] ??= {})
  if (parsed.expires !== null && parsed.expires <= Date.now()) {
    delete bucket[parsed.name]
    return
  }
  if (parsed.value.length > MAX_VALUE_CHARS) return
  bucket[parsed.name] = parsed.value
  const keys = Object.keys(bucket)
  if (keys.length > MAX_COOKIES_PER_RULE) {
    for (const extra of keys.slice(0, keys.length - MAX_COOKIES_PER_RULE)) delete bucket[extra]
  }
}

/**
 * Browser-facing Set-Cookie for an upstream cookie: namespaced, path-scoped
 * to the proxy, HttpOnly (the runtime never needs to read these), Secure when
 * the request arrived over HTTPS.
 */
export function browserSetCookie(rule: string, parsed: ParsedSetCookie, overHttps: boolean): string | null {
  if (parsed.expires !== null && parsed.expires <= Date.now()) {
    // Deletion of the namespaced cookie.
    return `${cookieName(rule, parsed.name)}=; Path=/api/proxy/; Max-Age=0; HttpOnly; SameSite=None${overHttps ? '; Secure' : ''}`
  }
  if (parsed.value.length > MAX_VALUE_CHARS) return null
  const attrs = [
    `${cookieName(rule, parsed.name)}=${parsed.value}`,
    'Path=/api/proxy/',
    'HttpOnly',
    // None (not Lax) because proxied documents live in sandboxed (opaque)
    // frames; the runtime's X-GG-Jar covers browsers that block 3p cookies.
    'SameSite=None',
  ]
  if (overHttps) attrs.push('Secure')
  if (parsed.expires !== null) {
    attrs.push(`Expires=${new Date(parsed.expires).toUTCString()}`)
  }
  return attrs.join('; ')
}

/** The Cookie header to send upstream: namespaced cookies for this rule only. */
export function upstreamCookieHeader(cookies: Record<string, string>): string | null {
  const entries = Object.entries(cookies)
  if (!entries.length) return null
  return entries.map(([k, v]) => `${k}=${v}`).join('; ')
}
