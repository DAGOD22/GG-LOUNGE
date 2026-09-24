/**
 * Target URL parsing, validation and DNS-rebinding-safe resolution for the
 * GG Lounge proxy. Everything the proxy fetches passes through
 * `validateTarget()` before a socket is opened.
 */
import { lookup as dnsLookup } from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { hostAllowed, matchedRule } from './allowlist.ts'

export type TargetError = {
  status: 400 | 403
  code: 'BAD_URL' | 'BAD_SCHEME' | 'BAD_PORT' | 'CREDENTIALS' | 'NOT_ALLOWED' | 'PRIVATE_IP' | 'TOO_LONG' | 'LOOP'
  message: string
}

export type ValidTarget = {
  url: URL
  /** Allowlist rule that matched (cookie-jar namespace). */
  rule: string
}

/** Maximum decoded target length (keeps us under proxy-layer URL limits). */
export const MAX_TARGET_LENGTH = 7000

// SEPARATE lists per family. A single BlockList containing both families is
// unsafe for our purposes: Node normalizes IPv4 to ::ffff:a.b.c.d, so a
// ::ffff:0:0/96 entry ends up matching EVERY IPv4 address (and conversely we
// want v6-mapped addresses judged by their embedded v4).
const blockedV4 = new BlockList()
for (const [ip, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // incl. 169.254.169.254 cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedV4.addSubnet(ip, bits, 'ipv4')
}
const blockedV6 = new BlockList()
for (const [ip, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['64:ff9b::', 96], // NAT64 prefix — embeds IPv4; conservative block
] as const) {
  blockedV6.addSubnet(ip, bits, 'ipv6')
}

/** Test-only loopback bypass. NEVER enable on a deployment (VERCEL=1 refuses). */
export function loopbackAllowed(): boolean {
  return process.env.GG_PROXY_ALLOW_LOOPBACK === '1' && !process.env.VERCEL
}

/** True when the address is a routable, public unicast address. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip)
  if (!family) return false
  if (family === 4) return !blockedV4.check(ip, 'ipv4')
  // IPv4-mapped IPv6 must be judged by the EMBEDDED IPv4 address, in both
  // dotted (::ffff:127.0.0.1) and hex (::ffff:7f00:1) tail notations.
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (dotted) return isPublicAddress(dotted[1])
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    if (hi > 0xffff || lo > 0xffff) return false
    return isPublicAddress(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`)
  }
  return !blockedV6.check(ip, 'ipv6')
}

const HOST_ALIASES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'metadata.goog',
])

/**
 * Parse + validate a raw target string. Does NOT touch DNS.
 * Returns the URL or a structured error the route can turn into a response.
 */
export function validateTarget(raw: string): ValidTarget | TargetError {
  if (raw.length > MAX_TARGET_LENGTH) {
    return { status: 400, code: 'TOO_LONG', message: 'That address is too long to proxy.' }
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { status: 400, code: 'BAD_URL', message: 'That is not a valid absolute URL.' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      status: 403,
      code: 'BAD_SCHEME',
      message: `Protocol "${url.protocol.replace(':', '')}" is not allowed. Only http and https can be proxied.`,
    }
  }
  if (url.username || url.password) {
    return { status: 403, code: 'CREDENTIALS', message: 'Addresses containing credentials are not allowed.' }
  }
  let host = url.hostname.toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (HOST_ALIASES.has(host) || /\.localhost$/.test(host) || /\.local$/.test(host) || /\.internal$/.test(host)) {
    return { status: 403, code: 'NOT_ALLOWED', message: `"${host}" is an internal address and cannot be proxied.` }
  }
  const isLoopback = loopbackAllowed() && /^127\./.test(host)
  if (isIP(host) && !isPublicAddress(host) && !isLoopback) {
    return { status: 403, code: 'PRIVATE_IP', message: 'That address is a private, loopback or cloud-metadata address, which is not allowed.' }
  }
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  if (port !== '80' && port !== '443' && !isLoopback) {
    return { status: 403, code: 'BAD_PORT', message: 'Only standard ports 80 and 443 are allowed.' }
  }
  const rule = matchedRule(host)
  if (!rule || !hostAllowed(host)) {
    return {
      status: 403,
      code: 'NOT_ALLOWED',
      message: `"${host}" is not on the supported-sites list for this proxy.`,
    }
  }
  return { url, rule }
}

export type ResolvedTarget = {
  /** First validated address (used to pin the connection). */
  address: string
  family: 4 | 6
}

/**
 * Resolve a validated target's host, rejecting the WHOLE answer if any record
 * is private (anti-rebinding), and returning the address used to pin
 * `http.request({ lookup })` so the validated IP is the one we connect to.
 */
export function resolveTargetAddress(url: URL): Promise<ResolvedTarget> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (!isPublicAddress(host) && !(loopbackAllowed() && /^127\./.test(host))) {
      return Promise.reject(Object.assign(new Error('Private network destinations are blocked.'), { code: 'PRIVATE_IP' }))
    }
    return Promise.resolve({ address: host, family: (isIP(host) === 6 ? 6 : 4) as 4 | 6 })
  }
  return new Promise((resolve, reject) => {
    dnsLookup(host, { all: true, verbatim: true }, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        reject(Object.assign(new Error(err?.message || `Could not resolve ${host}.`), { code: 'ENOTFOUND' }))
        return
      }
      const first =
        addresses.find((a) => isPublicAddress(a.address)) ??
        (loopbackAllowed() ? addresses.find((a) => /^127\./.test(a.address)) : undefined)
      if (!first) {
        reject(Object.assign(new Error('Private network destinations are blocked.'), { code: 'PRIVATE_IP' }))
        return
      }
      resolve({ address: first.address, family: first.family === 6 ? 6 : 4 })
    })
  })
}

/**
 * A `lookup` implementation for `http.request` that ONLY returns the
 * pre-validated address — the OS never re-resolves the name at connect time,
 * closing the DNS-rebinding window.
 */
export function pinnedLookup(resolved: ResolvedTarget) {
  return (
    hostname: string,
    options: { all?: boolean; family?: number },
    callback: (err: NodeJS.ErrnoException | null, address?: string | object, family?: number) => void,
  ) => {
    void hostname
    if (options?.all) callback(null, [{ address: resolved.address, family: resolved.family }])
    else callback(null, resolved.address, resolved.family)
  }
}
