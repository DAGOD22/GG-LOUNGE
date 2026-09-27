# YouTube (GG Lounge app)

Paste a `youtube.com` / `youtu.be` link (or an 11-character video ID) and the
app plays it inside YouTube's **official privacy-enhanced embed**
(`youtube-nocookie.com/embed/…`).

* No proxying, no scraping, no DRM/auth/bot bypasses.
* Search & browsing live on youtube.com itself (linked from the app) — the
  official embed API does not provide search.
* If a video refuses to play (private, embedding-disabled, region-blocked,
  playback restrictions), that message comes from YouTube and is shown as-is.
* The app probes reachability honestly: it distinguishes "you're offline",
  "this network can't reach YouTube", and "YouTube answered" instead of
  guessing a generic "no internet".
* The current video ID is kept in the URL fragment, so refresh and back/forward
  restore the player.
