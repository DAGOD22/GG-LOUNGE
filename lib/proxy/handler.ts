/**
 * Core proxy request handler: browser → validate → upstream socket →
 * (rewrite | stream) → browser.
 *
 * Uses raw node:http/https so we can pin the DNS lookup, stream bodies with
 * backpressure, and honour Range/206 byte-faithfully. Pure Web `fetch` cannot
 * pin DNS and buffers what we need to stream.
 */
import http from 'node:http'
import https from 'node:https'
import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import { decodeProxySegment, encodeProxyPath } from './codec.ts'
import { allowlistRules } from './allowlist.ts'
import { validateTarget, resolveTargetAddress, pinnedLookup } from './target.ts'
import {
  applySetCookie,
  browserSetCookie,
  JAR_HEADER,
  mergeForRequest,
  parseJarHeader,
  parseSetCookie,
  serializeJar,
  cookiesFromHeader,
  type Jar,
} from './jar.ts'
import {
  buildDownstreamResponseHeaders,
  buildUpstreamRequestHeaders,
  documentPolicyHeaders,
  preflightResponse,
} from './headers.ts'
import { isCssType, isHtmlType, isJsType, isMediaType, rewriteCss, rewriteHtml, rewriteJs } from './rewrite.ts'
import { errorHtml, errorJson, wantsHtml, type ProxyErrorInfo } from './errors.ts'
import { originOf } from './origin.ts'
import { rateLimitFor } from './rate-limit.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CONNECT_TIMEOUT_MS = Number(process.env.GG_PROXY_CONNECT_TIMEOUT_MS || 10_000)
const HEADERS_TIMEOUT_MS = Number(process.env.GG_PROXY_HEADERS_TIMEOUT_MS || 20_000)
const BODY_HARD_CAP = Number(process.env.GG_PROXY_MAX_REWRITE_BYTES || 12 * 1024 * 1024)
const MAX_REQUEST_BYTES = Number(process.env.GG_PROXY_MAX_REQUEST_BYTES || 2 * 1024 * 1024)
const MAX_REDIRECTS = 6

type UpstreamResult = {
  status: number
  statusText: string
  headers: http.IncomingHttpHeaders
  /** Present for rewritable content (buffered, possibly decompressed). */
  buffered?: Buffer
  /** Present for streamed content. */
  stream?: NodeJS.ReadableStream
  /** Final URL after redirects (for base resolution). */
  finalUrl: URL
  /** True when we followed at least one redirect. */
  redirected: boolean
}

function respondError(request: Request, info: ProxyErrorInfo, jar: string | null, origin: string): Response {
  return wantsHtml(request)
    ? errorHtml(info, { origin, jar })
    : errorJson(info, jar)
}



/**
 * One upstream HTTP exchange with redirect following (each hop re-validated
 * against the allowlist + DNS policy) and per-class body handling.
 */
