/**
 * Honest proxy error documents and JSON bodies.
 *
 * Error pages are real HTML (so the runtime inside them can postMessage the
 * exact status back to the proxy chrome), styled with lounge tokens, and they
 * never pretend a blocked site worked.
 */

export type ProxyErrorInfo = {
  status: number
  code: string
  message: string
  /** Host the user was trying to reach, when known. */
  host?: string
  hint?: string
}

export function errorJson(info: ProxyErrorInfo, jar: string | null): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }
  if (jar) headers['x-gg-jar'] = jar
  return new Response(JSON.stringify({ error: info.code, message: info.message, status: info.status, host: info.host ?? null }), {
    status: info.status,
    headers,
  })
}

export function errorHtml(info: ProxyErrorInfo, opts: { origin: string; jar: string | null }): Response {
  const { origin, jar } = opts
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  const boot = JSON.stringify({
    origin,
    target: info.host ? `https://${info.host}/` : null,
    status: info.status,
    error: { code: info.code, message: info.message, hint: info.hint ?? null },
    jar: jar ? JSON.parse(safeB64Json(jar)) : {},
  })
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="gg-proxy" content="error">
<title>Proxy error ${esc(String(info.status))}</title>
<script>window.__GG_BOOT__=${boot.replace(/</g, '\\u003c')};</script>
<script src="/proxy/runtime.js"></script>
<style>
:root{color-scheme:dark;--bg:#0b0d12;--fg:#f4f2ec;--muted:#9699a8;--line:rgba(244,242,236,.13);--lime:#d7f34a;--coral:#ff6c83}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 70% 10%,rgba(125,107,255,.18),transparent 40rem),var(--bg);color:var(--fg);font:15px/1.6 system-ui,sans-serif}
.card{width:min(560px,100%);border:1px solid var(--line);background:#141720;border-radius:18px;padding:30px}
.kicker{margin:0;color:var(--coral);font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}
h1{margin:12px 0 8px;font-size:clamp(1.6rem,4vw,2.3rem);letter-spacing:-.05em;line-height:1.05}
.host{color:var(--lime);font-weight:700;overflow-wrap:anywhere}
p{color:var(--muted);margin:10px 0}
.hint{border-top:1px solid var(--line);margin-top:18px;padding-top:16px;font-size:13px}
code{color:var(--fg);background:rgba(255,255,255,.06);padding:1px 6px;border-radius:6px}
a{color:var(--lime)}
</style></head><body><main class="card">
<p class="kicker">GG-LOUNGE PROXY · ${esc(info.code)}</p>
<h1>${esc(info.message)}</h1>
${info.host ? `<p>Target: <span class="host">${esc(info.host)}</span></p>` : ''}
<p>Upstream status: <code>${esc(String(info.status))}</code></p>
${info.hint ? `<p class="hint">${esc(info.hint)}</p>` : '<p class="hint">GG Lounge only proxies its supported-sites list and does not bypass logins, CAPTCHAs, bot checks or DRM.</p>'}
</main></body></html>`
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy':
      'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock',
    'referrer-policy': 'no-referrer',
  }
  if (jar) headers['x-gg-jar'] = jar
  return new Response(html, { status: info.status, headers })
}

function safeB64Json(b64: string): string {
  try {
    const json = Buffer.from(b64, 'base64url').toString('utf8')
    JSON.parse(json)
    return json
  } catch {
    return '{}'
  }
}

/** Pick HTML vs JSON based on what the requester wanted. */
export function wantsHtml(request: Request): boolean {
  const accept = request.headers.get('accept') ?? ''
  return accept.includes('text/html')
}
