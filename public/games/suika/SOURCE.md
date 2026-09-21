# Suika with Bomb — community browser edition

This is the existing game by MycroftKang and contributors, **not** Aladdin X's
commercial console/mobile game, and not a new imitation generated for this site.

Upstream: https://github.com/MycroftKang/Suika/tree/61e375ac4a3b97af51b1c8b8607ea989efd52da6
MIT license and upstream ThirdPartyNotices are included. React and library
license notices are retained in the generated JS LICENSE file.

Changes for self-hosting: external analytics, fonts, Bootstrap CDN and Firebase
connections disabled; Bootstrap bundled locally; score keys namespaced; cloud
leaderboard disabled (no fake rankings); orientation lookup given a fallback.
The actual fruit-physics/gameplay code and artwork are the upstream game.

Build: upstream npm lockfile, `npm ci --ignore-scripts --legacy-peer-deps`, then
`CI=false GENERATE_SOURCEMAP=false PUBLIC_URL=. npm run build`.
The local changes are in `self-hosting.patch`.
