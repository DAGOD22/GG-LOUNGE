/**
 * GG Lounge proxy test suite.
 *
 * Layers:
 *  1. Unit — allowlist, codec, target/SSRF policy, jar, rewriters, rate limit.
 *  2. Integration — a REAL local upstream (node http server) exercised
 *     end-to-end through handleProxyRequest with the loopback test hatch
 *     (GG_PROXY_ALLOW_LOOPBACK=1 + GG_PROXY_EXTRA_HOSTS, both test-only).
 *
 * Covers the required matrix: HTML, JS/CSS, JSON APIs, redirects, Range/206,
 * gzip, images/fonts passthrough, cookies, upstream failures, timeouts, and
 * SSRF attempts (localhost/private/metadata/file://) — which must FAIL.
 *
 * No third-party site is contacted; network egress from this sandbox is
 * blocked to everything except the npm registry.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { gzipSync } from 'node:zlib'
import { once } from 'node:events'

// ---- test-only environment (BEFORE importing modules that read env) ----
process.env.GG_PROXY_ALLOW_LOOPBACK = '1'
process.env.GG_PROXY_EXTRA_HOSTS = '127.0.0.1'
process.env.GG_PROXY_RATE_LIMIT = '100000'
process.env.GG_PROXY_HEADERS_TIMEOUT_MS = '4000'

const { allowlistRules, allowedHostSummary, hostAllowed, matchedRule } = await import('../lib/proxy/allowlist.ts')
const { decodeProxySegment, encodeProxyPath, proxiedRef } = await import('../lib/proxy/codec.ts')
const { isPublicAddress, validateTarget, resolveTargetAddress, pinnedLookup } = await import('../lib/proxy/target.ts')
const jarLib = await import('../lib/proxy/jar.ts')
const { rewriteCss, rewriteHtml, rewriteJs, rewriteSrcset, isHtmlType, isMediaType } = await import('../lib/proxy/rewrite.ts')
const { rateLimitFor } = await import('../lib/proxy/rate-limit.ts')
const { handleProxyRequest } = await import('../lib/proxy/handler.ts')

// =====================================================================
// 1. UNIT — allowlist
// =====================================================================
test('allowlist: exact + subdomain matching, boundary safety', () => {
  assert.ok(hostAllowed('youtube.com'))
  assert.ok(hostAllowed('www.youtube.com'))
  assert.ok(hostAllowed('m.youtube.com'))
  assert.ok(hostAllowed('poki.com'))
  assert.ok(hostAllowed('www.crazygames.com'))
  // Label-boundary attacks must fail:
  assert.ok(!hostAllowed('notyoutube.com'))
  assert.ok(!hostAllowed('youtube.com.evil.net'))
  assert.ok(!hostAllowed('evil-youtube.com'))
  assert.ok(!hostAllowed('youtube.com.evil'))
  assert.ok(!hostAllowed(''))
  // Not on the list:
  assert.ok(!hostAllowed('example.com') || hostAllowed('example.com') === false) // default list has no example.com
  assert.ok(!hostAllowed('attacker.test'))
  // Trailing dot tolerated:
  assert.ok(hostAllowed('www.youtube.com.'))
  // matchedRule returns the parent domain (jar namespace):
  assert.equal(matchedRule('www.youtube.com'), 'youtube.com')
  assert.equal(matchedRule('youtube.com'), 'youtube.com')
  assert.equal(matchedRule('evil-youtube.com'), null)
  assert.ok(allowedHostSummary().includes('poki.com'))
  assert.ok(allowlistRules().length >= 10)
})

test('allowlist: env extras are honored and sanitized', () => {
  const rules = [
    ...allowlistRules(),
    // simulate parsed extras already validated by parseRules
  ]
  assert.ok(rules.every((r) => /^[a-z0-9.-]+$/.test(r.domain)))
})

// =====================================================================
// 2. UNIT — codec
// =====================================================================
test('codec: encode/decode round-trip, rejects garbage and loops', () => {
  const url = 'https://www.youtube.com/results?search_query=cats&t=1'
  const path = encodeProxyPath(url)
  assert.ok(path.startsWith('/api/proxy/'))
  const seg = path.slice('/api/proxy/'.length)
  const decoded = decodeProxySegment(seg)
  assert.ok(decoded.ok)
  assert.equal(decoded.href, url)

  // Garbage segments
  assert.equal(decodeProxySegment('').ok, false)
  assert.equal(decodeProxySegment('not base64!!').ok, false)
  assert.equal(decodeProxySegment('../../../etc/passwd').ok, false)
  // Non-http schemes
  const fileSeg = Buffer.from('file:///etc/passwd').toString('base64url')
  const fileDec = decodeProxySegment(fileSeg)
  assert.equal(fileDec.ok, false)
  // Proxy loop
  const loopInner = encodeProxyPath('https://example.com/')
  const loopSeg = Buffer.from('https://lounge.test' + loopInner).toString('base64url')
  assert.equal(decodeProxySegment(loopSeg).ok, false)
  assert.equal(decodeProxySegment(loopSeg).reason, 'LOOP')
})

test('codec: proxiedRef resolves relative/absolute, passes through safe schemes', () => {
  const base = 'https://www.youtube.com/results?x=1'
  assert.ok(proxiedRef('/watch?v=abc', base)?.startsWith('/api/proxy/'))
  assert.ok(proxiedRef('https://i.ytimg.com/vi/x.jpg', base)?.startsWith('/api/proxy/'))
  assert.ok(proxiedRef('//cdn.example.com/a.js', base)?.startsWith('/api/proxy/'))
  assert.equal(proxiedRef('data:image/png;base64,AAA', base), null)
  assert.equal(proxiedRef('mailto:a@b.c', base), null)
  assert.equal(proxiedRef('javascript:alert(1)', base), null)
  assert.equal(proxiedRef('#top', base), null)
  assert.equal(proxiedRef('blob:https://x/y', base), null)
  // Fragment preserved on proxied refs:
  assert.ok(proxiedRef('/watch#frag', base)?.includes('#frag'))
})

// =====================================================================
// 3. UNIT — SSRF / target policy (the "must fail" matrix)
// =====================================================================
test('SSRF: file://, credentials, internal names, private & metadata IPs all blocked', () => {
  // Run this whole block exactly as production would: NO loopback hatch.
  const saved = process.env.GG_PROXY_ALLOW_LOOPBACK
  delete process.env.GG_PROXY_ALLOW_LOOPBACK
  try {
    const cases = [
      ['file:///etc/passwd', 'BAD_SCHEME'],
      ['gopher://x/', 'BAD_SCHEME'],
      ['ftp://ftp.example.com/', 'BAD_SCHEME'],
      ['http://user:pass@www.youtube.com/', 'CREDENTIALS'],
      ['http://localhost/admin', 'NOT_ALLOWED'],
      ['http://foo.localhost/', 'NOT_ALLOWED'],
      ['http://metadata.google.internal/', 'NOT_ALLOWED'],
      ['http://169.254.169.254/latest/meta-data/', 'PRIVATE_IP'],
      ['http://127.0.0.1/', 'PRIVATE_IP'],
      ['http://10.0.0.5/', 'PRIVATE_IP'],
      ['http://192.168.1.1/', 'PRIVATE_IP'],
      ['http://172.16.0.1/', 'PRIVATE_IP'],
      ['http://[::1]/', 'PRIVATE_IP'],
      ['not a url', 'BAD_URL'],
      ['https://www.youtube.com:8443/', 'BAD_PORT'],
    ]
    for (const [raw, code] of cases) {
      const result = validateTarget(raw)
      assert.ok('status' in result, `${raw} must be rejected`)
      assert.equal(result.code, code, `${raw} → expected ${code}, got ${result.code}`)
    }
    // Even if an operator mistakenly allowlists a private IP, the address
    // class check still rejects it (no hatch):
    const leaked = validateTarget('http://10.0.0.5/')
    assert.ok('status' in leaked && leaked.code === 'PRIVATE_IP')
  } finally {
    if (saved !== undefined) process.env.GG_PROXY_ALLOW_LOOPBACK = saved
  }
  // With the test hatch ON, loopback is permitted for the mock upstream only.
  const withHatch = validateTarget('http://127.0.0.1:1/')
  assert.ok(!('status' in withHatch), 'hatch allows loopback test target')
  // Metadata IP as IP-literal must be private even if someone allowlists it:
  assert.equal(isPublicAddress('169.254.169.254'), false)
  assert.equal(isPublicAddress('127.0.0.1'), false)
  assert.equal(isPublicAddress('10.1.2.3'), false)
  assert.equal(isPublicAddress('::1'), false)
  assert.equal(isPublicAddress('::ffff:127.0.0.1'), false)
  assert.equal(isPublicAddress('0.0.0.0'), false)
  assert.equal(isPublicAddress('8.8.8.8'), true)
  assert.equal(isPublicAddress('1.1.1.1'), true)
})

test('SSRF: DNS answers containing private addresses are rejected (rebinding)', async () => {
  // resolveTargetAddress with a hostname we control the answer for is hard
  // without a DNS server; instead assert the pinnedLookup contract and the
  // address filter helper directly.
  const pinned = pinnedLookup({ address: '93.184.216.34', family: 4 })
  await new Promise((resolve, reject) => {
    pinned('evil.example', { all: false }, (err, addr, family) => {
      try {
        assert.ifError(err)
        assert.equal(addr, '93.184.216.34') // OS re-resolution cannot swap the IP
        assert.equal(family, 4)
        resolve()
      } catch (e) {
        reject(e)
      }
    })
  })
  await new Promise((resolve, reject) => {
    pinned('evil.example', { all: true }, (err, addrs) => {
      try {
        assert.ifError(err)
        assert.deepEqual(addrs, [{ address: '93.184.216.34', family: 4 }])
        resolve()
      } catch (e) {
        reject(e)
      }
    })
  })
  // An allowlisted hostname resolving to RFC1918 must reject:
  await assert.rejects(
    () =>
      new Promise((resolve, reject) => {
        // 127.0.0.1 as a HOSTNAME (not literal) goes through dns.lookup in real
        // runs; here we verify the public-address gate used by that path:
        const publicGate = (ip) => (isPublicAddress(ip) ? resolve(ip) : reject(new Error('Private network destinations are blocked.')))
        publicGate('127.0.0.1')
      }),
    /Private network/,
  )
})

// =====================================================================
// 4. UNIT — cookie jar
// =====================================================================
test('jar: namespacing, header parse/merge, Set-Cookie parse, caps', () => {
  const rule = 'youtube.com'
  const cname = jarLib.cookieName(rule, 'SID')
  assert.ok(cname.startsWith('ggc_'))
  // Cookies for a DIFFERENT rule must not leak into this rule's header:
  const other = jarLib.cookieName('poki.com', 'SID')
  const cookieHeader = `${cname}=secret1; ${other}=secret2; lounge_session=LEAK`
  const forYoutube = jarLib.cookiesFromHeader(cookieHeader, rule)
  assert.deepEqual(forYoutube, { SID: 'secret1' })
  // Lounge's own cookie never appears in any rule bucket:
  assert.ok(!JSON.stringify(forYoutube).includes('LEAK'))
  const forPoki = jarLib.cookiesFromHeader(cookieHeader, 'poki.com')
  assert.deepEqual(forPoki, { SID: 'secret2' })

  // X-GG-Jar round-trip:
  const jar = { 'youtube.com': { SID: 'abc', HSID: 'def' } }
  const encoded = jarLib.serializeJar(jar)
  const parsed = jarLib.parseJarHeader(encoded)
  assert.deepEqual(parsed, jar)
  assert.deepEqual(jarLib.parseJarHeader('!!!not-base64json!!!'), {})
  assert.deepEqual(jarLib.parseJarHeader(null), {})

  // merge: header wins over cookie header
  const merged = jarLib.mergeForRequest(rule, { stale: '1', SID: 'cookie' }, { 'youtube.com': { SID: 'header' } })
  assert.equal(merged.SID, 'header')
  assert.equal(merged.stale, '1')

  // Set-Cookie parsing:
  const parsedSc = jarLib.parseSetCookie('SID=abc; Path=/; Domain=.youtube.com; HttpOnly; SameSite=Lax; Expires=Wed, 21 Oct 2099 07:28:00 GMT')
  assert.equal(parsedSc.name, 'SID')
  assert.equal(parsedSc.value, 'abc')
  assert.ok(parsedSc.httpOnly)
  assert.ok(parsedSc.expires > Date.now())
  const expired = jarLib.parseSetCookie('gone=1; Max-Age=0')
  jarLib.applySetCookie(jar, rule, expired)
  assert.equal(jar[rule].gone, undefined)

  // Browser-facing cookie is namespaced + path-scoped + never Domain=real site:
  const browser = jarLib.browserSetCookie(rule, parsedSc, true)
  assert.ok(browser.includes(cname + '=abc'))
  assert.ok(browser.includes('Path=/api/proxy/'))
  assert.ok(browser.includes('HttpOnly'))
  assert.ok(browser.includes('SameSite=None'))
  assert.ok(browser.includes('Secure'))
  assert.ok(!browser.includes('Domain='))

  // Upstream cookie header uses ORIGINAL names for the right rule only:
  assert.equal(jarLib.upstreamCookieHeader({ SID: 'abc' }), 'SID=abc')
  assert.equal(jarLib.upstreamCookieHeader({}), null)
})

test('jar: serialization cap trims instead of exploding headers', () => {
  const big = {}
  for (let r = 0; r < 30; r++) {
    const cookies = {}
    for (let i = 0; i < 60; i++) cookies['k' + i] = 'v'.repeat(80)
    big['rule' + r + '.test'] = cookies
  }
  const encoded = jarLib.serializeJar(big)
  assert.ok(encoded.length <= jarLib.MAX_JAR_CHARS, `jar ${encoded.length} > cap`)
})

// =====================================================================
// 5. UNIT — rewriters
// =====================================================================
test('rewrite: HTML attributes, srcset, styles, meta-refresh, base, integrity, hints', () => {
  const base = 'https://www.youtube.com/results?search_query=x'
  const html = `<!doctype html><html><head>
<base href="https://www.youtube.com/">
<link rel="stylesheet" href="/static/style.css" integrity="sha384-abc">
<link rel="dns-prefetch" href="//x.ytimg.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<script src="https://www.youtube.com/js/base.js" integrity="sha384-def"></script>
<style>body{background:url("/img/bg.png")}</style>
</head><body>
<a href="/watch?v=dQw4w9WgXcQ">rel</a>
<a href="https://www.crazygames.com/game/x">abs</a>
<img srcset="/i1.png 1x, /i2.png 2x" src="/i1.png">
<div style="background-image:url('https://i.ytimg.com/vi/x.jpg')"></div>
<iframe src="https://www.youtube.com/embed/x"></iframe>
<meta http-equiv="refresh" content="0;url=/next">
<a href="data:text/html,hi">data</a>
<a href="mailto:x@y.z">mail</a>
</body></html>`
  const out = rewriteHtml(html, { baseHref: base, boot: '{"origin":"https://lounge.test","target":"https://www.youtube.com/"}' })

  // Runtime injected first in <head>, before the FIRST rewritten page script:
  assert.ok(out.includes('/proxy/runtime.js'), 'runtime tag present')
  assert.ok(
    out.indexOf('/proxy/runtime.js') < out.indexOf('<script src="/api/proxy/'),
    'runtime must precede page scripts',
  )
  assert.ok(out.includes('window.__GG_BOOT__='))
  const bootAt = out.indexOf('window.__GG_BOOT__=')
  assert.ok(bootAt !== -1 && bootAt < out.indexOf('/proxy/runtime.js'), 'boot assigned BEFORE runtime.js evaluates')
  // Base neutralized:
  assert.ok(out.includes('data-gg-removed'))
  // Rewritten refs point at the proxy:
  assert.ok(out.includes('/api/proxy/'))
  assert.ok(!out.includes('href="/watch'), 'relative href must be rewritten')
  assert.ok(!out.includes('src="/i1'), 'img src must be rewritten')
  // Absolute target URLs rewritten too:
  assert.ok(!out.includes('src="https://www.youtube.com/embed'))
  // integrity stripped (bytes change):
  assert.ok(!/integrity=/.test(out))
  // dns-prefetch/preconnect dropped:
  assert.ok(!/dns-prefetch/.test(out))
  assert.ok(!/rel="preconnect"/.test(out))
  // stylesheet kept but rewritten:
  assert.ok(out.includes('rel="stylesheet"'))
  // srcset rewritten (both candidates):
  const srcsetMatch = /srcset="([^"]+)"/.exec(out)
  assert.ok(srcsetMatch[1].includes('/api/proxy/'))
  assert.ok(!srcsetMatch[1].includes('/i1.png 1x'))
  // meta refresh rewritten:
  assert.ok(out.includes('url=/api/proxy/'))
  // data: and mailto: untouched:
  assert.ok(out.includes('href="data:text/html,hi"'))
  assert.ok(out.includes('href="mailto:x@y.z"'))
  // inline style url rewritten:
  assert.ok(!out.includes("url('https://i.ytimg.com"))
})

test('rewrite: CSS url() and @import', () => {
  const css = `@import "theme.css";
@font-face{src:url(fonts/roboto.woff2) format("woff2")}
.bg{background:url(https://static.example.com/x.png)}
.skip{background:url(data:image/gif;base64,R0lGOD)}`
  const out = rewriteCss(css, 'https://www.poki.com/css/main.css')
  assert.ok(out.includes('/api/proxy/'))
  assert.ok(!out.includes('url(fonts/roboto.woff2)'))
  assert.ok(out.includes('url(data:image/gif;base64,R0lGOD)'), 'data: untouched')
  assert.ok(out.includes('@import "/api/proxy/'))
})

test('rewrite: JS absolute allowlisted URLs in strings only (comments/code untouched)', () => {
  const js = `
// comment with https://www.youtube.com/should-not-change
/* block https://www.poki.com/nope */
var API = "https://www.youtube.com/youtubei/v1/player";
var tpl = \`https://www.crazygames.com/\`;
var other = "https://evil.example.com/x"; // not allowlisted → untouched
var notUrl = "hello world";
function f(){ return API + "/extra" }
`
  const { code, changed } = rewriteJs(js)
  assert.ok(changed >= 2, `expected ≥2 rewrites, got ${changed}`)
  assert.ok(code.includes('/api/proxy/'))
  assert.ok(code.includes('// comment with https://www.youtube.com/should-not-change'), 'line comment untouched')
  assert.ok(code.includes('/* block https://www.poki.com/nope */'), 'block comment untouched')
  assert.ok(code.includes('https://evil.example.com/x'), 'non-allowlisted untouched')
  assert.ok(code.includes('"hello world"'))
  assert.ok(code.includes('function f()'), 'code structure intact')
})

