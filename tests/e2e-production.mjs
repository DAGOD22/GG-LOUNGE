// E2E against production `next start` + live mock upstream.
const ORIGIN = 'http://127.0.0.1:3100'
const MOCK = 'http://127.0.0.1:35633'
const enc = (u) => Buffer.from(u, 'utf8').toString('base64url')
let pass = 0, fail = 0
const ok = (c, name, extra='') => { if (c) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name + (extra? ' — '+extra : '')) } }

// 1. proxy UI page + assets
console.log('1. UI')
const page = await fetch(ORIGIN + '/proxy')
ok(page.status === 200, 'GET /proxy → 200')
const html = await page.text()
ok(html.includes('gg-proxy') || html.includes('proxy'), 'proxy page markup present')
ok(!html.includes('var(--ink)'), 'no bare --ink in chrome')
const rt = await fetch(ORIGIN + '/proxy/runtime.js')
ok(rt.status === 200 && (await rt.text()).includes('postMessage'), 'runtime.js served')
const css = /href="(\/_next\/static\/chunks\/[a-z0-9_-]+\.css)"/.exec(html)
ok(!!css, 'css chunk linked', html.slice(0, 300))
if (css) { const c = await fetch(ORIGIN + css[1]); const t = await c.text(); ok(t.includes('pgx-bar'), 'css contains address-bar rules') }

