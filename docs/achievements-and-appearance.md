# Live achievements and appearance

## Achievements

There are **30** current achievements in `lib/achievements.ts`: 28 gameplay
milestones plus first-chat and first-note awards. Previous elapsed-time awards
remain in the database for historical preservation but are no longer issued or
included in the current gallery. Opening a game, waiting, or clicking its frame
is not an achievement.

### Instrumented games

| Game | Actual game-code event |
| --- | --- |
| Cookie Clicker | successful `ClickCookie`, positive `Earn`, successful building purchase |
| Stack | `placeBlock` with a placed mesh; consecutive bonus placements |
| Idle Mining | successful `gatherResource`, actual XP level-up |
| FableDevil | guarded `winLevel`, distinct cleared levels, clear after a death |

The catalog's existing **Level Devil** entry loads an external compiled game,
not the bundled `public/games/level-devil/game.js`. The latter is MIT-licensed
**FableDevil by Leonxlnx**. A separate FableDevil entry now exposes that existing
local implementation with a new HTML shell. The original Level Devil launcher
is unchanged and not misleadingly marked as tracked. Other remote/compiled
games likewise show that outcome tracking is unavailable. Nothing infers wins
from button clicks, time, or arbitrary scores scraped from an iframe.

Existing in-game saves qualify on the next relevant real action. Stack height
and streaks never add together across runs; mining gather counts are per session.

### Event contract

1. Include `/games/gg-events.js` before the game's scripts.
2. Call `window.GGLounge?.emit(metric, value)` **after** a successful state change.
3. Register the game's metrics and thresholds in `lib/achievements.ts`.
4. The bridge waits for the parent handshake, buffers early values, and sends
   only crossed thresholds, once each per frame lifetime. No gameplay polling.
5. The parent checks both exact same-origin and the active iframe's window,
   current game ID, metric allowlist, and finite bounded values.
6. The server recomputes slugs from the same catalog; clients cannot POST an
   arbitrary achievement slug to `/api/member` anymore.

Guest progress is browser-local. Signed-in progress is scoped by user ID and
queued locally for account sync, including offline retry on focus/reconnection
and on the next game event. Guests are not automatically merged into accounts.
Browser storage failure falls back to in-memory progress for the visit.
Account saves use the existing `achievement` table and its unique user/slug
constraint. Non-empty chat/note actions award their milestone in the same DB
transaction as the successfully saved content.

**Trust boundary:** these are personal browser-game milestones, not anti-cheat
proof. A determined user can alter client code or forge their own valid metric
requests. Competitive leaderboards would require authoritative game servers.

## Appearance

Open **Make it yours** at the bottom left. Changes apply immediately and persist
under `gg:appearance:v1` on this browser across routes.

- Original lounge theme.
- Aurora silk, Deep space, Liquid signal: bounded canvas effects with smoothed
  pointer movement, click ripples, and gentle keyboard pulses.
- Two Unsplash photo presets requesting **3840 × 2160** only on selection.
  Small local photos are thumbnails and failure fallbacks, **not 4K substitutes**.
- Two local, original abstract **3840 × 2160 / 24 fps / 10-second** H.264 videos.
  These are motion-graphics presets, not stock nature footage. Combined ~5.3 MB.
- System cursor, halo, crosshair accent, comet accent. Native pointers remain
  usable and embedded games keep their own cursor.
- Dimming, intensity, separate mouse/key switches, pause, and reset.

Only the selected video is mounted. Hidden tabs and gameplay pause background
animation/video to preserve performance. System reduced-motion uses static
scenes and disables cursor animations. The canvas caps DPR at 1.5 and particles
at 85 stars / 16 rings; reactive canvas is intentionally not forced to 4K.
Keyboard text, keys, and input values are never stored or transmitted; forms,
password fields, contenteditable regions, repeats, and shortcuts are ignored.

### Media provenance

- `photo-0.jpg`: lightweight thumbnail of Jonas Degener's Tenerife photograph,
  [original](https://unsplash.com/photos/mountains-meet-the-ocean-in-a-beautiful-landscape-eR54mSiITFU),
  [Unsplash License](https://unsplash.com/license).
- `photo-2.jpg`: lightweight thumbnail of the alpine forest photo returned by
  [Unsplash's forest-mountain collection](https://unsplash.com/s/photos/forest-mountain),
  source image `photo-1511497584788-876760111969`, Unsplash License.
- `aurora-flow.mp4`, `chromatic-dusk.mp4`, and their JPEG posters: original
  procedural gradients generated for this project. See the regeneration script.

Remote photographs require network access; a visible studio status explains a
fallback if a CDN request fails. Locally hosted videos and reactive scenes do
not depend on third-party media/CDNs.

## Checks

- `npm test` (Node 22.6+): catalog, thresholds, invalid payloads, handshake
  validation, deduplication, per-run semantics, actual Stack placement hook,
  mining gather hook, safe settings parsing.
- `npm run typecheck`: standalone strict TypeScript check (the pre-existing
  Next configuration skips type errors in `next build`).
- `npm run build`: production bundle.
- Browser checks performed at 1280px and 390px: native dialog/Escape, no mobile
  overflow, appearance persistence, 4K video dimensions, reduced-motion pause,
  active-frame source rejection, no launch awards, real FableDevil clear → toast
  → persistence, Cookie Clicker click and mining gather → persisted achievements.
- Mocked-account browser check: events (not slugs) POSTed, failed sync retained
  the per-user queue, and reconnect retried successfully and cleared the queue.

Live account/database writes cannot be verified without the project's
`DATABASE_URL`, auth tables, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`.
The sandbox currently has no database connection. Guest/local gameplay works
without it; account sync reports failure and retains its queue rather than
claiming that a failed request saved. No credentials are committed.
