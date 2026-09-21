# new upadted version

## Implemented customization

Open **Customize** (bottom-left) on any lounge page. Preferences persist in local
storage; uploaded backgrounds use IndexedDB, not a temporary blob URL saved as a
string. The files are not uploaded to the lounge server.

- Any tab title, favicon URL, emoji or uploaded icon; restores the normal title
  and icons when switched off. Survives reload and page navigation.
- Record a physical key or a modifier combination, including Escape or a modifier
  alone; choose an HTTP/HTTPS destination or `about:blank`. Optional triggering in
  text fields. Works in same-origin game frames and standalone local game tabs.
  Panic stops media and removes game frames so their beforeunload prompts cannot
  block it. Browser/OS-reserved shortcuts remain outside a website's control.
- Six theme presets and custom background, panel, surface, foreground, muted,
  accent and secondary colors. The original lounge palette is the default.
- Gradient, grid and illustrated wallpaper presets, plus two real local WebM
  loops. Upload images (15 MB limit) or videos (100 MB limit); dim, blur and fit
  controls. Videos are muted/looping and pause in hidden tabs or reduced-motion
  mode. Unsupported/corrupt formats and storage failures show errors.
- System, crosshair, dot, ring and uploaded-image cursors; optional ambient trail.
  Native mouse-lock behavior in 3D games is preserved.
- Three keyboard-responsive effects, with intensity and pointer-follow controls.
  Text-field input is ignored. No key contents are logged, saved or transmitted.
  Animations are bounded and honor reduced motion.

Uploads are local to this browser/profile. Clearing site data removes them. Tab
cloaking and panic do not conceal URLs or erase browser/network history. Panic
can discard progress a game has not yet saved.

## Actual local game changes

- **2048 and Hextris:** empty Git submodule entries have now been converted to
  ordinary committed directories containing the actual original source, assets
  and licenses. A clean clone retains the files; no submodule initialization is
  required. Existing keyboard/canvas smoke checks cover both.
- **Piano Tiles:** installed AJLoveChina's MIT-licensed browser edition. Original
  gameplay is retained; three UI labels are translated to English. This is
  clearly described as a browser edition, not the commercial mobile app.
- **Suika:** installed MycroftKang's complete MIT-licensed **Suika with Bomb**
  browser edition, including real Matter.js gameplay and original assets.
  This is explicitly **not Aladdin X's commercial original**. External analytics
  and Firebase calls are disabled, Bootstrap is local, scores are namespaced,
  and unavailable global rankings are not faked. Source, license, notices and
  the exact self-hosting patch are recorded with the game.
- A small shared bootstrap adds tab/cursor preferences and panic handling to
  local game pages, including games opened outside the lounge's iframe player.
- The leftover inline UV worker registration in the root layout was removed;
  it had competed with the new scoped Scramjet launcher.

### Still not fixed — do not present these as completed

The asset audit currently finds **83 of 143** entries with their checked local
files; **60 entries remain unavailable**. See `GAME-ASSET-AUDIT.md` for the full
list. File presence and representative smoke tests do not verify every game or
level in the entire library.

Saving a portal page does not include all JavaScript-fetched game assets,
streaming data, game servers, or a license to redistribute the game. We did not
mirror unlicensed full commercial game builds or replace unavailable titles
with renamed mini-games.

Geometry Dash's game build is still missing. Terraria, Hollow Knight, Mr. Mine,
Cat Pizza and Stack and the Grumblepuff from Above still require authorized
browser packages (and, where relevant, a supported service). Native desktop
installers do not become browser games through Save Page. The existing Stack
is not Grumblepuff. Cat Pizza is tracked once.

Playsaurus's published Mr. Mine terms authorize their specified iframe and say
its embed code must not be changed without permission; those terms are not a
self-hosting license. A publisher-approved local bundle is still needed for the
user's no-external-embed requirement. [5](https://playsaurus.com/embed-our-games)

## Publishing

The requested release title is **new upadted version**. Work remains on
`arena/01a0ae68-gg-lounge`; no other branch is created or pushed.

The existing GitHub-to-Vercel integration can create a deployment after the
branch is pushed. Promoting that deployment to the existing production project
requires Vercel account access. This sandbox currently has no Vercel login, and
its device-login attempt failed during TLS setup. A successful preview/check is
not proof that production was promoted.

The proxy's full streaming/WebSocket mode still needs an external Wisp backend
on Vercel. The local preview uses the explicitly labeled HTTP fallback. No claim
of working YouTube or native Roblox playback at every school is made.

## Verified release checks

- 25 unit tests passed.
- 29 Chromium browser checks passed against the production build.
- Standalone and iframe panic tests include a game beforeunload handler; the
  redirect is not trapped by its confirmation prompt.
- Image and video uploads survived a reload. Video frames actually played;
  muted/looping and reduced-motion pause behavior were asserted.
- Suika fruit drop and Piano Tiles canvas interaction passed with external
  networking blocked. These are the credited browser editions described above.
- TypeScript passed; the production build also ran its TypeScript validation
  (`ignoreBuildErrors` is now false).

Publishing was blocked before any push: GitHub API authentication subsequently
returned **401 Bad credentials**. Reconnect GitHub in Arena to continue. No
password, token, OAuth code or 2FA code should be pasted into chat. Vercel
production authentication/promotion remains a separate unresolved requirement.

## Proxy media and game-network transport update

- The HTTP Bare adapter now answers `OPTIONS` preflight with permissive CORS,
  exposes media headers, and appends `Access-Control-Allow-Origin: *`,
  `Access-Control-Allow-Methods: GET, POST, OPTIONS`, and
  `Access-Control-Allow-Headers: *` to proxied responses.
- Incoming `Range` is copied into the Node request headers unchanged. The
  adapter preserves upstream `206`, `Content-Range`, `Content-Type` and
  `Accept-Ranges`, while removing only the transport-level Content-Length so
  the streamed response can be safely framed. A test verifies a 100-byte
  partial video response and exact `bytes=100-199` forwarding.
- Scramjet remains scoped to `/browse/`; its URL rewriting is performed by the
  Scramjet service-worker engine for all requests in that scope. Game files and
  the Next application are deliberately outside that scope. The worker waits
  for its own registration to activate and returns a useful 502 instead of a
  blank frame on failure.
- Wisp is still the WebSocket transport when `WISP_URL`/local Wisp is
  configured. The launcher performs a WebSocket handshake before enabling it;
  HTTP-only mode is explicitly labeled and cannot provide multiplayer
  WebSockets. Wisp's persistent relay must run on a Node/Go-capable host, not
  a Vercel function.

The new range/CORS cases bring the unit suite to 27 passing tests. No production
push or deployment was performed.
