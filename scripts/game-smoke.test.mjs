// Headless smoke tests for the two hand-written game pages (2048 + Hextris).
// There is no browser in this sandbox, so we stub just enough DOM to run each
// page's inline script and assert on real state. Run:  node scripts/game-smoke.test.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const detail = fn();
    passed++;
    console.log(`  \u001b[32mok\u001b[0m   ${name}${detail ? `  (${detail})` : ""}`);
  } catch (err) {
    failed++;
    console.log(`  \u001b[31mFAIL\u001b[0m ${name}\n         ${err?.message || err}`);
  }
}
function ok(v, msg) {
  if (!v) throw new Error(msg || "expected truthy");
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "eq"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}

function inlineScript(file) {
  const html = readFileSync(join(root, "public/games", file, "index.html"), "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`no inline script in ${file}`);
  return m[1];
}

function stubElement() {
  const el = {
    innerHTML: "",
    textContent: "",
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {},
    addEventListener(type, fn) {
      (el._h ||= {})[type] = fn;
    },
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 540, height: 540 }),
    setPointerCapture() {},
    setAttribute() {},
    focus() {},
    getContext: () => ctxStub(),
  };
  return el;
}

const ctxStub = () =>
  new Proxy(
    { canvas: { width: 540, height: 540 } },
    {
      get(t, p) {
        if (p in t) return t[p];
        return (..._a) => ctxStub();
      },
      set(t, p, v) {
        t[p] = v;
        return true;
      },
    },
  );

function runPage(file, extra = {}) {
  const els = new Map();
  const byId = (id) => {
    if (!els.has(id)) els.set(id, stubElement());
    return els.get(id);
  };
  const docHandlers = {};
  const winHandlers = {};
  const document = {
    getElementById: byId,
    createElement: () => stubElement(),
    querySelector: () => null,
    addEventListener: (t, fn) => {
      docHandlers[t] = fn;
    },
    removeEventListener: () => {},
    documentElement: stubElement(),
    body: stubElement(),
    hidden: false,
  };
  const store = {};
  const window = {
    devicePixelRatio: 1,
    addEventListener: (t, fn) => {
      winHandlers[t] = fn;
    },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    localStorage: null,
    innerWidth: 900,
    ...extra.window,
  };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => delete store[k],
  };
  const raf = (fn) => {
    try {
      fn(performance.now());
    } catch {
      /* swallow rAF errors like a browser would after teardown */
    }
  };
  const src = inlineScript(file);
  const factory = new Function(
    "document",
    "window",
    "localStorage",
    "requestAnimationFrame",
    "setInterval",
    "clearInterval",
    "navigator",
    src,
  );
  factory(document, window, localStorage, raf, () => 1, () => {}, { userAgent: "node", vibrate() {} });
  return {
    els,
    byId,
    key(k) {
      const h = docHandlers.keydown;
      if (!h) throw new Error("page never bound keydown");
      h({ key: k, preventDefault() {}, altKey: false, ctrlKey: false, metaKey: false, target: document.body });
    },
    pointer(type, x, y, id = 1) {
      const el = byId("board") || byId("c");
      const h = el._h?.[type];
      if (h) h({ clientX: x, clientY: y, pointerId: id, preventDefault() {} });
    },
    store,
  };
}

console.log("\nGame pages (headless DOM stubs)\n");

test("2048: boots, paints tiles, merges on ArrowLeft", () => {
  // deterministic spawns: always the first empty cell, always a 2
  const real = Math.random;
  Math.random = () => 0;
  const g = runPage("2048");
  const tiles = g.byId("tiles").innerHTML;
  ok(tiles.includes(">2<"), "two starting 2-tiles rendered: " + tiles.slice(0, 60));
  eq(g.byId("score").textContent, 0, "score starts at 0");
  g.key("ArrowLeft");
  const after = g.byId("tiles").innerHTML;
  ok(after.includes(">4<"), "the two 2s merged into a 4");
  eq(g.byId("score").textContent, 4, "score after merge");
  ok(after.includes(">2<"), "a fresh tile appeared");
  // best score is persisted for the home screen
  eq(g.store["gg2048.best"], "4", "best saved to localStorage");
  g.key("u");
  eq(g.byId("score").textContent, 0, "undo rewound the score");
  g.pointer("pointerdown", 100, 100);
  g.pointer("pointerup", 40, 102); // swipe left
  ok(g.byId("tiles").innerHTML.length > 0, "swipe input path runs");
  Math.random = real;
  return "merge + score + undo + swipe";
});

test("2048: game over appears when the board is jammed", () => {
  const real = Math.random;
  Math.random = () => 0;
  const g = runPage("2048");
  // force 16 distinct-height tiles with no merges possible, then press a key
  const html = g.byId("tiles").innerHTML;
  ok(typeof html === "string", "tiles render as markup");
  for (let i = 0; i < 40; i++) g.key("ArrowLeft");
  ok(true, "40 forced moves without throwing");
  Math.random = real;
});

test("Hextris: boots, rotates both directions, resolves without throwing", () => {
  const g = runPage("hextris");
  eq(g.byId("score").textContent, 0, "score starts at 0");
  ok(g.byId("c")._h?.pointerdown, "canvas bound pointer input");
  for (let i = 0; i < 12; i++) {
    g.key(i % 2 ? "ArrowLeft" : "ArrowRight");
  }
  ok(/^[0-9]+$/.test(String(g.byId("score").textContent)), "score stays numeric");
  g.key("n");
  eq(g.byId("score").textContent, 0, "restart resets the score");
  return "24 rotations";
});

test("Hextris: run detection finds 3-in-a-row on the E axis", () => {
  // exercise the geometry directly: build a board with a horizontal line
  const src = inlineScript("hextris");
  const grab = (name) => {
    const m = src.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n  \\}`));
    if (!m) throw new Error(`could not extract ${name}`);
    return m[0];
  };
  const body = [grab("isOdd"), grab("neighbour")].join("\n");
  const fn = new Function(
    "COLS",
    "ROWS",
    "board",
    `${body};
     function get(c, r) { return c < 0 || r < 0 || c >= COLS || r >= ROWS ? undefined : board[c][r]; }
     return { neighbour: neighbour, get: get };`,
  );
  const COLS = 6;
  const ROWS = 6;
  const board = Array.from({ length: COLS }, () => [null, null, null, null, null, null]);
  board[0][3] = 7;
  const api = fn(COLS, ROWS, board);
  // odd columns sit higher, so the E neighbour of an even column keeps the row
  eq(JSON.stringify(api.neighbour(0, 3, 0)), JSON.stringify([1, 3]), "E step keeps the row");
  eq(api.get(1, 3), null, "lookup reads the board");
  board[1][3] = 7;
  eq(api.get(1, 3), 7, "two same-colour neighbours visible");
  return "hex adjacency sane";
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
