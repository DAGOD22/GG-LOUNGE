/**
 * Supported-target allowlist for the GG Lounge proxy.
 *
 * The proxy will only ever fetch hosts that match a rule here (plus optional
 * operator extras from GG_PROXY_EXTRA_HOSTS). Rules are either exact hosts
 * ("poki.com" — matches poki.com only) or parent domains matched on label
 * boundaries ("youtube.com" — matches youtube.com and any subdomain, but
 * NEVER "notyoutube.com" or "youtube.com.evil.net").
 *
 * To add a site: edit DEFAULT_RULES or set GG_PROXY_EXTRA_HOSTS,
 * e.g. GG_PROXY_EXTRA_HOSTS="example.com,cdn.example.org".
 */

export type AllowlistRule = {
  /** Rule as written (for logs/UI). */
  rule: string
  /** Parent domain: subdomains match. */
  domain: string
}

/**
 * Default supported sites. Only registered domains we control the risk for:
 * subdomain wildcards stay inside each brand's DNS.
 */
const DEFAULT_RULES: string[] = [
  // Video — official site + its first-party infrastructure.
  'youtube.com',
  'youtube-nocookie.com',
  'yt.be',
  'googlevideo.com', // signed media streams (Range requests)
  'ytimg.com', // thumbnails/player assets
  'ggpht.com', // channel avatars
  'googleusercontent.com',
  // Game portals.
  'poki.com',
  'crazygames.com',
  // Lightweight sites used by the lounge search box / reference links.
  'duckduckgo.com',
  'wikipedia.org',
  'wikimedia.org',
]

function parseRules(extra: string | undefined): AllowlistRule[] {
  const out: AllowlistRule[] = []
  const seen = new Set<string>()
  for (const raw of [...DEFAULT_RULES, ...(extra ?? '').split(',')]) {
    const rule = raw.trim().toLowerCase()
    if (!rule || seen.has(rule)) continue
    // Basic hygiene: hostnames only, never URLs or wildcards we didn't write.
    if (!/^[a-z0-9.-]+$/.test(rule) || rule.startsWith('.') || rule.endsWith('.')) continue
    seen.add(rule)
    out.push({ rule, domain: rule })
  }
  return out
}

/** Read the effective rule list (env read at call time so tests can vary it). */
export function allowlistRules(): AllowlistRule[] {
  return parseRules(process.env.GG_PROXY_EXTRA_HOSTS)
}

/**
 * Does `hostname` match the allowlist? Case-insensitive, trailing-dot
 * tolerated, label-boundary matching only.
 */
export function hostAllowed(hostname: string, rules: AllowlistRule[] = allowlistRules()): boolean {
  let host = hostname.trim().toLowerCase()
  if (host.endsWith('.')) host = host.slice(0, -1)
  if (!host) return false
  // IPv4/IPv6 literals are never allowlisted by domain rules.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return rules.some((r) => r.rule === host)
  }
  return rules.some((r) => host === r.domain || host.endsWith('.' + r.domain))
}

/** The allowlist rule a host matched (jar namespace + logs). Null if none. */
export function matchedRule(hostname: string, rules: AllowlistRule[] = allowlistRules()): string | null {
  let host = hostname.trim().toLowerCase()
  if (host.endsWith('.')) host = host.slice(0, -1)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return rules.find((r) => r.rule === host)?.rule ?? null
  }
  // Longest match wins so "youtube.com" beats any accidental shorter rule.
  let best: string | null = null
  for (const r of rules) {
    if (host === r.domain || host.endsWith('.' + r.domain)) {
      if (!best || r.domain.length > best.length) best = r.domain
    }
  }
  return best
}

/** Human-readable list for the proxy UI. */
export function allowedHostSummary(rules: AllowlistRule[] = allowlistRules()): string[] {
  return [...new Set(rules.map((r) => r.domain))].sort()
}
