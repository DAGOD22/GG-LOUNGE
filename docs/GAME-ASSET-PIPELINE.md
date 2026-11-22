# Game asset pipeline

Everything under `public/games/` is served straight from the static bundle, so
what sits in the repository *is* the deploy. Three scripts keep that tree honest.

## `scripts/audit-games.mjs` — is each game actually playable?

Runs on `predev` and `prebuild`, and writes `lib/game-assets.json`. The catalogue
filters on that file, so a title whose files go missing drops out of the library
instead of showing a black screen. It checks the entry point, local runtime
scripts, remote CDN loaders, external iframes and Unity's preload manifest.

## `scripts/dedupe-game-assets.mjs` — is it shipped once?

Several titles ship byte-identical payloads: the same Ruffle runtime in 47 Flash
games, the same `nape.min.js` in six, the same Cut the Rope art atlases. Git
stores identical blobs once, but a checkout writes every copy to disk and every
deploy uploads every copy, which added up to ~441 MB.

```bash
npm run dedupe:games          # report what is duplicated
npm run dedupe:games:apply    # replace the extra copies with symlinks
```

The first copy of each file stays where it is; the rest become absolute symlinks
into `public/games/_shared/`. Node, `next dev` and `next start` all follow these
transparently, including the correct `Content-Type` for `.wasm`.

Undo everything with `node scripts/dedupe-game-assets.mjs --restore`.
`tests/game-assets-dedupe.test.ts` fails the suite if a large duplicate
reappears, and if any link dangles.

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