// 2. HTML page through proxy
console.log('2. HTML rewrite')
const sep = enc(MOCK + '/')
const r1 = await fetch(`${ORIGIN}/api/proxy/${sep}`)
ok(r1.status === 200, 'proxied HTML 200', 'got ' + r1.status)
const h1 = await r1.text()
ok(h1.includes('Mock External Site'), 'body passed through')
ok(h1.includes('/api/proxy/'), 'subresources rewritten')
ok(!/(src|href)=["']\/(style\.css|app\.js|logo\.png|next)/.test(h1), 'no raw root-relative subresource left')
ok(h1.includes('/proxy/runtime.js'), 'runtime injected before scripts')

// 3. direct CSS/JS through proxy
console.log('3. CSS/JS')
const rCss = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/style.css')}`)
ok(rCss.status === 200 && (await rCss.text()).includes('/api/proxy/'), 'CSS url() rewritten')
const rJs = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/app.js')}`)
const js = await rJs.text()
ok(rJs.status === 200 && js.includes('/api/proxy/') && js.includes('window.API='), 'JS string literals rewritten, code intact')
ok(!js.includes('http://127.0.0.1:35633/api'), 'no raw upstream host in JS', js.slice(0,200))

// 4. JSON API + query + methods
console.log('4. Methods/query')
const q = enc(MOCK + '/api?q=great')
ok((await (await fetch(`${ORIGIN}/api/proxy/${q}`)).json()).q === 'great', 'query preserved')
for (const m of ['POST','PUT','PATCH','DELETE']) {
  const r = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/api')}`, { method: m, headers: {'content-type':'application/json'}, body: m==='GET'?undefined:JSON.stringify({d:m}) })
  const j = await r.json().catch(() => ({}))
  ok(r.status === 200 && j.ok && j.m === m, m + ' works')
}

// 5. redirect handled internally
console.log('5. Redirect')
const rR = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/redirect')}`)
const tR = await rR.text()
ok(rR.status === 200 && tR.includes('second page'), '302 followed internally')

// 6. Range
console.log('6. Range/206')
const rV = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/video.mp4')}`, { headers: { range: 'bytes=0-99' } })
ok(rV.status === 206, '206 partial', 'got ' + rV.status)
ok((rV.headers.get('content-range')||'').startsWith('bytes 0-99/'), 'content-range forwarded')

// 7. gzip
console.log('7. gzip')
const rG = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/gzip.html')}`)
const tG = await rG.text()
ok(tG.includes('gzip-e2e-marker'), 'gzip decompressed+rewritten')

// 8. cookies namespaced
console.log('8. cookies')
const rC = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/cookies')}`)
const sc = rC.headers.get('set-cookie') || ''
ok(sc.startsWith('ggc_') && sc.includes('_SID=') && sc.includes('Path=/api/proxy/'), 'set-cookie jar-prefixed + path-scoped', sc.slice(0,80))
ok((rC.headers.get('x-gg-jar')||'').length >= 6, 'jar header present', rC.headers.get('x-gg-jar'))

// 9. security through PROD server
console.log('9. security')
const attacks = [
  ['file:// protocol', enc('file:///etc/passwd'), 403],
  ['credentials URL', enc('http://user:pass@example.com/'), 403],
  ['metadata IP', enc('http://169.254.169.254/latest/meta-data/'), 403],
  ['private IP', enc('http://192.168.1.1/admin'), 403],
  ['127.0.0.1 w/o hatch?', enc('http://localhost:1/'), 403], // localhost always blocked (hatch only allows 127.0.0.1 form)
  ['not-on-allowlist', enc('http://example.com/'), 403],
  ['garbage segment', '%%%notbase64%%%', 400],
]
for (const [name, seg, want] of attacks) {
  const r = await fetch(`${ORIGIN}/api/proxy/${seg}`, { headers: { accept: 'text/html' } })
  const body = await r.text()
  ok(r.status === want, name + ' → ' + want, 'got ' + r.status)
  ok(/not allowed|blocked|Private|decoded|proxy/i.test(body), name + ' explains why in body')
}

// 10. upstream failure (dead port on allowlisted extra host — use 127.0.0.1:1)
console.log('10. upstream failure')
const rD = await fetch(`${ORIGIN}/api/proxy/${enc('http://127.0.0.1:1/')}`, { headers: { accept: 'text/html' } })
ok(rD.status === 502, 'dead upstream → 502', 'got ' + rD.status)
const bD = await rD.text()
ok(/Could not reach|unreachable|not allowed|failed/i.test(bD), 'honest failure message', bD.slice(0, 200))

// 10b. failure classification — six honest classes, never one vague bucket
console.log('10b. failure classification')
{
  const r403 = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/forbidden')}`, { headers: { accept: 'text/html' } })
  const t403 = await r403.text()
  ok(r403.status === 403 && t403.includes('custom403 content'), 'real provider 403 page passes through untouched')

  const rBlank = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/blank403')}`, { headers: { accept: 'text/html' } })
  const tBlank = await rBlank.text()
  ok(rBlank.status === 403 && /PROVIDER RESTRICTION/.test(tBlank), 'blank 403 → PROVIDER RESTRICTION card', String(rBlank.status))
  ok(/directly instead/i.test(tBlank), 'card offers direct-open fallback')

  const rChal = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/challenge503')}`, { headers: { accept: 'text/html' } })
  const tChal = await rChal.text()
  ok(rChal.status === 503 && /PROVIDER RESTRICTION/.test(tChal), 'anti-bot challenge → PROVIDER RESTRICTION card')

  const jPriv = await fetch(`${ORIGIN}/api/proxy/${enc('http://192.168.1.1/admin')}`, { headers: { accept: 'application/json' } })
  const jPrivBody = await jPriv.json().catch(() => ({}))
  ok(jPrivBody.kind === 'blocked', 'private IP JSON error classifies as blocked', JSON.stringify(jPrivBody))

  const jFile = await fetch(`${ORIGIN}/api/proxy/${enc('file:///etc/passwd')}`, { headers: { accept: 'application/json' } })
  const jFileBody = await jFile.json().catch(() => ({}))
  ok(jFileBody.kind === 'unsupported', 'file:// classifies as unsupported', JSON.stringify(jFileBody))

  const rDead = await fetch(`${ORIGIN}/api/proxy/${enc('http://127.0.0.1:1/')}`, { headers: { accept: 'text/html' } })
  const tDead = await rDead.text()
  ok(rDead.status === 502 && /NETWORK FAILURE/.test(tDead), 'dead upstream → NETWORK FAILURE card')
  ok(/not a client-side/i.test(tDead), 'network card explicitly says it is not your device')
}

// 10c. named providers through the proxy — outcome depends on where this
// runs (sandbox DNS fails fast → honest network card; a real network may
// actually reach them). In EVERY case the response must be honest.
console.log('10c. providers through proxy (youtube/poki/crazygames)')
for (const [name, url] of [
  ['YouTube', 'https://www.youtube.com/'],
  ['Poki', 'https://poki.com/en/'],
  ['CrazyGames', 'https://www.crazygames.com/'],
]) {
  try {
    const r = await fetch(`${ORIGIN}/api/proxy/${enc(url)}`, {
      headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(20000),
    })
    const t = await r.text()
    ok(!/no internet/i.test(t), name + ': never says "No Internet"')
    if (r.status === 502) {
      ok(/NETWORK FAILURE/.test(t), name + ': unreachable → NETWORK FAILURE card')
    } else if (r.status === 504) {
      ok(/TIMEOUT/.test(t), name + ': slow → TIMEOUT card')
    } else if (r.status === 200) {
      ok(t.includes('/api/proxy/'), name + ': page actually proxied + rewritten')
      console.log('   (' + name + ' reachable from this network — full load verified)')
    } else {
      ok(/PROVIDER RESTRICTION|upstream|refused|HTTP/.test(t), name + ': classified error ' + r.status)
      console.log('   (' + name + ' answered HTTP ' + r.status + ')')
    }
  } catch (e) {
    ok(false, name + ': request errored — ' + String(e && e.message))
  }
}

// 11. config endpoint
console.log('11. config')
const cfg = await (await fetch(ORIGIN + '/api/proxy/config')).json()
ok(cfg.engine === 'server-proxy-v1', 'engine tag')
ok(Array.isArray(cfg.allowlist) && cfg.allowlist.includes('youtube.com'), 'allowlist exposed')
ok(!JSON.stringify(cfg).includes('SECRET'), 'no secrets in config')

// 12. no env leak via debug
console.log('12. env leak')
const rEnv = await fetch(`${ORIGIN}/api/proxy/${enc(MOCK + '/api')}`, { headers: { 'x-gg-debug': '1' } })
const envTxt = await rEnv.text()
ok(!/BETTER_AUTH|process\.env|DATABASE_URL/i.test(envTxt), 'no env material in responses')

console.log(`\nE2E: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
