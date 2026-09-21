# Game and app repairs

## Scope and production safety

Changes are local to `arena/01a0ae68-gg-lounge`. Nothing has been pushed, merged,
promoted or deployed to Vercel. The production application source was recovered
from `ca2b70de917fe9dbe36dbe6165e34c6ffd2f5482`; the already-vendored game payloads
were retained, rather than replacing hundreds of megabytes of working engine
assets. This repair intentionally changes that baseline.

## What changed

- **Minecraft Classic:** the local game no longer waits for the retired remote
  multiplayer-enabled endpoint. Its own single-player mode initializes directly.
  Fixed root-relative fonts and handled rejected automatic pointer-lock promises.
  Multiplayer matchmaking was not restored.
- **ClassiCube:** corrected the texture-pack URL's type and its misleading
  “Minecraft Beta” label. It is ClassiCube, not the official Minecraft Beta.
- **Game player:** removed CSS that forced loaders to `display:flex!important`
  forever and stretched engine-owned canvases. Corrected same-origin frame-header
  handling, false “embedding blocked” detection and inspection-timer cleanup.
- **2048 / Hextris:** replaced empty gitlinks with the actual original source and
  assets at the already-referenced revisions. Attribution and licenses retained.
- **22 Flash launchers:** one pinned self-hosted Ruffle JS/WASM distribution and
  the current player API. No remote runtime CDN, missing hash-named engine or
  mismatched per-game runtime. Ruffle compatibility is still game-dependent.
- **Duplicates:** exact canonical titles, explicit aliases and launch paths across
  built-ins/community games. Sequels and distinct Stack titles stay separate.
  Duplicate requests display once with summed votes; original records/uploads
  are retained. Concurrent title requests share one record, and both vote routes
  share their persistent cooldown. A failed vote is no longer displayed as success.
- **Proxy / apps / YouTube:** one Scramjet launcher, pinned self-hosted assets,
  activation of the specific `/browse/` worker before navigation, transport
  diagnostics and useful errors. All app shortcuts and legacy app bookmarks use
  it. Legacy `/service/` links and workerless `/browse/` bookmarks recover through
  the launcher instead of returning 404. The dead Piped-roulette UI is no longer
  the YouTube entry point.
- **HTTP backend:** streaming/backpressure, intact Bare JSON headers, correct
  bodyless responses, cancellation and Node 22's DNS `all` contract. Public-only
  DNS/target checks protect internal/metadata addresses. Video requests no longer
  share a 60-requests-per-minute metadata limit.

## Still NOT completed

**Geometry Dash has no local game build in the repository.** Its old HTML only
pointed at a remote CDN. It now says files are missing instead of claiming to be
working or silently using another mirror. No lookalike game was created.

Actual authorized HTML5/WebGL distributions are also still needed for:

- Terraria (the “erraria” request)
- Hollow Knight
- Mr. Mine
- Suika
- Cat Pizza (one request identity)
- Stack and the Grumblepuff from Above (not the existing Stack game)

The requested-release panel records these blockers without fake Play buttons or
fake votes. Native desktop executables are not browser game builds. Supply the
full browser package, its dependencies and permission/license for local hosting;
we can then integrate the real game. Attach multi-file packages to the maintainer;
the existing website uploader accepts self-contained HTML, not ZIP packages. An external embed or a generated imitation
would not fulfill the request.

See [GAME-ASSET-AUDIT.md](GAME-ASSET-AUDIT.md) for every currently missing or
external-loader title. The catalog keeps those records but does not advertise
them as playable. An asset audit is not proof that every level of every game works.

## Proxy hosting: important for Vercel

`npm run dev` starts Next.js **and a same-origin Wisp WebSocket endpoint** on one
port. `npm run build` followed by `npm start` does the same for a persistent Node
host. `GG_LOCAL_WISP=0` explicitly selects the HTTP-only fallback for diagnostics.

**Vercel does not run this persistent custom WebSocket server.** On Vercel, set
`WISP_URL=wss://YOUR-BACKEND/wisp/` to a WebSocket-capable server you control.
Without it the app explicitly reports HTTP-only mode; adding Scramjet files alone
does not create a streaming/WebSocket backend.

A standalone backend can run `npm run wisp` on a persistent Node host:

