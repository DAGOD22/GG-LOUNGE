# Co-op rooms: why they failed, and what they need

## The two bugs

**1. The server rejected every real offer.** `lib/db/coop.ts` validated a stored
offer with `value.includes('v=0')` — a test for the SDP version line in *raw*
SDP. But the client never sends raw SDP; it sends `encodeOffer()` output, which
is base64url and cannot contain the literal text `v=0` for any input. So
`createRoom` returned `null` for every genuine offer, `/api/coop` answered 503,
and the panel said **"Could not open a room"** 100% of the time, on every
network, for every user. Retrying could never help.

Fixed by decoding the envelope with the same decoder the client uses.
`tests/coop-signalling.test.ts` fails on the old code.

**2. A serverless deploy with no database 500s.** The signalling row lives in
Postgres, or in the local JSON fallback during development. On a host like
Vercel the fallback *refuses* to write (the filesystem is ephemeral and mostly
read-only) by throwing, and the route had no guard or catch — so the browser got
a 500 with an HTML body. The route now checks `storeAvailable()` first and
answers with a `needsDatabase` flag the panel turns into a sentence about the
fix.

## What a room needs to work

| Requirement | Why |
| --- | --- |
| `DATABASE_URL` (Postgres, e.g. Neon) on a serverless host | The offer/answer handshake is parked for a few minutes. There is nowhere else to put it. |
| WebRTC data channels | The game traffic is peer-to-peer; the database only ever sees SDP. |
| Nothing else | No signalling service, no WebSocket, no key. |

If `DATABASE_URL` is absent on a serverless host the room says so plainly
instead of failing at random.

## Two players, actually

A room is only interesting if the game behind it takes two people, so the
picker offers `lib/two-player.ts` — seven titles, each one verified against the
source that ships in `public/games` by `scripts/audit-two-player.mjs`, which the
test suite runs. A game whose 2P mode disappears upstream fails the audit rather
than becoming a tile that cannot take two players.

Keys are forwarded as **seat 2**: the friend's presses map onto the other
control scheme (WASD against arrows), and the events carry explicit
`keyCode`/`which`/`charCode` because most of this catalogue predates
`KeyboardEvent.code`. Before that, forwarded keys arrived with `keyCode === 0`
and every old game silently dropped them.

## Debugging checklist

1. `curl -s -X POST localhost:3000/api/coop -H 'content-type: application/json' -d '{"action":"create","offer":"<base64url>","name":"Host"}'`
   → expect `{ "code": "ABC123" }`.
2. `{ "needsDatabase": true }` → the deployment has no database. Set `DATABASE_URL`.
3. Code returns but the friend cannot join → the row expired (3 minutes idle,
   10 minutes total) or the code was mistyped; codes exclude I, L, O and U.
4. Connected but keys do nothing → the friend must tick **I am player two**, and
   the game must be one of the verified two-player titles.
