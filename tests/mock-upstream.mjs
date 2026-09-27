// Mock external site for production E2E tests (stands in for a real target).
// Run: node tests/mock-upstream.mjs  → listens on 127.0.0.1:35633
// (Outbound network to real sites is blocked in the build sandbox; this mock
// exercises the full proxy path — rewriting, redirects, ranges, classification.)
import http from 'node:http'
import { gzipSync } from 'node:zlib'

const srv = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const send = (s, t, b, h = {}) => {
    res.writeHead(s, { 'content-type': t, ...h })
    res.end(b)
  }
  if (url.pathname === '/')
    return send(
      200,
      'text/html; charset=utf-8',
      `<!doctype html><html><head>
<link rel="stylesheet" href="/style.css"><script src="/app.js"></script></head>
<body><h1>Mock External Site</h1><a href="/next">next</a><img src="/logo.png"></body></html>`,
    )
  if (url.pathname === '/style.css') return send(200, 'text/css', 'body{background:url(/bg.png)}')
  if (url.pathname === '/app.js') {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      const host = req.headers.host
      send(200, 'application/javascript', `window.API="http://${host}/api";fetch("/api")`, {})
    })
    return
  }
  if (url.pathname === '/api') {
    if (req.method === 'GET')
      return send(200, 'application/json', JSON.stringify({ ok: true, m: 'GET', q: url.searchParams.get('q') }))
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () =>
      send(200, 'application/json', JSON.stringify({ ok: true, m: req.method, body: b, origin: req.headers.origin || null })),
    )
    return
  }
  if (url.pathname === '/redirect') {
    res.writeHead(302, { location: '/next' })
    return res.end()
  }
  if (url.pathname === '/next') return send(200, 'text/html; charset=utf-8', '<!doctype html><html><head></head><body>second page</body></html>')
  // --- failure-classification fixtures ---
  if (url.pathname === '/forbidden')
    return send(403, 'text/html', '<!doctype html><html><head></head><body>Access denied by policy page — custom403 content</body></html>')
  if (url.pathname === '/blank403') {
    res.writeHead(403, { 'content-type': 'text/html' })
    return res.end()
  }
  if (url.pathname === '/challenge503')
    return send(503, 'text/html', '<!doctype html><html><head></head><body><div id="cf-chl-widget"></div>Checking your browser…</body></html>')
  if (url.pathname === '/video.mp4') {
    const data = Buffer.alloc(1024, 7)
    const range = req.headers.range
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range)
      const start = +m[1]
      const end = m[2] ? +m[2] : 1023
      const chunk = data.subarray(start, end + 1)
      res.writeHead(206, {
        'content-type': 'video/mp4',
        'content-range': `bytes ${start}-${end}/1024`,
        'accept-ranges': 'bytes',
        'content-length': chunk.length,
      })
      return res.end(chunk)
    }
    res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': 1024 })
    return res.end(data)
  }
  if (url.pathname === '/logo.png' || url.pathname === '/bg.png') return send(200, 'image/png', Buffer.from('89504e470d0a1a0a', 'hex'))
  if (url.pathname === '/favicon.ico') return send(204, 'image/x-icon', '')
  if (url.pathname === '/gzip.html') {
    const gz = gzipSync(
      Buffer.from('<!doctype html><html><head></head><body>gzip-e2e-marker <a href="/x">l</a></body></html>'),
    )
    res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' })
    return res.end(gz)
  }
  if (url.pathname === '/cookies') {
    res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'SID=e2e-secret; Path=/; HttpOnly' })
    return res.end('<!doctype html><html><head></head><body>ck</body></html>')
  }
  send(404, 'application/json', JSON.stringify({ error: 'nope' }))
})
srv.listen(35633, '127.0.0.1', () => {
  console.log('MOCK_PORT=35633')
})