async function requestUpstream(opts: {
  method: string
  url: URL
  requestHeaders: Record<string, string>
  requestBody: Buffer | null
  address: { address: string; family: 4 | 6 }
  /** Buffered for these types (rewritten downstream). */
  rewritable: boolean
  redirectCount: number
  validate: (url: URL) => Promise<{ url: URL; rule: string }>
}): Promise<UpstreamResult> {
  const { method, url, requestHeaders, requestBody, address, rewritable, redirectCount } = opts
  const isHttps = url.protocol === 'https:'
  const lib = isHttps ? https : http
  const port = url.port ? Number(url.port) : isHttps ? 443 : 80

  return new Promise<UpstreamResult>((resolve, reject) => {
    let settled = false
    const fail = (err: Error) => {
      if (settled) return
      settled = true
      reject(err)
    }

    // Frame the body BEFORE http.request snapshots headers (it copies the
    // object at construction). Explicit Content-Length is mandatory for
    // methods like DELETE, where Node sends neither CL nor chunked framing
    // by default — unframed bodies make upstream parsers reply 400.
    const finalHeaders = { ...requestHeaders }
    if (requestBody && method !== 'GET' && method !== 'HEAD') {
      finalHeaders['content-length'] = String(requestBody.length)
    } else {
      delete finalHeaders['content-length']
    }

    const req = lib.request(
      {
        host: address.address,
        servername: isHttps ? url.hostname : undefined,
        port,
        path: url.pathname + url.search,
        method,
        headers: finalHeaders,
        lookup: pinnedLookup(address) as never,
        // SNI must use the hostname; agent defaults are fine for our volume.
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 502
        const location = res.headers.location
        // Follow redirects: re-validate the next hop before connecting.
        if ([301, 302, 303, 307, 308].includes(status) && location && redirectCount < MAX_REDIRECTS) {
          res.resume() // discard body
          let next: URL
          try {
            next = new URL(location, url)
          } catch {
            settled = true
            resolve({ status, statusText: res.statusMessage ?? '', headers: res.headers, finalUrl: url, redirected: true, stream: undefined })
            return
          }
          if (next.protocol !== 'http:' && next.protocol !== 'https:') {
            settled = true
            resolve({ status, statusText: res.statusMessage ?? '', headers: res.headers, finalUrl: url, redirected: true })
            return
          }
          settled = true
          // Async continuation outside this callback:
          ;(async () => {
            const validated = await opts.validate(next)
            const resolved = await resolveTargetAddress(validated.url)
            // Browser-faithful method handling across redirects.
            let methodAfter = method
            if (status === 303 && method !== 'HEAD') methodAfter = 'GET'
            else if ((status === 301 || status === 302) && method === 'POST') methodAfter = 'GET'
            const headersAfter = { ...requestHeaders }
            if (methodAfter === 'GET' || methodAfter === 'HEAD') {
              delete headersAfter['content-type']
              delete headersAfter['content-length']
            }
            return requestUpstream({
              method: methodAfter,
              url: validated.url,
              requestHeaders: headersAfter,
              requestBody: methodAfter === 'GET' || methodAfter === 'HEAD' ? null : requestBody,
              address: resolved,
              rewritable,
              redirectCount: redirectCount + 1,
              validate: opts.validate,
            })
          })().then(resolve, reject)
          return
        }

        const contentType = res.headers['content-type'] ?? null
        const ct = typeof contentType === 'string' ? contentType : null
        const rewritableBody = rewritable && (isHtmlType(ct) || isCssType(ct) || isJsType(ct))

        if (rewritableBody) {
          // Buffer + maybe decompress so we can rewrite safely.
          const encoding = String(res.headers['content-encoding'] || '').toLowerCase()
          const chunks: Buffer[] = []
          let total = 0
          let stream: NodeJS.ReadableStream = res
          if (encoding === 'gzip' || encoding === 'br' || encoding === 'deflate') {
            const dec = encoding === 'gzip' ? createGunzip() : encoding === 'br' ? createBrotliDecompress() : createInflate()
            res.pipe(dec)
            stream = dec
            // Decoding removed content-encoding/length downstream.
            res.headers['content-encoding'] = undefined
            delete res.headers['content-length']
          }
          stream.on('data', (chunk: Buffer) => {
            total += chunk.length
            if (total > BODY_HARD_CAP) {
              req.destroy(new Error('RESPONSE_TOO_LARGE'))
              return
            }
            chunks.push(chunk)
          })
          stream.on('end', () => {
            if (settled) return
            settled = true
            resolve({
              status,
              statusText: res.statusMessage ?? '',
              headers: res.headers,
              buffered: Buffer.concat(chunks),
              finalUrl: url,
              redirected: redirectCount > 0,
            })
          })
          stream.on('error', (err) => fail(err))
          res.on('error', (err) => fail(err))
          return
        }

        // Streamed path (media, JSON APIs, images…): no buffering.
        if (settled) return
        settled = true
        resolve({
          status,
          statusText: res.statusMessage ?? '',
          headers: res.headers,
          stream: res,
          finalUrl: url,
          redirected: redirectCount > 0,
        })
      },
    )

    req.setTimeout(HEADERS_TIMEOUT_MS, () => {
      req.destroy(Object.assign(new Error('Upstream timed out.'), { code: 'ETIMEDOUT' }))
    })
    req.on('error', fail)

    if (requestBody && method !== 'GET' && method !== 'HEAD') req.end(requestBody)
    else req.end()

    // Hard connect timeout in addition to socket idle timeout.
    const connectTimer = setTimeout(() => {
      if (!settled && !req.destroyed && !(req as unknown as { response?: unknown }).response) {
        req.destroy(Object.assign(new Error('Connection timed out.'), { code: 'ETIMEDOUT' }))
      }
    }, CONNECT_TIMEOUT_MS)
    req.on('socket', () => {
      req.on('response', () => clearTimeout(connectTimer))
    })
    req.on('close', () => clearTimeout(connectTimer))
  })
}

/**
 * Handle one proxied request. `segment` is the base64url target path piece.
 */
