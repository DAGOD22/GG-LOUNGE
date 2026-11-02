# GG Lounge Scramjet proxy compatibility report

**Updated:** 2 November 2026
**Scope:** Repair and verify the repository's existing Scramjet/Bare/Wisp implementation. No proxy replacement or dependency upgrade was made.

## Verified in the repository

- **Existing stack retained:** Scramjet 1.1.0, BareMux 2.1.9, Bare v3 client 2.2.5, libcurl transport 1.5.2, Wisp JS 0.4.1, and Bare Node server 2.0.4 remain pinned as before.
- **Wisp endpoint normalization:** the pinned libcurl transport requires the Wisp URL path to end in `/`. The config endpoint now normalizes that path and rejects URL credentials/fragments. Client normalization also handles local `/wisp` URLs and refuses insecure `ws://` on an HTTPS page.
- **Wisp readiness check and fallback:** startup now completes a Wisp protocol handshake with the already-installed Wisp client instead of treating a generic WebSocket upgrade as proof of a working Wisp endpoint. If the handshake or transport setup fails, the launcher tries the existing Bare HTTP transport. The UI labels that mode as degraded because proxied WebSockets/realtime traffic may still fail.
- **YouTube filtering regression guard:** `youtubei.googleapis.com` is explicitly excluded from generic ad/path filtering. Unit coverage checks YouTube search, player, and logging RPC-style URLs with ad blocking enabled. This verifies the local filter decision only; it does not prove that Google's live API is reachable.
- **HTTP request/response compatibility:** the Bare adapter's preflight method list now matches the methods it serves (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`). Tests exercise a PATCH JSON body, query parameters, authorization/CSRF/cookie headers, redirect metadata, repeated `Set-Cookie` values, and a subsequent cookie-bearing request. They also cover streaming, Range/206, bodyless responses and CORS preflight.
- **Safer failures:** first-party proxy diagnostics and error pages use status/reference codes rather than echoing exception text, target URLs, query strings, request headers, cookies or bodies.
- **Service-worker/CSP routing:** the proxy worker is registered only for `/browse/`, and the local route returns `Service-Worker-Allowed: /browse/`. The app does not set a blanket CSP header on `/proxy` or `/browse/`; this repair did not relax or add a site-wide CSP. Destination response handling remains with the existing Scramjet runtime.
- **Input contrast:** the proxy address field now uses high-contrast text and a lime caret on the dark chrome, with a light-theme override. Focus receives a visible outline.
- **Diagnostics:** development diagnostics are enabled by default. Production diagnostics are off unless `?proxyDebug=1` is present or `localStorage.setItem('ggl-proxy-diagnostics', '1')` is set. Events cover startup stages, Wisp handshake/fallback, Bare health status, service-worker failures, HTTP error statuses and failed proxied requests. Console records are local to the browser and omit URL/headers/cookies/body/message data.

## Not verified against live destinations

The sandbox did not perform authenticated requests to YouTube, Google OAuth, Roblox, or other external websites. Therefore these behaviors remain **unverified**:

- YouTube search results and player responses from `youtubei.googleapis.com`.
- OAuth redirects, browser cookie persistence, and account/session continuity on Google or Roblox.
- CAPTCHA, MFA, anti-bot challenges, browser privacy/storage policies, and provider-specific login flows.
- Destination WebSocket behavior, video playback, Roblox experiences, or cloud-gaming streams.

The adapter tests prove forwarding and preservation at the local Bare boundary; they do not substitute for a real browser session with the destination. No search results or authentication responses are fabricated.

## Deployment and remaining constraints

- **Vercel:** the existing Node Bare route provides the HTTP fallback. A Vercel serverless function is not a persistent WebSocket server, so Wisp must run on a separate persistent Node host for WebSockets and realtime features. Without `WISP_URL`, the config deliberately selects HTTP-only mode.
- **Separate Wisp backend:** run `PORT=3001 WISP_ALLOWED_ORIGINS=https://your-gg-lounge.vercel.app node scripts/server.mjs --wisp-only` on a persistent Node host. Terminate TLS in front of it, forward WebSocket upgrades for `/wisp/`, and set the Vercel environment variable to `WISP_URL=wss://your-proxy-backend.example/wisp/`. `WISP_ALLOWED_ORIGINS` must contain the exact app origin (scheme + host, no path). The backend blocks private destinations and restricts destination ports to 80/443; UDP is disabled.
- A successful Wisp handshake confirms the Wisp control protocol only; it does **not** guarantee outbound reachability to every site. When Wisp fails, HTTP fallback can keep ordinary page/search requests available, but cannot provide WebSocket transport.
- The proxy does not bypass destination login, CAPTCHA/MFA, DRM, anti-bot controls, school/network filters, cookie restrictions, or provider terms. Open the original site directly when an external site's policy requires it.

## Verification record

- `corepack pnpm test`: **89 tests passed**, including the existing game regression suite and new proxy/ad-block/config/privacy cases.
- `corepack pnpm typecheck`: **passed**.
- `corepack pnpm build`: **passed** with Next.js 16.3.3 and generated Scramjet/Bare runtime assets.
- Local HTTP smoke checks: `/api/proxy/config` returned `/wisp/`; `/api/bare/` advertised Bare v1/v2/v3; `/proxy/sw.js` returned `Service-Worker-Allowed: /browse/`; the self-hosted Scramjet runtime asset returned HTTP 200.
- Manual local WebSocket smoke check completed a **Wisp v2 protocol handshake** against the repository's Node server. This checked the local control-plane handshake, not outbound connectivity to YouTube/Roblox or any other site.
- Playwright browser tests were attempted. The HTTP-only deep-link route test passed, but the browser-based tests could not start because the sandbox has no installed Chromium executable; installing one would require a download host unavailable in this environment. The address-field CSS is also covered by a static unit test.
- `corepack pnpm lint` could not run: the repository's ESLint 10.11.0 / config combination throws a circular-structure error while validating the existing configuration, before linting any files.
- Live external-site search, login and cookie continuity are intentionally **not claimed**.