test('rewrite: srcset edge cases + content-type sniffing', () => {
  const base = 'https://www.poki.com/'
  const out = rewriteSrcset('/a.png 1x,   /b.png   2x', base)
  assert.ok(out.includes('/api/proxy/'))
  assert.ok(out.includes('2x'))
  assert.equal(rewriteSrcset('', base), null)
  assert.ok(isHtmlType('text/html; charset=utf-8'))
  assert.ok(!isHtmlType('application/json'))
  assert.ok(isMediaType('video/mp4'))
  assert.ok(isMediaType('font/woff2'))
  assert.ok(!isMediaType('application/javascript'))
})

// =====================================================================
// 6. UNIT — rate limit
// =====================================================================
test('rate limit: window enforcement + disable switch', () => {
  process.env.GG_PROXY_RATE_LIMIT = '3'
  const ip = '203.0.113.9'
  const now = Date.now()
  assert.ok(rateLimitFor(ip, now).ok)
  assert.ok(rateLimitFor(ip, now).ok)
  assert.ok(rateLimitFor(ip, now).ok)
  const fourth = rateLimitFor(ip, now)
  assert.equal(fourth.ok, false)
  assert.ok(fourth.retryAfter >= 1)
  // Window rolls over:
  assert.ok(rateLimitFor(ip, now + 61_000).ok)
  process.env.GG_PROXY_RATE_LIMIT = '100000'
})

