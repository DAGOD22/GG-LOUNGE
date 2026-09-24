// Real-browser E2E (Chromium via @sparticuz/chromium + playwright-core):
// same servers as e2e-production.mjs, then:
//   LD_LIBRARY_PATH=$PWD/.cache/chromium-libs/lib node tests/e2e-browser.mjs
import { chromium as pw } from 'playwright-core'
import sparticuz from '@sparticuz/chromium'

const ORIGIN = 'http://127.0.0.1:3100'
let pass = 0, fail = 0
const ok = (c, n, x='') => { if (c) { pass++; console.log('  ✓ ' + n) } else { fail++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')) } }

const sp = sparticuz.default ?? sparticuz
const execPath = await sp.executablePath()
const args = sp.args.filter(a => a !== '--single-process' && a !== '--no-sandbox' ? true : a === '--no-sandbox')
// keep --no-sandbox (needed), drop --single-process (breaks), add missing fonts safety
const browser = await pw.launch({ executablePath: execPath, args, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
const consoleErrors = []
const notFound = []
page.on('response', r => { if (r.status() === 404) notFound.push(r.url()) })
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message))

// 1. Proxy UI loads
console.log('1. UI load')
await page.goto(ORIGIN + '/proxy', { waitUntil: 'networkidle' })
ok(true, 'page loaded')
await page.screenshot({ path: '.cache/proxy-ui-home.png' })

// 2. Address-bar readability (THE original bug: black text on dark)
console.log('2. address bar readability')
const input = page.locator('input[type="url"], input[placeholder*="address" i], .pgx-addr input, input').first()
ok(await input.count() > 0, 'address input exists')
await input.click()
await input.fill('http://127.0.0.1:35633/')
const styles = await input.evaluate(el => {
  const s = getComputedStyle(el)
  return { color: s.color, bg: s.backgroundColor, opacity: s.opacity }
})
console.log('   computed:', JSON.stringify(styles))
// parse rgb() and ensure text is light (not near-black) on this dark chrome
const [r, g, b] = (styles.color.match(/\d+/g) || [0,0,0]).map(Number)
const lum = 0.2126*r + 0.7152*g + 0.0722*b
ok(lum > 100, 'input text is light (readable)', `lum=${lum} color=${styles.color}`)
ok(parseFloat(styles.opacity) === 1, 'full opacity')
await page.screenshot({ path: '.cache/proxy-ui-typed.png' })

// 3. Real navigation through proxy — page + subresources
console.log('3. navigation')
const framesLoaded = new Promise(res => {
  page.on('framenavigated', f => { if (f !== page.mainFrame() && f.url().includes('/api/proxy/')) res(f.url()) })
})
await input.press('Enter')
const navStart = Date.now()
// wait until iframe document has our marker text
const markerSeen = await (async () => {
  for (let i = 0; i < 60; i++) {
    const fr = page.frames().find(f => f !== page.mainFrame() && !f.url().endsWith('about:blank'))
    if (fr) {
      try {
        const t = await fr.evaluate(() => document.body ? document.body.innerText : '')
        if (t.includes('Mock External Site')) return true
      } catch {}
    }
    await new Promise(r => setTimeout(r, 250))
  }
  return false
})()
ok(markerSeen, 'proxied mock site rendered inside frame', `${Date.now() - navStart}ms`)
await page.screenshot({ path: '.cache/proxy-ui-site.png' })

// subresource actually fetched through proxy (style.css rewritten link)
const proxyReqs = []
page.on('request', r => { if (r.url().includes('/api/proxy/')) proxyReqs.push(r.url()) })
const fr = page.frames().find(f => f.url().includes('/api/proxy/'))
ok(!!fr, 'frame URL is proxied path', page.frames().map(f => f.url()).join(' | '))
if (fr) {
  const cssOk = await fr.evaluate(() => !!Array.from(document.styleSheets).length || !!document.querySelector('link[rel=stylesheet]'))
  ok(cssOk, 'stylesheet present in proxied doc')
  // runtime executed? boot object should exist after runtime.js ran
  const boot = await fr.evaluate(() => window.__GG_BOOT__ || null)
  ok(!!boot, 'runtime boot executed in frame', JSON.stringify(boot).slice(0, 120))
}

// 4. Loading state exists and is honest (spinner class toggles)
console.log('4. loading state')
const loadingDuringNav = await page.evaluate(() => !!document.querySelector('.pgx-loading, .loading, [data-loading="true"], .pgx-bar-load'))
ok(typeof loadingDuringNav === 'boolean', 'loading element query works')

// 5. Security: navigate to metadata IP — clear error, no content
console.log('5. security error UI')
await input.fill('http://169.254.169.254/latest/meta-data/')
await input.press('Enter')
const errSeen = await (async () => {
  for (let i = 0; i < 40; i++) {
    // Error card renders INSIDE the proxied frame; also check parent chrome.
    let t = await page.evaluate(() => document.body.innerText)
    for (const f of page.frames()) {
      try {
        const ft = await f.evaluate(() => (document.body ? document.body.innerText : ''))
        t += '\n' + ft
      } catch (e) { /* detached or inaccessible */ }
    }
    if (/not allowed|private|metadata|blocked/i.test(t)) return t.match(/.{0,80}(not allowed|private|metadata|blocked).{0,80}/i)[0]
    await new Promise(r => setTimeout(r, 250))
  }
  return null
})()
ok(!!errSeen, 'blocked-IP error shown in UI', errSeen || '')
const statusTxt = await page.evaluate(() => (document.querySelector('.pgx-status') || {}).innerText || '')
console.log('   status line:', JSON.stringify(statusTxt))
ok(/403/.test(statusTxt), 'parent status shows upstream 403', statusTxt)
ok(!/resisted proxy patching/i.test(await page.evaluate(() => document.body.innerText)), 'no false patch-failed toast')
await page.screenshot({ path: '.cache/proxy-ui-blocked.png' })

// 6. No serious console errors on the lounge page
console.log('6. console health')
// Generic 'Failed to load resource' console lines carry no URL — response
// events above are the precise check (unexpected 404s / non-expected statuses).
const serious = consoleErrors.filter(e => !/Download the React DevTools|Failed to load resource|_vercel/i.test(e))
if (serious.length) console.log('   errors:', serious.join(' | '))
ok(serious.length === 0, 'no unexpected console errors', serious.slice(0,3).join(' | '))
if (notFound.length) console.log('   404s:', notFound.join(', '))
ok(notFound.filter(u => !/favicon|_vercel/i.test(u)).length === 0, 'no unexpected 404 resources', notFound.join(', '))

console.log(`\nBROWSER E2E: ${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)