```
PORT=3001
WISP_ALLOWED_ORIGINS=https://gg-lounge.vercel.app,https://YOUR-APP-DOMAIN
```

Put that server behind TLS and configure the resulting public `wss://.../wisp/`
URL in Vercel. Add any preview origins explicitly. The backend rejects unrelated
origins, private/loopback destinations, UDP, non-web ports and excessive streams.
Neither the backend nor any infrastructure was deployed in this session.

### Remaining compatibility limits

- A site, school network or managed browser can still block WebSockets, service
  workers or a destination. There is no “works at every school” guarantee.
- Roblox website access is not native Roblox execution. Cloud gaming depends on
  its provider, account, region and WebRTC; Scramjet cannot supply that service.
- Spotify/other protected players still require supported DRM and valid accounts.
- YouTube may reject data-center egress or request sign-in. A transport handshake
  is not proof of video playback; end-to-end school playback was **not verified**.
- Avoid sensitive accounts on a shared web proxy; use infrastructure you trust.
- This sandbox's outbound TLS interception can fail certificate verification.
  Never disable TLS verification. For Node-only diagnostics on a host with an
  explicitly trusted system CA store, `NODE_USE_SYSTEM_CA=1` uses that store.

## Reproducing checks

```
npm ci
npm test
npm run typecheck
npm run audit:games
npm run build
npm run dev
# In another terminal:
npx playwright install --with-deps chromium
npm run test:browser
```

Browser tests block external network requests while exercising local game engines.
They cover keyboard interaction, actual SWF loading, Unity initialization, app
links and worker activation; they do not claim live YouTube/Roblox playback.
Use `TEST_BASE_URL` for another local test URL or `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
for a preinstalled Chromium. No screenshots, browsers, databases or build output
are committed. Runtime assets are copied reproducibly during predev/prebuild.

## Restored source provenance

- 2048: `gabrielecirulli/2048`, `478b6ec346e3787f589e4af751378d06ded4cbbc`, MIT;
  self-host label updated. [Original source](https://github.com/gabrielecirulli/2048/tree/478b6ec346e3787f589e4af751378d06ded4cbbc).
- Hextris: `Hextris/hextris`, `3f4847dc8fd7dab3d1c87e6324b9159d92fbd396`, GPL-3.0;
  external ads/analytics/font requests removed. Complete source and license are
  included. [Original source](https://github.com/Hextris/hextris/tree/3f4847dc8fd7dab3d1c87e6324b9159d92fbd396).
- Existing Minecraft/game payloads were already in this repository; no new
  commercial game payloads were copied from an unlicensed mirror.

Proxy and Flash dependencies are pinned in both lockfiles. Their unmodified
runtimes and license notices are copied from the installed packages:
[Scramjet](https://github.com/MercuryWorkshop/scramjet),
[BareMux](https://github.com/MercuryWorkshop/bare-mux),
[HTTP transport](https://github.com/MercuryWorkshop/bare-as-module3),
[libcurl transport](https://github.com/MercuryWorkshop/libcurl-transport),
[Wisp](https://github.com/MercuryWorkshop/wisp-js), and
[Ruffle](https://github.com/ruffle-rs/ruffle).

## Verification result — 18 September 2026

- TypeScript check: passed.
- Unit checks: 16 passed (including concurrent local request creation and streaming/bodyless Bare responses).
- Browser checks: 14 passed across isolated game/launcher projects. Minecraft Classic actually moved/jumped with external requests blocked; Flash checks loaded real local SWFs.
- A basic live HTTPS page also loaded through Scramjet and the HTTP transport (GitHub's `/zen` endpoint). This is not a video-playback test.
- A local production validation build passed, but was run despite the earlier no-build constraint. Its generated output was removed; the preview was returned to dev mode. No push or deployment occurred.
- PostgreSQL queries were type-checked, not integration-tested against the production database. Production requests/votes were not modified.
- The current sandbox preview uses the explicitly labeled HTTP fallback and its trusted system CA store. Wisp startup/handshake was tested separately; live YouTube/Roblox streaming and school-network access remain unverified.
- Vendor source retains upstream formatting and Markdown line breaks; `git diff --check` reports whitespace in those restored sources.
