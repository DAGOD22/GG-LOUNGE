/**
 * HTML / CSS / JS rewriting for proxied documents.
 *
 * Everything here is a pure function over strings + a base URL so it can be
 * unit-tested exhaustively. Rules:
 *   HTML  — rewrite every URL-bearing attribute (and srcset/style/meta-refresh),
 *           strip integrity (content changes), neutralize <base>, drop
 *           dns-prefetch/preconnect (they would leak to real origins), inject
 *           the runtime bootstrap before any page script.
 *   CSS   — rewrite url() and @import targets.
 *   JS    — rewrite quoted absolute URLs to allowlisted hosts (best effort;
 *           dynamic construction is handled client-side by the runtime).
 */
import { encodeProxyPath, proxiedRef } from './codec.ts'
import { hostAllowed } from './allowlist.ts'

const RUNTIME_TAG = '<script src="/proxy/runtime.js"></script>'

/** Attributes whose value is a single URL. */
const URL_ATTRS = [
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'data',
  'background',
  'cite',
  'longdesc',
  'manifest',
  'xlink:href',
  'data-src',
  'data-href',
  'data-url',
  'data-video',
  'data-poster',
] as const

/** data-* attributes: only rewrite values that already look like paths/URLs. */
const LOOKS_LIKE_REF = /^(https?:\/\/|\/\/|\/(?!\/)|\.{1,2}\/)/i

export type RewriteOptions = {
  baseHref: string
  /** Serialized JSON for window.__GG_BOOT__ (origin, target, status, jar). */
  boot: string
  /** When set, JS rewriting only rewrites URLs to these hosts… actually the
   *  allowlist is global; kept as an options bag for future tuning. */
  status?: number
}

