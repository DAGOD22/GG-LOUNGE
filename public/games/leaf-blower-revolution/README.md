# Leaf Blower Revolution (web build)

A browser build of **Leaf Blower Revolution**, an idle game, exported with GameMaker's HTML5 (Emscripten/WebAssembly) runner.

## Project layout

```
.
├── index.html        # page + runner glue (canvas, loader, GG-Lounge integration)
├── gx-storage.js     # save storage host (IndexedDB) for the runner
├── account-relay.js  # routes the game's account calls through /api/lbr-account
├── game.unx          # game data — fetched from the *page* directory, not js/
└── js/
    ├── runner.js     # GameMaker Emscripten runner
    ├── runner.wasm   # runner WebAssembly binary
    ├── runner.data   # engine data
    └── runner.json   # runner config
```

`index.html` sets `gameRuntimeDir = 'js/'` for the engine files, but this build
requests `game.unx` relative to the page, so it lives here at the top level.

## Saves

This build only persists saves when the host page provides a `gameStorage`
API (the runner mounts `/_savedata` on `window.oprt.gameStorage` when present).
`gx-storage.js` supplies that API backed by IndexedDB, so the game's own
`save.dat` / `options.dat` survive a reload. When the player is signed in, the
page mirrors those files (gzip + base64) into the GG-Lounge account save slot
via `/api/save/leaf-blower-revolution`, and pulls them back on a new device.

The game's files themselves are unmodified apart from the moved `game.unx`.

## Running locally

The game must be served over HTTP. Opening `index.html` from disk (`file://`) won't work because the browser blocks loading the `.wasm` and data files.

```bash
# from the repo root
python3 -m http.server 8080
# or
npx serve .
```

Then open <http://localhost:8080>.

## Adding the game data

Put `game.unx` and any other data/audio files that came with the original export into `js/`, next to `runner.wasm`.

## Notes

- **Audio warnings in the console:** lines like `Prevented call into an uninitialised yyal from Audio_EngineInvokeCallback` are normal. Browsers keep audio locked until the first click or key press.
- **Startup fix:** the stripped-down `index.html` originally crashed with `setAddAsyncMethod is not defined`. The runner calls `setAddAsyncMethod` and `setWadLoadCallback` at startup, and the stock GameMaker page defines them. They are now defined in `index.html`.

## Hosting on GitHub Pages

1. Push the repo with `index.html` at the root.
2. In **Settings → Pages**, choose the branch and `/ (root)`.
3. Open the Pages URL once it has deployed.

If the `.wasm` file is over GitHub's 100 MB file limit, host it elsewhere. At about 5.7 MB it is well under.

## Credits

Leaf Blower Revolution and its assets belong to their original creators. This repository only contains a web build and the loader page. Make sure you have the right to redistribute the game files before publishing.
