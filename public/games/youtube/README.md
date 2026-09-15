# YouTube Unblocked (GG Lounge video room)

Piped-powered YouTube client. No Google API key, no ads, no `youtube.com` requests.

## How the unblock works

1. **Data** — search, trending, video details, comments and channels load from
   community [Piped API](https://github.com/TeamPiped/Piped) servers through the
   lounge's own proxy routes (`/api/yt/*`). The browser only talks to the lounge
   domain, so school filters that block `youtube.com` / `googlevideo.com` don't trigger.
2. **Playback** — "School mode" (on by default) streams video bytes through
   `/api/yt/media`, same origin. Turn it off for direct CDN playback.
3. **Fallback** — if the lounge proxy is unreachable, the client talks to Piped
   API instances directly (still no `youtube.com`).

## Features

- Trending (multi-region), search with suggestions + filters
- Watch page: quality picker, audio-only mode, livestreams (bundled hls.js),
  autoplay, up-next, description, comments, channel pages
- SponsorBlock auto-skip, history + Watch Later (local only), share links (`?v=`)
- No external requests: no Google Fonts, no CDN scripts, no analytics

## Files

- `index.html` — standalone app shell + styles
- `main.js` — app logic
- `vendor/hls.min.js` — self-hosted HLS player engine (livestreams)
