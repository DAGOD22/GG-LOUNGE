# Settings, cloaking and the video engine

Everything on this page is client-side + same-origin by design: a school filter
only ever sees the lounge domain, never `youtube.com`, `googlevideo.com` or
`tikwm.com`.

## Where things live

| Piece | Path | What it does |
| --- | --- | --- |
| Settings page | `/settings` | Cloak, panic key, themes, backgrounds, video engine, profiles |
| Shared engine | `public/gg/gg-boot.js` | Applies settings everywhere (lounge, both video rooms, all 97 static games, DB-served games). Exposes `window.GG` |
| YouTube API | `app/api/yt/[...path]/route.ts` | Provider chain: InnerTube → Piped → Invidious, always answers in Piped's JSON shape |
| InnerTube provider | `app/api/yt/innertube.ts` | Speaks Google's own API with five client identities, sticky last-good |
| Media relay | `app/api/yt/media`, `app/api/yt/img` | Range-aware video/HLS + image proxy, same-origin rewriting, SSRF guards |
| TikTok API | `app/api/tt/[...path]/route.ts` | tikwm mirrors + page scrape fallback |
| Stock relay | `app/api/gg/stock` | Curated background photos/videos through the lounge origin |
| PWA manifest | `app/manifest.webmanifest` | Cloak-aware name/icon/theme so an *installed app* renames itself |
| Health probe | `/api/yt/health` (`?deep=1`) | Which providers answer right now |
| Parser tests | `scripts/yt-parsers.test.mjs` | `npm run test:yt` — offline fixtures for every InnerTube shape we read |

## Tab + app cloaking

Presets (Classroom, Docs, Drive, Canvas, Schoology, …) or your own title, plus a
favicon from a URL, the preset's icon, or a generated letter badge. In a normal
tab this swaps `document.title` + the favicon live. Installed as an app,
`gg-boot.js` writes a `gg_cloak` cookie and re-points the manifest link with a
`?k=` cache buster, so `name`, `short_name`, icon and theme colour all change;
brand text and the "video room" shortcuts are dropped from the manifest while
cloaked.

## Panic key

Any key, plus an optional backup key and a modifier chord. Modes:

- **replace** – `location.replace()` to the target (back-guard can poison the
  history entry first).
- **new tab** – opens the target, leaves the lounge behind.
- **fake tab** – no navigation at all: the current document is swapped for a
  decoy page and every keypress is swallowed until you press the panic key again.

Extras: panic on window blur (with delay), and it works from inside a game
iframe — the frame broadcasts to its siblings and the top tab navigates too.

## Themes and backgrounds

20 themes (accent, surface style, font, glow, dim, scale) and 38 backgrounds:
20 canvas effects that react to the cursor (spotlight, trail, magnet) and to the
keyboard (pulse, ripple, rain, confetti), CSS mesh gradients, curated stock
photos/videos, or your own upload. Uploads go to IndexedDB (`idb:` keys) — they
never touch the server. Static arcade games keep their own artwork; the two
video rooms opt in with `<meta name="gg-bg" content="on">`.

## Settings at school: what to check first

1. Open `/settings` → **Video engine** → **Test now**. If `innertube` is green,
   playback does not depend on any third-party mirror.
2. If everything is red, the *hosting* provider is blocking outbound video
   traffic (some school-proxy hosts do) — switch host, not settings.
3. Keep **School mode** on: it proxies media/images through the lounge. Turn it
   off only if the lounge host itself is throttled and direct CDN URLs are open.
4. If your filter kills `manifest.googlevideo.com` HLS, set **Player** to
   `MP4 (compatible)` and **Max quality** to 720p (the YouTube room calls it
   “Quality cap”) — progressive MP4s need no MSE and no `hls.js`.

## Deployment notes

- Set `GG_MEDIA_SECRET` to a random string in production. Media URLs are signed
  with it; without it the signature falls back to a per-host default, which is
  fine for one deploy but rotates if `VERCEL_URL` changes.
- Responses are cached in memory per instance (`cacheGet/cacheSet` in
  `app/api/yt/lib.ts`): trend feeds 4 min, search 90 s, stream maps 6 min. No
  external cache needed.
- The upstream pools live in `app/api/yt/lib.ts` (`PIPED_INSTANCES`,
  `INVIDIOUS_INSTANCES`, `TIKTOK_MIRRORS`) — trim or extend as mirrors die.
