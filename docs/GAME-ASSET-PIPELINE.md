# Game asset pipeline

Everything under `public/games/` is served straight from the static bundle, so
what sits in the repository *is* the deploy. Three scripts keep that tree honest.

## `scripts/audit-games.mjs` — is each game actually playable?

Runs on `predev` and `prebuild`, and writes `lib/game-assets.json`. The catalogue
filters on that file, so a title whose files go missing drops out of the library
instead of showing a black screen. It checks the entry point, local runtime
scripts, remote CDN loaders, external iframes and Unity's preload manifest.

## `scripts/dedupe-game-assets.mjs` — is it stored once on disk?

Several titles ship byte-identical payloads: the same Ruffle runtime in 47 Flash
games, the same `nape.min.js` in six, the same Cut the Rope art atlases. Git
stores identical blobs once, but a checkout writes every copy to disk, which
added up to ~441 MB of duplicate bytes in a 3.2 GB tree.

```bash
npm run dedupe:games          # report what is duplicated
npm run dedupe:games:apply    # hardlink the duplicates together
```

Duplicates become **hardlinks**, not symlinks. That distinction is load-bearing:
symlinks are not deployable here. Vercel copies `public/` and dereferences links
as it goes, so a link whose target sits inside `public/` fails the build with
`Cannot copy X to a subdirectory of itself`, and a link pointing outside it
fails the same way. Two production builds died on exactly that before this
settled on hardlinks.

A hardlink is an ordinary file to every tool that looks at it — same size, same
mode, same content, no link to follow. Node, `next dev`, `next start`, the asset
audit and the CDN upload all see a normal file. `--restore` breaks every group
back into independent copies, which you want before editing a shared asset in
one game, since linked games share bytes by design.

Honest limit: hardlinks save disk **in this checkout**. Git records no link
metadata, so a fresh clone and a Vercel build materialise ordinary files. This
is a local-disk optimisation, not a deploy-size one — the `Cache-Control` rules
below are what actually reduce bytes over the wire for players.

`tests/game-assets-dedupe.test.ts` fails if identical payloads stop sharing an
inode, if any symlink appears under `public/games`, or if a widely-shared payload
changes size.

## `scripts/enable-flash-saves.mjs` — does a Flash game remember anything?

Ruffle keeps Flash shared objects (high scores, saved levels, unlocks) in memory
unless told otherwise, which means every reload wiped progress. The script
injects a config block immediately before `ruffle.js`, because Ruffle reads
`window.RufflePlayer.config` at load time:

```js
window.RufflePlayer.config = { storage: "disk", localStorage: true, ... }
```

Re-run `npm run flash-saves` after importing new Flash titles.

## Saving in non-Flash games

`public/games/_shared/gg-save.js` is a small storage helper with a deliberate
fallback chain: `localStorage` → `document.cookie` → `window.name`. Games on
this site are third-party builds we do not want to fork, so the helper provides
a stable API instead of assuming `localStorage` works. Keys are namespaced by
game directory, so two games using a `score` key never collide.

```js
GGSave.set('best', 1337);
GGSave.get('best', 0);
GGSave.saveState({ level: 7, coins: [1, 2] });
GGSave.loadState();
```

Games wired up so far: **2048** (full board + score resume), **Candy Crush**
(best score), **Doodle Jump** (best score, shown on game over), and all **51**
Ruffle titles via persistent Flash storage.

`tests/game-saves.test.ts` runs the helper in a sandbox with `localStorage`
deliberately throwing, and asserts the cookie fallback still persists — so the
school-Chromebook case stays covered.

## Caching

`next.config.mjs` sets long-lived `Cache-Control` for `/games/*`, `/game-icons/*`
and `/thumbnails/*`. Before that, 3.2 GB of assets shipped with no cache header
at all and every visitor re-downloaded them on every page view. Game entry HTML
gets a shorter window so a newly shipped build is picked up quickly.
