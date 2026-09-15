# Game catalog: what ships, what streams, what is safe to click

The lounge advertises 100 games in `app/page.tsx`, and after this audit every one of them
resolves to a real `public/games/<id>/index.html`. Anything published later — from `/admin`
or an approved request — is served by `app/games/[id]/route.ts` instead, which injects the same
engine. This file records how each group is loaded, because the failure modes are different and
so is the fix.

## 1. Fully offline games (the default)

Everything that ships its own assets — HTML, JS, wasm, images, fonts. These run with the
network switched off, which is what you want on a school connection that blocks random CDNs.
`app/api/games/…` is not involved; the file is served straight from `public/`.

Every one of them gets `/gg/gg-boot.js` injected, so the theme, cloak, panic key and
background engine apply inside the game frame the same way they do in the lounge.

## 2. Streaming games (five of them)

```
geometry-dash      solar-smash      survival-race
subway-surfers     vex-8
```

These folders contain only `index.html`. Their builds are hundreds of megabytes of Unity /
custom-engine data that never went into git on purpose — the repo would be unusable. Instead
each page carries a small loader that:

1. writes a `<base href>` pointing at a mirror,
2. rotates through three mirrors (`cdn.jsdelivr.net`, `cdn.statically.io`, `raw.githack.com`)
   with a `HEAD` probe, remembering the winner in `localStorage` (`ggl_cdn_<id>`),
3. and, if every mirror is blocked, replaces the page with a plain message:
   *“Game files blocked on this network”*.

Consequences you should expect:

- They need an unblocked CDN. On a filter that kills `jsdelivr`, the probe finds `statically`
  or `githack`; on a filter that kills all three, you get the message instead of a spinner.
- The first load downloads the whole build; subsequent loads come from the browser cache.
- Nothing about them is broken locally — a “missing asset” report for one of these five is
  usually a false positive, because their relative URLs resolve against the remote `<base>`.
- You can force a mirror by hand: `/games/vex-8/index.html?cdn=2`.

If you want one of them fully offline, download the build into the folder (the loader's
`<base>` is only written when the file is missing remotely, so a local copy wins) or replace
the page with the self-contained build.

## 3. Rebuilt from scratch

`2048` and `hextris` were previously **phantom submodules**: the index held a gitlink
(mode `160000`) for each folder with no matching entry in `.gitmodules`, so a fresh clone
checked out two empty directories. `git checkout` could not fail louder than that.

Both are now real, dependency-free files committed in-tree:

| File | What it is |
| --- | --- |
| `public/games/2048/index.html` | DOM-board 2048: arrow keys/WASD, pointer swipe, undo (30 deep), best score in `localStorage`, win at 2048 with “keep going”. |
| `public/games/hextris/index.html` | Canvas Hextris: six staggered columns, tap the left/right half (or `←`/`→`, `Q`/`E`) to spin three columns at a time, 3-in-a-line clears on all three hex axes, speed rises with score. |

Their move/match logic is covered by `npm run test:games`, which runs both pages against a stub
DOM and asserts real state — that harness is what caught two boot-order crashes in Hextris.

## 4. Repairs made in the audit

| Game | Problem | Fix |
| --- | --- | --- |
| `mario` | `<script>` tag pointed at the literal string `FullScreenMario-<%= version %>.min.js` (an unrendered template) | dead tag removed; the local `FullScreenMario.js` loads |
| `idle-mining` | `index.html` was a 368-byte stub that bounced to a mod importer and linked a `style.css` that does not exist | `index.html` is now an iframe host for `game/game.html` |
| `idle-mining/game` | `p5.js` loaded with `async` after an absolute `/home/me/Desktop/...` path | removed the dead path, dropped `async` so `p5` exists before `setup()` |
| `among-us` | `img/red.png` in the icon links | corrected to `red.png` |
| `alienhominid` | favicon named `bloonstd.jpg` | `alienhominid.jpg` |
| `slope` | favicon under `TemplateData/` | `/brand/icon-32.png` |
| `level-devil` | loaded `.poki-stub.js`, but the shipped file is `poki-stub.js` (no leading dot) | reference corrected — the offline Poki no-op stub now actually loads |
| `papasburgeria` | three empty `<script src="">` tags plus `prebid4.12.0.js` and a UUID script left over from the capture | removed |
| `cookie-clicker` | “Try the beta!” linked to a `beta/` folder that is not shipped | hidden |

## 5. Known cosmetic leftovers

`TemplateData/style.css` in the Unity builds references progress-bar and logo PNGs that were
never captured, and a few `@font-face` blocks still list `.eot`/`.svg` sources. Browsers ignore
both: you get a plain black loading screen instead of a Unity logo, and system fonts instead of
the bundled display face. Nothing gates gameplay, so they were deliberately left alone.

## 6. Re-running the audit

```bash
# every local src/href in every game page, resolved inside its own folder
python3 - <<'PY'
import os, re, pathlib
root = pathlib.Path('public/games')
for d in sorted(p for p in root.iterdir() if p.is_dir()):
    idx = d / 'index.html'
    if not idx.exists():
        print(d.name, 'NO INDEX', 'empty' if not any(d.iterdir()) else ''); continue
    html = re.sub(r'<!--.*?-->', '', idx.read_text(errors='ignore'), flags=re.S)
    files = {str(pathlib.Path(dp)/n).replace(f'{d}/', '') for dp, _, ns in os.walk(d) for n in ns}
    for m in re.finditer(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', html):
        u = m.group(1)
        if u.startswith(('http', '//', '#', 'data:', '/', 'mailto:', 'javascript:')): continue
        u2 = u.split('?')[0].split('#')[0]
        if u2 and u2 not in files and not (d / u2).exists() and not (d / u2).is_dir():
            print(d.name, 'missing', u2)
PY
node scripts/game-smoke.test.mjs   # 2048 + Hextris logic
```

Zero output from the first script (excluding the five streaming titles in §2) is the goal.
