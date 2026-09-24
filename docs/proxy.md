# GG Lounge server-proxy (`server-proxy-v1`)

A ground-up replacement for the old Ultraviolet/Scramjet/Wisp stack. Everything
runs server-side in Next.js route handlers — no service workers, no Bare
server, no WebSockets (the deploy target is **Vercel**, which cannot upgrade
connections).

## Architecture

```
browser ── /proxy (chrome UI: address bar, nav, status, problem toasts)
             │  iframe (sandboxed, opaque origin — no lounge-session access)
             ▼
        /api/proxy/<base64url(target-url)>
             │
   proxy.ts (segment charset guard, honest 400 on malformed paths)
             ▼
   lib/proxy/handler.ts
     ├ allowlist + SSRF policy (allowlist.ts, target.ts)
     │    validate URL → normalize → host match → DNS resolve →
     │    every resolved address checked against private/metadata ranges →
     │    CONNECT to the pinned address (no second DNS lookups — no rebinding)
     ├ safe request headers only (headers.ts)
     ├ per-domain cookie jar, namespaced `ggc_<hash>_` (jar.ts)
     ├ upstream fetch with explicit body framing, redirects re-validated
     │    hop-by-hop, timeouts, size caps, honest error pages
     └ response path
          HTML/CSS/JS  → decompress if needed → rewrite URLs (rewrite.ts)
                          → inject boot JSON + /proxy/runtime.js
          JSON/JS/CSS (direct) → rewrite where applicable
          everything else → streamed (Range/206 media pass through)
             ▲
   public/proxy/runtime.js (inside the frame)
     patches fetch/XHR/WS/history/elements so every subresource and API call
     the page makes flows back through /api/proxy; posts REAL status/errors
     to the lounge chrome via postMessage
```

### Canonical URL form

`/api/proxy/` + `base64url("https://host/path?query")`. Query strings live
inside the encoded segment, so nothing is lost or double-decoded.

## Security model (public site)

| Threat | Defence |
| --- | --- |
| Open proxy | Domain allowlist — nothing else connects |
| SSRF to localhost/private/metadata IPs | URL checks + DNS resolution of **every** address + BlockList (IPv4 & IPv6 kept separate; IPv4-mapped `::ffff:` forms judged by embedded v4) |
| DNS rebinding | Address pinned per request; socket connects to the resolved address with `servername`/SNI set for TLS |
| Non-HTTP schemes | `http:`/`https:` only (`file:`, `javascript:`, etc. → 403 `BAD_SCHEME`) |
| Creds in URLs | `user:pass@` → 403, message never echoes the password |
| Malformed segments | `proxy.ts` charset guard (base64url only) → honest 400 before Next's router `decodeURIComponent` can throw a bare 500 |
| Session theft by proxied pages | iframe sandbox **without** `allow-same-origin`/`allow-popups-to-escape-sandbox`; CSP `sandbox` header; runtime cannot touch lounge storage |
| Cookie bleed | Upstream cookies renamed `ggc_<hash>_<name>`, `Path=/api/proxy/`, `HttpOnly`+`SameSite=Lax`; virtual jar also passed frame↔server via `X-GG-Jar` (opaque-origin frames may drop cookies) |
| Secrets in responses | Config endpoint exposes allowlist + human-readable limitations only; logs carry host+path only (no query, cookies, tokens); env values never serialized |
| Abuse | Rate limit per client (default 600 req/60 s, `GG_PROXY_RATE_LIMIT`), request body cap 2 MB → 413, rewrite buffers capped 12 MB, upstream timeout + `maxDuration = 60` |
| Loopback test hatch | `GG_PROXY_ALLOW_LOOPBACK=1` allows `127.0.0.1` for local E2E — **refused when `VERCEL=1`** |

### Editing the allowlist

- `lib/proxy/allowlist.ts` → `DEFAULT_RULES` (code): exact hosts
  (`youtube.com`) or parent-domain rules (`.wikipedia.org` includes
  `en.wikipedia.org` + `upload.wikimedia.org`).
- Runtime env, no redeploy: `GG_PROXY_EXTRA_HOSTS="example.com,cdn.example.org"`.
- Local testing: `GG_PROXY_ALLOW_LOOPBACK=1` (+ optionally extra hosts).

## Environment variables

| Var | Purpose |
| --- | --- |
| `GG_PROXY_EXTRA_HOSTS` | Comma-separated allowlist additions |
| `GG_PROXY_ALLOW_LOOPBACK` | `1` allows `127.0.0.1` targets (never on Vercel) |
| `GG_PROXY_RATE_LIMIT` | Requests / 60 s / client (default 600) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Lounge auth (unrelated to proxy but required for clean deploys) |

## Honest limitations (cannot be legitimately fixed)

- **No WebSockets / WebRTC** — Vercel route handlers cannot upgrade
  connections; the runtime converts WS attempts into an explicit closed(1006)
  event and the chrome shows a real error. Wisp-style relays are out of scope.
- **YouTube** — full site proxying of watch/search is blocked by YouTube's
  own `X-Frame-Options`/`frame-ancestors`, signed `googlevideo.com` CDN URLs
  and bot-check tokens. We do **not** bypass these. `youtube-nocookie.com`
  embeds (via the existing `/games/youtube` launcher) remain the supported
  path. Search/API/playback through the site proxy will show honest errors.
- **Poki / CrazyGames** — frame-blocking headers, anti-bot challenges and
  game CDNs on separate hosts mean games on these portals cannot be promised
  as playable through the proxy; errors are surfaced, never faked.
- **DRM** — encrypted media cannot be proxied; reported as a limitation.
- Live-site verification from the build sandbox is impossible (outbound
  network except npm is blocked); validation runs against local mock upstreams
  in real Chromium + production-server E2E.

## Tests

```bash
npm test                 # unit + integration vs local mock upstream (35 tests)
# production-server E2E (next start + mock upstream): node tests/e2e-production.mjs
# real-browser E2E (Chromium): LD_LIBRARY_PATH=$PWD/.cache/chromium-libs/lib node tests/e2e-browser.mjs
```

Covered: HTML/CSS/JS rewriting, JSON APIs with GET/POST/PUT/PATCH/DELETE,
query preservation, redirects, Range/206, gzip, cookie namespacing, failed
upstream (502 + server log), SSRF attempts (`file:`, creds, metadata IP,
private IP, localhost, non-allowlisted host, garbage segment), address-bar
readability, honest blocked-IP error card + status relay, no env leaks.

## UI notes

`app/proxy/page.tsx` + `app/proxy.css`: explicit light-on-dark inputs
(`color-scheme: dark`, no bare `var(--ink)` on dark surfaces — the original
black-on-black address bar), loading/status text driven **only** by real
runtime postMessages (never a fake spinner), problem toasts deduplicated.
Entry points: home nav **Proxy**, tools header **Web proxy**.