export async function handleProxyRequest(request: Request, segment: string): Promise<Response> {
  const origin = originOf(request)

  // CORS preflight for the proxy endpoint itself (sandboxed frames send Origin: null).
  if (request.method === 'OPTIONS') return preflightResponse(request, origin)

  // Per-client rate limit (best-effort per instance; Vercel edge sits in front).
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const limit = rateLimitFor(clientIp)
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: 'RATE_LIMITED', message: 'Too many proxy requests — slow down.' }), {
      status: 429,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'retry-after': String(limit.retryAfter),
        'cache-control': 'no-store',
      },
    })
  }

  const decoded = decodeProxySegment(segment)
  if (!decoded.ok) {
    const info: ProxyErrorInfo =
      decoded.reason === 'LOOP'
        ? { status: 400, code: 'LOOP', message: 'That address points back at the proxy itself.' }
        : decoded.reason === 'BAD_SCHEME'
          ? {
              status: 403,
              code: 'BAD_SCHEME',
              message: `Protocol "${decoded.scheme || 'unknown'}" is not allowed. Only http and https can be proxied.`,
            }
          : { status: 400, code: 'BAD_TARGET', message: 'That address could not be decoded.' }
    return respondError(request, info, null, origin)
  }

  const validated = validateTarget(decoded.href)
  if ('status' in validated) return respondError(request, validated, null, origin)

  const jarHeader = parseJarHeader(request.headers.get(JAR_HEADER))
  const rule = validated.rule
  const jarCookies = mergeForRequest(rule, cookiesFromHeader(request.headers.get('cookie'), rule), jarHeader)

  let resolved: Awaited<ReturnType<typeof resolveTargetAddress>>
  try {
    resolved = await resolveTargetAddress(validated.url)
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    const info: ProxyErrorInfo =
      e.code === 'PRIVATE_IP'
        ? { status: 403, code: 'PRIVATE_IP', message: 'That host resolves to a private network address.', host: validated.url.hostname }
        : {
            status: 502,
            code: 'DNS_FAILURE',
            message: `Could not resolve ${validated.url.hostname}.`,
            host: validated.url.hostname,
            hint: 'The lounge server could not look up this host. Check the address or try again.',
          }
    return respondError(request, info, null, origin)
  }

  const method = request.method.toUpperCase()
  const target = validated.url
  const accept = request.headers.get('accept') ?? ''
  const forMedia = !!request.headers.get('range') || /video|audio|media/i.test(accept)
  const built = buildUpstreamRequestHeaders({
    incoming: request.headers,
    method,
    target,
    rule,
    jarCookies,
    forMedia,
  })

  // Buffer request bodies (cap for safety; enables clean redirect retries).
  let requestBody: Buffer | null = null
  if (request.body && !['GET', 'HEAD'].includes(method)) {
    const chunks: Buffer[] = []
    let total = 0
    const reader = request.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_REQUEST_BYTES) {
        return respondError(
          request,
          { status: 413, code: 'REQUEST_TOO_LARGE', message: 'Request body exceeds the 2 MB proxy limit.' },
          null,
          origin,
        )
      }
      chunks.push(Buffer.from(value))
    }
    requestBody = Buffer.concat(chunks)
  }

  let result: UpstreamResult
  try {
    result = await requestUpstream({
      method,
      url: target,
      requestHeaders: built.headers,
      requestBody,
      address: resolved,
      rewritable: true,
      redirectCount: 0,
      validate: async (url) => {
        const v = validateTarget(url.href)
        if ('status' in v) {
          throw Object.assign(new Error(v.message), { code: 'REDIRECT_BLOCKED' })
        }
        return v
      },
    })
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'REDIRECT_BLOCKED') {
      const reason = (e as Error).message
      return respondError(
        request,
        {
          status: 508,
          code: 'REDIRECT_BLOCKED',
          message: 'The site redirected to a host this proxy does not support.',
          host: target.hostname,
          hint: reason,
        },
        null,
        origin,
      )
    }
    const info: ProxyErrorInfo =
      e.code === 'ETIMEDOUT'
        ? { status: 504, code: 'UPSTREAM_TIMEOUT', message: 'The site took too long to respond.', host: target.hostname }
        : e.message === 'RESPONSE_TOO_LARGE'
          ? {
              status: 502,
              code: 'RESPONSE_TOO_LARGE',
              message: 'That page is too large for the proxy to rewrite safely.',
              host: target.hostname,
              hint: 'Try a specific page instead of a heavy home page.',
            }
          : {
              status: 502,
              code: 'UPSTREAM_FAILED',
              message: `Could not reach ${target.hostname}.`,
              host: target.hostname,
              hint: 'The connection to the site failed. It may be down or blocking this server.',
            }
    console.warn('[proxy]', method, target.protocol + '//' + target.host + target.pathname, '→', e.code || e.message)
    return respondError(request, info, null, origin)
  }

  // Collect Set-Cookie lines (node gives us string[]).
  const rawSetCookie = result.headers['set-cookie']
  const setCookieLines = Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie ? [String(rawSetCookie)] : []
  const jar: Jar = {}
  // Preserve any cookies we already saw for this rule.
  for (const [k, v] of Object.entries(mergeForRequest(rule, built.seenCookies, jarHeader))) jar[rule] = { ...(jar[rule] ?? {}), [k]: v }
  const browserCookies: string[] = []
  const overHttps = request.url.startsWith('https://')
  for (const line of setCookieLines) {
    const parsed = parseSetCookie(line)
    if (!parsed) continue
    applySetCookie(jar, rule, parsed)
    const browser = browserSetCookie(rule, parsed, overHttps)
    if (browser) browserCookies.push(browser)
  }
  // Merge runtime jar for the response (so the client persists upstream cookies
  // even when the browser drops third-party cookies).
  const responseJar = serializeJar(jar)

  const contentTypeHeader = result.headers['content-type']
  const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader ?? null
  const html = isHtmlType(contentType)
  const css = isCssType(contentType)
  const js = isJsType(contentType) && !isMediaType(contentType)

  // CORS echo: sandboxed frames are Origin "null"; same-origin chrome passes its own.
  const reqOrigin = request.headers.get('origin')
  const corsOrigin = reqOrigin === 'null' || reqOrigin === origin ? reqOrigin : null

  const policy = documentPolicyHeaders()

  if ((html || css || js) && result.buffered) {
    const baseForRewrite = result.finalUrl.href
    let body: string
    const charset = /charset=([A-Za-z0-9_-]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase()
    const encoding = charset === 'utf-16' || charset === 'utf16' ? 'utf16le' : 'utf8'
    const text = result.buffered.toString(encoding as BufferEncoding)
    if (html) {
      const boot = JSON.stringify({
        origin,
        target: result.finalUrl.href,
        status: result.status,
        error: null,
        jar: jarHeader,
        rule,
        // Parent-domain list the runtime uses to namespace document.cookie.
        rules: allowlistRules().map((r) => r.domain),
      })
      body = rewriteHtml(text, { baseHref: baseForRewrite, boot, status: result.status })
    } else if (css) {
      body = rewriteCss(text, baseForRewrite)
    } else {
      body = rewriteJs(text).code
    }
    const { headers } = buildDownstreamResponseHeaders({
      upstream: result.headers,
      setCookieLines,
      rule,
      overHttps,
      rewrote: true,
      corsOrigin: html ? corsOrigin : corsOrigin,
      browserJar: responseJar,
    })
    if (html) {
      headers.set('content-type', contentType ?? 'text/html; charset=utf-8')
      headers.set('content-security-policy', policy.csp)
      headers.set('referrer-policy', policy.referrerPolicy)
    }
    headers.set('x-gg-status', String(result.status))
    const out = new Response(body, { status: result.status, statusText: result.statusText || 'OK', headers })
    for (const c of browserCookies) out.headers.append('set-cookie', c)
    return out
  }

  // If any redirect still survives (max hops exceeded / no Location), rewrite
  // Location so the browser never escapes the proxy.
  if ([301, 302, 303, 307, 308].includes(result.status)) {
    const loc = result.headers.location
    if (loc) {
      try {
        const next = new URL(loc, result.finalUrl)
        const v = validateTarget(next.href)
        if (!('status' in v)) {
          const out = new Response(null, {
            status: result.status,
            headers: { location: encodeProxyPath(v.url), 'cache-control': 'no-store' },
          })
          return out
        }
      } catch {
        /* fall through to error below */
      }
    }
    return respondError(
      request,
      {
        status: 508,
        code: 'REDIRECT_BLOCKED',
        message: 'The site redirected to a host this proxy does not support.',
        host: target.hostname,
      },
      null,
      origin,
    )
  }

  // Streamed response: byte-faithful, Range/206 preserved.
  const { headers } = buildDownstreamResponseHeaders({
    upstream: result.headers,
    setCookieLines,
    rule,
    overHttps,
    rewrote: false,
    corsOrigin,
    browserJar: responseJar,
  })
  headers.set('x-gg-status', String(result.status))
  const body =
    result.stream && method !== 'HEAD' && ![204, 205, 304].includes(result.status)
      ? (Readable.toWeb(result.stream as Readable) as ReadableStream<Uint8Array>)
      : null
  if (!body && result.stream && typeof (result.stream as Readable).resume === 'function') {
    ;(result.stream as Readable).resume()
  }
  const out = new Response(body, {
    status: result.status,
    statusText: result.statusText || 'OK',
    headers,
  })
  for (const c of browserCookies) out.headers.append('set-cookie', c)
  return out
}