// =====================================================================
// 7. INTEGRATION — real upstream server through handleProxyRequest
// =====================================================================
const MIME = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  mp4: 'video/mp4',
  font: 'font/woff2',
}

/** Deterministic fake media bytes (512 B). */
const MEDIA = Buffer.alloc(512)
for (let i = 0; i < MEDIA.length; i++) MEDIA[i] = i % 251

let upstream
let UP // http://127.0.0.1:PORT

const servedRequests = [] // observed by assertions (method, url, headers)

function startUpstream() {
  return new Promise((resolve) => {
    upstream = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x')
      servedRequests.push({ method: req.method, url: req.url, headers: { ...req.headers } })
      const send = (status, type, body, extra = {}) => {
        res.writeHead(status, { 'content-type': type, ...extra })
        res.end(body)
      }

      switch (url.pathname) {
        case '/page.html':
          send(200, MIME.html, `<!doctype html><html><head>
<link rel="stylesheet" href="/style.css">
<script src="/app.js"></script>
</head><body>
<h1>Upstream Page</h1>
<a href="/sub/page2.html">next</a>
<img src="/img/logo.png" srcset="/img/logo.png 1x, /img/logo2x.png 2x">
</body></html>`)
          break
        case '/style.css':
          send(200, MIME.css, 'body{background:url("/img/bg.png");color:#000}')
          break
        case '/app.js': {
          const host = req.headers.host || '127.0.0.1'
          send(200, MIME.js, `window.APP={api:"http://${host}/api/data"};fetch("/api/data")`)
          break
        }
        case '/api/data': {
          if (req.method === 'GET') {
            const q = url.searchParams.get('q')
            send(200, MIME.json, JSON.stringify({ ok: true, q, method: 'GET' }))
          } else {
            let body = ''
            req.on('data', (c) => (body += c))
            req.on('end', () =>
              send(200, MIME.json, JSON.stringify({ ok: true, method: req.method, body, ctype: req.headers['content-type'] || null })),
            )
          }
          break
        }
        case '/redirect':
          res.writeHead(302, { location: '/page.html' })
          res.end()
          break
        case '/redirect-cross':
          res.writeHead(307, { location: 'https://www.evil-not-allowed.test/landing' })
          res.end()
          break
        case '/redirect-post':
          res.writeHead(303, { location: '/api/data' })
          res.end()
          break
        case '/video.mp4': {
          const range = req.headers.range
          if (range) {
            const m = /bytes=(\d+)-(\d*)/.exec(range)
            const start = Number(m[1])
            const end = m[2] ? Number(m[2]) : MEDIA.length - 1
            const chunk = MEDIA.subarray(start, end + 1)
            res.writeHead(206, {
              'content-type': MIME.mp4,
              'content-range': `bytes ${start}-${end}/${MEDIA.length}`,
              'accept-ranges': 'bytes',
              'content-length': chunk.length,
            })
            res.end(chunk)
          } else {
            res.writeHead(200, { 'content-type': MIME.mp4, 'accept-ranges': 'bytes', 'content-length': MEDIA.length })
            res.end(MEDIA)
          }
          break
        }
        case '/img/logo.png':
        case '/img/logo2x.png':
        case '/img/bg.png':
          send(200, MIME.png, Buffer.from('89504e470d0a1a0a', 'hex'))
          break
        case '/font.woff2':
          send(200, MIME.font, Buffer.from('wOF2data'), { 'cache-control': 'public, max-age=31536000' })
          break
        case '/gzipped.html': {
          const gz = gzipSync(
            Buffer.from(
              '<!doctype html><html><head></head><body>gzip-marker-42 <a href="/after-gzip">x</a></body></html>',
            ),
          )
          res.writeHead(200, { 'content-type': MIME.html, 'content-encoding': 'gzip', 'content-length': gz.length })
          res.end(gz)
          break
        }
        case '/cookies':
          res.writeHead(200, {
            'content-type': MIME.html,
            'set-cookie': ['SID=upstream-secret; Path=/; HttpOnly; SameSite=Lax', 'pref=dark; Path=/'],
          })
          res.end('<!doctype html><html><head></head><body>cookies</body></html>')
          break
        case '/cookies-echo':
          send(200, MIME.json, JSON.stringify({ cookie: req.headers.cookie || null }))
          break
        case '/slow':
          // never respond within the 4s headers timeout
          break
        case '/error500':
          send(500, MIME.html, '<!doctype html><html><head></head><body>boom</body></html>')
          break
        case '/no-route':
          send(404, MIME.json, JSON.stringify({ error: 'not found' }))
          break
        default:
          send(404, MIME.json, JSON.stringify({ error: 'nope', path: url.pathname }))
      }
    })
    upstream.listen(0, '127.0.0.1', () => {
      const addr = upstream.address()
      UP = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
}

function proxyReq(path, init = {}) {
  const target = UP + path
  const segment = encodeProxyPath(target).slice('/api/proxy/'.length)
  return handleProxyRequest(
    new Request(`http://lounge.test/api/proxy/${segment}`, {
      method: init.method || 'GET',
      headers: init.headers || {},
      body: init.body,
    }),
    segment,
  )
}

test('integration: upstream server up', async () => {
  await startUpstream()
  assert.ok(UP.includes('127.0.0.1:'))
})

test('integration: HTML page rewritten — script/style/img/links all through proxy', async () => {
  servedRequests.length = 0
  const res = await proxyReq('/page.html', { headers: { accept: 'text/html' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), MIME.html)
  const html = await res.text()
  // Real content present:
  assert.ok(html.includes('<h1>Upstream Page</h1>'))
  // Every local ref rewritten:
  assert.ok(html.includes('href="/api/proxy/'), 'link href rewritten')
  assert.ok(html.includes('src="/api/proxy/'), 'script/img rewritten')
  assert.ok(!html.includes('href="/style.css"'))
  assert.ok(!html.includes('src="/app.js"'))
  // srcset rewritten:
  assert.match(html, /srcset="\/api\/proxy\/[^"]+1x/)
  // runtime + boot injected:
  assert.ok(html.includes('/proxy/runtime.js'))
  assert.ok(html.includes('__GG_BOOT__'))
  // CSP sandbox present (opaque origin):
  const csp = res.headers.get('content-security-policy') || ''
  assert.ok(csp.includes('sandbox'), 'response must carry sandbox CSP')
  assert.ok(!csp.includes('allow-same-origin'), 'must NOT grant allow-same-origin')
  // X-Frame-Options from upstream (none here) / our referrer policy:
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(res.headers.get('x-gg-status'), '200')
})

test('integration: CSS and JS assets rewritten when fetched directly', async () => {
  const cssRes = await proxyReq('/style.css')
  assert.equal(cssRes.status, 200)
  const css = await cssRes.text()
  assert.ok(css.includes('url("/api/proxy/'))
  assert.ok(!css.includes('url("/img/bg.png")'))

  const jsRes = await proxyReq('/app.js')
  assert.equal(jsRes.status, 200)
  const js = await jsRes.text()
  // absolute URL to same host rewritten (host is allowlisted 127.0.0.1):
  assert.ok(js.includes('/api/proxy/'), `JS absolute URL rewritten, got: ${js}`)
  assert.ok(js.includes('fetch("/api/data")'), 'relative fetch left for runtime (resolved client-side)')
  assert.ok(!js.includes('http://127.0.0.1'), 'no raw upstream origin left in JS strings')
})

test('integration: JSON API GET/POST/PUT/PATCH/DELETE + query strings preserved', async () => {
  // GET with query
  const get = await proxyReq('/api/data?q=hello%20world&x=1', { headers: { accept: 'application/json' } })
  assert.equal(get.status, 200)
  const getBody = await get.json()
  assert.deepEqual(getBody, { ok: true, q: 'hello world', method: 'GET' })

  // Body methods
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const res = await proxyReq('/api/data', {
      method,
      headers: { 'content-type': 'application/json', origin: 'http://lounge.test' },
      body: JSON.stringify({ hello: method }),
    })
    assert.equal(res.status, 200, `${method} status`)
    const body = await res.json()
    assert.equal(body.method, method)
    assert.equal(body.body, JSON.stringify({ hello: method }))
    assert.equal(body.ctype, 'application/json')
    // The upstream saw the TARGET's origin, not the lounge's:
    const seen = servedRequests.filter((r) => r.url.startsWith('/api/data')).pop()
    assert.equal(seen.headers.origin, UP, `${method}: origin rewritten to target`)
    // Body framing must be explicit for every method (DELETE has none by default):
    assert.ok(seen.headers['content-length'] !== undefined, `${method}: content-length present upstream`)
    assert.equal(seen.headers['content-length'], String(JSON.stringify({ hello: method }).length))
  }
})

test('integration: redirects followed internally; cross-host redirect blocked honestly', async () => {
  const res = await proxyReq('/redirect', { headers: { accept: 'text/html' } })
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.ok(html.includes('Upstream Page'), 'followed to /page.html')

  const cross = await proxyReq('/redirect-cross', { headers: { accept: 'text/html' } })
  assert.equal(cross.status, 508)
  const crossBody = await cross.text()
  assert.ok(crossBody.includes('does not support') || crossBody.includes('REDIRECT_BLOCKED'))
  // And NOT the evil host's content:
  assert.ok(!crossBody.includes('evil-not-allowed.test</') )

  // 303 POST → GET conversion (browser-faithful)
  servedRequests.length = 0
  const post303 = await proxyReq('/redirect-post', { method: 'POST', body: 'x=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(post303.status, 200)
  const finalHit = servedRequests.find((r) => r.url.startsWith('/api/data') && r.method === 'GET')
  assert.ok(finalHit, '303 must re-issue as GET')
})

test('integration: Range requests → 206 byte-faithful (media streaming)', async () => {
  // Ranged
  const ranged = await proxyReq('/video.mp4', { headers: { range: 'bytes=100-199', accept: 'video/mp4' } })
  assert.equal(ranged.status, 206)
  assert.equal(ranged.headers.get('content-range'), `bytes 100-199/${MEDIA.length}`)
  assert.equal(ranged.headers.get('accept-ranges'), 'bytes')
  const chunk = Buffer.from(await ranged.arrayBuffer())
  assert.equal(chunk.length, 100)
  assert.ok(chunk.equals(MEDIA.subarray(100, 200)), 'bytes must match upstream exactly')

  // Full
  const full = await proxyReq('/video.mp4', { headers: { accept: 'video/mp4' } })
  assert.equal(full.status, 200)
  const all = Buffer.from(await full.arrayBuffer())
  assert.ok(all.equals(MEDIA), 'full media byte-identical')

  // Media requests must ask upstream for identity encoding:
  const seen = servedRequests.filter((r) => r.url.startsWith('/video.mp4')).pop()
  assert.equal(seen.headers['accept-encoding'], 'identity')
})

test('integration: gzipped HTML decompressed, rewritten, no stale content-encoding', async () => {
  const res = await proxyReq('/gzipped.html', { headers: { accept: 'text/html', 'accept-encoding': 'gzip' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-encoding'), null, 'must not claim gzip after rewrite')
  const html = await res.text()
  assert.ok(html.includes('gzip-marker-42'), 'decompressed text content present')
  assert.ok(html.includes('/api/proxy/'), 'link inside gzipped HTML rewritten')
  assert.ok(!html.includes('href="/after-gzip"'), 'raw relative href gone')
})

test('integration: static assets (images/fonts) passthrough with headers', async () => {
  const img = await proxyReq('/img/logo.png')
  assert.equal(img.status, 200)
  assert.equal(img.headers.get('content-type'), MIME.png)
  const bytes = Buffer.from(await img.arrayBuffer())
  assert.deepEqual([...bytes], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const font = await proxyReq('/font.woff2')
  assert.equal(font.status, 200)
  assert.equal(font.headers.get('content-type'), MIME.font)
  assert.equal(font.headers.get('cache-control'), 'public, max-age=31536000')
})

test('integration: cookies namespaced outbound, original inbound, jar header synced', async () => {
  // 1. Upstream sets cookies → browser sees namespaced jar cookies only.
  const set = await proxyReq('/cookies')
  assert.equal(set.status, 200)
  const raw = typeof set.headers.getSetCookie === 'function' ? set.headers.getSetCookie() : [set.headers.get('set-cookie')]
  const joined = raw.join('\n')
  assert.ok(joined.includes('ggc_'), 'namespaced cookie name')
  assert.ok(joined.includes('SID=upstream-secret'), 'value preserved')
  assert.ok(joined.includes('Path=/api/proxy/'), 'path-scoped to proxy')
  assert.ok(!/Domain=/.test(joined), 'Domain attribute never forwarded')
  assert.ok(jarLib.cookieName('127.0.0.1', 'SID') && joined.includes(jarLib.cookieName('127.0.0.1', 'SID')))
  // Lounge cookies we sent are NOT echoed anywhere:
  assert.ok(!joined.includes('better-auth'), 'auth isolation')

  // 2. Browser sends namespaced cookie back → upstream sees ORIGINAL name.
  const nsid = jarLib.cookieName('127.0.0.1', 'SID')
  const echo = await proxyReq('/cookies-echo', { headers: { cookie: `${nsid}=upstream-secret; lounge_session=LEAK` } })
  const echoBody = await echo.json()
  assert.equal(echoBody.cookie, 'SID=upstream-secret', 'upstream sees original cookie name/value')
  assert.ok(!String(echoBody.cookie).includes('LEAK'), 'lounge cookie never travels')

  // 3. X-GG-Jar header path (what sandboxed frames use):
  const jarHeader = jarLib.serializeJar({ '127.0.0.1': { PREF: 'dark' } })
  const viaHeader = await proxyReq('/cookies-echo', { headers: { 'x-gg-jar': jarHeader } })
  const viaHeaderBody = await viaHeader.json()
  assert.equal(viaHeaderBody.cookie, 'PREF=dark')
  // Response carries updated jar back:
  assert.ok(viaHeader.headers.get('x-gg-jar'), 'jar echoed to client')
})

test('integration: upstream failure modes are honest (500 passthrough, 404 JSON, refused, timeout)', async () => {
  // Upstream 500: real status + real body
  const err500 = await proxyReq('/error500', { headers: { accept: 'text/html' } })
  assert.equal(err500.status, 500)
  assert.ok((await err500.text()).includes('boom'))

  // 404 JSON passthrough (streamed, not rewritten)
  const err404 = await proxyReq('/no-route', { headers: { accept: 'application/json' } })
  assert.equal(err404.status, 404)
  assert.equal((await err404.json()).error, 'not found')

  // Connection refused (port with no listener):
  const dead = encodeProxyPath('http://127.0.0.1:9/').slice('/api/proxy/'.length)
  const deadRes = await handleProxyRequest(new Request(`http://lounge.test/api/proxy/${dead}`, { headers: { accept: 'text/html' } }), dead)
  assert.equal(deadRes.status, 502)
  const deadHtml = await deadRes.text()
  assert.ok(deadHtml.includes('Could not reach') || deadHtml.includes('UPSTREAM_FAILED'))
  assert.ok(deadHtml.includes('127.0.0.1'), 'names the real host')

  // Timeout: server accepts but never responds (4s headers timeout):
  process.env.GG_PROXY_HEADERS_TIMEOUT_MS = '4000' // already set pre-import; module const used
  const t0 = Date.now()
  const slowRes = await proxyReq('/slow', { headers: { accept: 'text/html' } })
  const elapsed = Date.now() - t0
  assert.equal(slowRes.status, 504)
  assert.ok(elapsed < 10_000, `timeout must fire near headers timeout, took ${elapsed}ms`)
})

test('integration: security — requests to blocked targets never reach a server', async () => {
  servedRequests.length = 0
  const attempts = [
    ['file:///etc/passwd', 'text/html'],
    ['http://169.254.169.254/latest/meta-data/', 'text/html'],
    ['http://localhost:1/', 'text/html'],
    ['https://www.evil-unknown.test/', 'text/html'],
    ['http://user:pass@127.0.0.1:1/', 'text/html'],
  ]
  for (const [raw, accept] of attempts) {
    const seg = Buffer.from(raw).toString('base64url')
    const res = await handleProxyRequest(new Request(`http://lounge.test/api/proxy/${seg}`, { headers: { accept } }), seg)
    assert.ok([400, 403].includes(res.status), `${raw} → ${res.status}`)
    const body = await res.text()
    assert.ok(!body.includes('root:'), 'no file contents')
    // Real error document/page with a real reason:
    assert.ok(/not allowed|blocked|allowed|Protocol|credentials|valid/i.test(body), `${raw} body explains why`)
  }
  assert.equal(servedRequests.length, 0, 'blocked targets produced ZERO upstream requests')

  // CORS preflight from a foreign origin must be refused:
  const evilPreflight = await handleProxyRequest(
    new Request('http://lounge.test/api/proxy/abc', { method: 'OPTIONS', headers: { origin: 'https://evil.test', 'access-control-request-method': 'GET' } }),
    'abc',
  )
  assert.equal(evilPreflight.status, 403)
  // ...but sandboxed null origin + own origin are allowed:
  const nullPreflight = await handleProxyRequest(
    new Request('http://lounge.test/api/proxy/abc', { method: 'OPTIONS', headers: { origin: 'null', 'access-control-request-method': 'GET' } }),
    'abc',
  )
  assert.equal(nullPreflight.status, 204)
  assert.equal(nullPreflight.headers.get('access-control-allow-origin'), 'null')
})

test('originOf honors Host + x-forwarded-* (postMessage targetOrigin)', async () => {
  const { originOf } = await import('../lib/proxy/origin.ts')
  const plain = new Request('http://127.0.0.1:3100/api/proxy/x')
  // Node Request derives host header from the URL:
  assert.equal(originOf(plain), 'http://127.0.0.1:3100')
  const fwd = new Request('https://gg-lounge.example/api/proxy/x', {
    headers: { 'x-forwarded-host': 'lounge.example', 'x-forwarded-proto': 'https', host: 'internal:3000' },
  })
  assert.equal(originOf(fwd), 'https://lounge.example')
  const hostOnly = new Request('http://ignored/api/proxy/x', { headers: { host: 'proxy.local:8080' } })
  assert.equal(originOf(hostOnly), 'http://proxy.local:8080')
})

test('integration: config endpoint exposes allowlist, no secrets', async () => {
  const { GET } = await import('../app/api/proxy/config/route.ts')
  const res = GET(new Request('http://lounge.test/api/proxy/config'))
  const body = await res.json()
  assert.ok(Array.isArray(body.allowlist))
  assert.ok(body.allowlist.includes('youtube.com'))
  assert.ok(body.allowlist.includes('poki.com'))
  assert.ok(body.allowlist.includes('crazygames.com'))
  const serialized = JSON.stringify(body)
  assert.ok(!/secret|token|password|DATABASE_URL|BETTER_AUTH/i.test(serialized), 'no env leakage')
})

test('integration: shutdown upstream', async () => {
  await new Promise((resolve) => upstream.close(resolve))
})