/** Parse an HTML document and rewrite it around `baseHref`. */
export function rewriteHtml(html: string, opts: RewriteOptions): string {
  let out = html

  // 1. Capture and neutralize <base href> — relative refs must resolve against
  //    the REAL base we were given, never against a proxied <base>.
  let base = opts.baseHref
  const baseTag = /<base\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(out)
  if (baseTag) {
    const raw = baseTag[2] ?? baseTag[3] ?? baseTag[4] ?? ''
    try {
      base = new URL(raw, opts.baseHref).href
    } catch {
      /* keep original base */
    }
    out = out.replace(baseTag[0], '<base data-gg-removed="1" href="about:blank">')
  }

  // 2. URL-bearing attributes.
  for (const attr of URL_ATTRS) {
    out = rewriteAttr(out, attr, (value) => proxiedRef(value, base))
  }

  // 3. data-* attributes with URL-looking values only.
  out = out.replace(
    /(\sdata-[a-z0-9-]+)(\s*=\s*)("([^"]*)"|'([^']*)')/gi,
    (full, name: string, eq: string, _q: string, dq?: string, sq?: string) => {
      const value = dq ?? sq ?? ''
      if (!LOOKS_LIKE_REF.test(value.trim())) return full
      const next = proxiedRef(value, base)
      return next === null ? full : `${name}${eq}"${next}"`
    },
  )

  // 4. srcset / imagesrcset.
  out = rewriteAttr(out, 'srcset', (v) => rewriteSrcset(v, base))
  out = rewriteAttr(out, 'imagesrcset', (v) => rewriteSrcset(v, base))

  // 5. Inline style attributes + <style> blocks.
  out = rewriteAttr(out, 'style', (v) => rewriteCss(v, base))
  out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, body: string) => `<style>${rewriteCss(body, base)}</style>`)

  // 6. Meta refresh.
  out = out.replace(
    /(<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*)("([^"]*)"|'([^']*)')/gi,
    (full, prefix: string, _q: string, dq?: string, sq?: string) => {
      const content = dq ?? sq ?? ''
      const m = /url\s*=\s*(['"]?)(.+?)\1\s*$/i.exec(content)
      if (!m) return full
      const next = proxiedRef(m[2], base)
      if (next === null) return full
      return `${prefix}"${content.slice(0, m.index)}url=${next}"`
    },
  )

  // 7. Drop resource hints that leak real origins.
  out = out.replace(/<link\b[^>]*\brel\s*=\s*["']?(?:dns-prefetch|preconnect|prefetch|prerender)["']?[^>]*>/gi, '')

  // 8. SRI must go: rewritten bytes no longer match upstream hashes.
  out = out.replace(/\s+integrity\s*=\s*("([^"]*)"|'([^']*)')/gi, '')

  // 9. Inject runtime bootstrap as the FIRST thing in <head> (before page
  //    scripts). Falls back to top of document for malformed markup.
  // Boot MUST be assigned BEFORE runtime.js loads — the runtime captures
  // window.__GG_BOOT__ at eval time (target URL, status, error, jar origin).
  // The old order left boot empty for every proxied page: runtime fell back
  // to location.href (the PROXY url!) for relative resolution, and reported
  // fabricated status 200 with error:null.
  const boot = `<script>window.__GG_BOOT__=${opts.boot.replace(/</g, '\\u003c')};</script>${RUNTIME_TAG}`
  if (/<head\b[^>]*>/i.test(out)) out = out.replace(/<head\b[^>]*>/i, (m) => `${m}${boot}`)
  else if (/<html\b[^>]*>/i.test(out)) out = out.replace(/<html\b[^>]*>/i, (m) => `${m}${boot}`)
  else out = boot + out

  return out
}

function rewriteAttr(html: string, attr: string, map: (value: string) => string | null): string {
  const re = new RegExp(`(\\s${attr}\\s*=\\s*)("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'gi')
  return html.replace(re, (full, prefix: string, _raw: string, dq?: string, sq?: string, bare?: string) => {
    const value = dq ?? sq ?? bare ?? ''
    const next = map(value)
    if (next === null) return full
    const quoted = sq !== undefined && dq === undefined ? `'${next}'` : `"${next}"`
    return `${prefix}${quoted}`
  })
}

/** Rewrite each candidate of a srcset value. */
export function rewriteSrcset(value: string, base: string): string | null {
  // Candidates are comma-separated; URLs may not contain spaces.
  const parts = value.split(',')
  let changed = false
  const next = parts.map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return ''
    const sp = trimmed.search(/\s/)
    const url = sp < 0 ? trimmed : trimmed.slice(0, sp)
    const descriptor = sp < 0 ? '' : trimmed.slice(sp)
    const mapped = proxiedRef(url, base)
    if (mapped === null) return trimmed
    changed = true
    return mapped + descriptor
  })
  return changed ? next.filter(Boolean).join(', ') : null
}

/**
 * Rewrite CSS url() / @import references.
 * Handles quoted and unquoted forms; leaves data:/blob: untouched.
 */
export function rewriteCss(css: string, base: string): string {
  let out = css
  // url(...)
  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote: string, ref: string) => {
    const next = proxiedRef(ref, base)
    if (next === null) return full
    return `url("${next}")`
  })
  // @import "..." / @import '...'
  out = out.replace(/(@import\s+)['"]([^'"]+)['"]/gi, (full, prefix: string, ref: string) => {
    const next = proxiedRef(ref, base)
    if (next === null) return full
    return `${prefix}"${next}"`
  })
  return out
}

/**
 * Best-effort rewrite of absolute URLs inside JavaScript string literals.
 * Only allowlisted http(s) URLs are touched. A small lexer tracks strings and
 * comments so we do not rewrite code identifiers. Template literals containing
 * ${} interpolations are skipped.
 */
export function rewriteJs(js: string): { code: string; changed: number } {
  let changed = 0
  let out = ''
  let i = 0
  const n = js.length
  while (i < n) {
    const c = js[i]
    // Line comment
    if (c === '/' && js[i + 1] === '/') {
      const end = js.indexOf('\n', i)
      const stop = end < 0 ? n : end
      out += js.slice(i, stop)
      i = stop
      continue
    }
    // Block comment
    if (c === '/' && js[i + 1] === '*') {
      const end = js.indexOf('*/', i + 2)
      const stop = end < 0 ? n : end + 2
      out += js.slice(i, stop)
      i = stop
      continue
    }
    // Strings
    if (c === '"' || c === "'" || c === '`') {
      const end = scanString(js, i)
      if (end < 0) {
        out += js.slice(i)
        break
      }
      const raw = js.slice(i, end)
      if (c !== '`' || !raw.includes('${')) {
        const inner = raw.slice(1, -1)
        if (/^https?:\/\/[^\s'"`\\]+$/i.test(inner)) {
          try {
            const url = new URL(inner)
            if (hostAllowed(url.hostname)) {
              out += (c === '`' ? '`' : c) + encodeProxyPath(url) + (c === '`' ? '`' : c)
              changed++
              i = end
              continue
            }
          } catch {
            /* fall through */
          }
        }
      }
      out += raw
      i = end
      continue
    }
    out += c
    i++
  }
  return { code: out, changed }
}

/** Return index just past the closing quote for a string starting at `start`. */
function scanString(s: string, start: number): number {
  const quote = s[start]
  let i = start + 1
  while (i < s.length) {
    const c = s[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === quote) return i + 1
    if (quote !== '`' && (c === '\n' || c === '\r')) return -1 // unterminated
    i++
  }
  return -1
}

/** Content types we rewrite (everything else streams through untouched). */
export function isHtmlType(contentType: string | null): boolean {
  if (!contentType) return false
  return /text\/html|application\/xhtml\+xml/i.test(contentType)
}

export function isCssType(contentType: string | null): boolean {
  return !!contentType && /text\/css/i.test(contentType)
}

export function isJsType(contentType: string | null): boolean {
  return !!contentType && /javascript|ecmascript|application\/x-ecmascript|text\/jscript/i.test(contentType)
}

/** Media/binary classes that must stream byte-faithfully (Range!). */
export function isMediaType(contentType: string | null): boolean {
  if (!contentType) return false
  return /^(video|audio|image|font)\//i.test(contentType) || /octet-stream/i.test(contentType)
}
