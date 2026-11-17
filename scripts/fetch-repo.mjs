#!/usr/bin/env node
/**
 * Install a self-contained browser game from its public GitHub repository.
 *
 * Only legitimate open-source projects are listed here: the developers publish
 * these builds for the web. Files are copied verbatim into public/games/<id>/
 * so the game runs entirely from our own origin — no iframe, no CDN loader, no
 * remote dependency at runtime.
 *
 * Usage: node scripts/fetch-repo.mjs [id ...]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import https from "node:https";

const insecure = process.env.GG_INSECURE_FETCH === "1";
const agent = new https.Agent({ rejectUnauthorized: false });
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const headers = { Accept: "application/vnd.github+json", "User-Agent": "gg-lounge-repo-fetcher", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };

let rawFetch = globalThis.fetch;
async function get(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      if (!insecure) {
        const res = await rawFetch(url, { headers });
        if (res.status === 403 || res.status === 429) { await new Promise(r => setTimeout(r, 4000 * (attempt + 1))); continue; }
        return res;
      }
      return await new Promise((resolve, reject) => {
        https.get(url, { headers, agent }, response => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", chunk => { body += chunk; });
          response.on("end", () => resolve({ status: response.statusCode, ok: (response.statusCode || 0) < 300, text: async () => body, json: async () => JSON.parse(body) }));
        }).on("error", reject);
      });
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`GitHub refused ${url}`);
}

/** id -> { repo, branch?, subdir? } */
const GAMES = {
  // --- round 4 ---
  'asteroids':          { repo: 'dmcinnes/HTML5-Asteroids',               subdir: '' },
  'invaderz':           { repo: 'victorqribeiro/invaderz',                subdir: '' },
  'space-invaders':     { repo: 'dwmkerr/spaceinvaders',                  subdir: '' },
  'sudoku':             { repo: 'robatron/sudoku.js',                     subdir: '' },

  // --- round 3: starred classics ---
  'infinite-mario':     { repo: 'robertkleffner/mariohtml5',              subdir: '', entry: 'main.html' },
  'pacman-classic':     { repo: 'mumuy/pacman',                           subdir: '' },
  'minesweeper-css':    { repo: 'propjockey/css-sweeper',                 subdir: '' },
  'bomberman':          { repo: 'MattSkala/html5-bombergirl',             subdir: '' },

  // --- round 2: famous incremental/idle games + starred arcade classics ---
  'kittensgame':        { repo: 'nuclear-unicorn/kittensgame',            subdir: '' },
  'universal-paperclips': { repo: 'jgmize/paperclips',                    subdir: '' },
  'antimatter-dimensions': { repo: 'IvarK/AntimatterDimensions',            subdir: '' },
  'space-company':      { repo: 'sparticle999/SpaceCompany',               subdir: '' },
  'hextris':            { repo: 'hextris/hextris',                        subdir: '', branch: 'gh-pages' },
  'chrome-dino':        { repo: 'wayou/t-rex-runner',                     subdir: '', branch: 'gh-pages' },
  'hexgl':              { repo: 'BKcore/HexGL',                           subdir: '' },
  'react-tetris':       { repo: 'chvin/react-tetris',                     subdir: 'docs' },
  'snakes':             { repo: 'jakesgordon/javascript-snakes',          subdir: '' },
  'pong':               { repo: 'jakesgordon/javascript-pong',            subdir: '' },
  'breakout-arcade':    { repo: 'jakesgordon/javascript-breakout',        subdir: '' },
  'js-paint':           { repo: '1j01/jspaint',                           subdir: '' },

  "a-dark-room": { repo: "doublespeakgames/adarkroom" },
  trimp: { repo: "Trimps/Trimps.github.io" },
  untrusted: { repo: "AlexNisnevich/untrusted" },
  "browserquest": { repo: "mozilla/BrowserQuest", subdir: "client" },
  pacman: { repo: "daleharvey/pacman" },
  astray: { repo: "wwwtyro/Astray" },
  "clumsy-bird": { repo: "ellisonleao/clumsy-bird" },
  "2048-classic": { repo: "gabrielecirulli/2048" },
  skifree: { repo: "basicallydan/skifree.js" },
  "js-racer": { repo: "jakesgordon/javascript-racer" },
  gauntlet: { repo: "jakesgordon/javascript-gauntlet" },
  "javascript-tetris": { repo: "jakesgordon/javascript-tetris" },
  "snake-arcade": { repo: "patorjk/JavaScript-Snake", subdir: "src" },
  "simple-chess-ai": { repo: "lhartikk/simple-chess-ai" },
  "pathfinding-visualizer": { repo: "qiao/PathFinding.js", subdir: "visual" },
};

const ROOT = path.resolve("public/games");
const wanted = process.argv.slice(2);
const entries = Object.entries(GAMES).filter(([id]) => !wanted.length || wanted.includes(id));

async function tree(repo, branch) {
  const res = await get(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`);
  const data = await res.json();
  if (!data.tree) throw new Error(`no tree for ${repo}`);
  return data.tree.filter(entry => entry.type === "blob");
}

const results = [];
for (const [id, spec] of entries) {
  try {
    const meta = await (await get(`https://api.github.com/repos/${spec.repo}`)).json();
    const branch = spec.branch || meta.default_branch || "master";
    let files = await tree(spec.repo, branch);
    const prefix = spec.subdir ? `${spec.subdir.replace(/^\/+|\/+$/g, "")}/` : "";
    if (prefix) files = files.filter(file => file.path.startsWith(prefix));
    files = files.filter(file => !/^(\.github|node_modules|\.git)\//.test(file.path));
    const indexRe = /(^|\/)index\.html$/;
    if (!files.some(file => indexRe.test(file.path)) && !(spec.entry && files.some(file => file.path.endsWith(spec.entry)))) {
      results.push({ id, ok: false, reason: "no index.html" }); continue;
    }
    const bytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    process.stdout.write(`${id.padEnd(24)} ${String(files.length).padStart(4)} files ${(bytes / 1048576).toFixed(1).padStart(6)} MB `);
    const destination = path.join(ROOT, id);
    await fs.rm(destination, { recursive: true, force: true });
    let done = 0;
    for (const file of files) {
      const relative = prefix ? file.path.slice(prefix.length) : file.path;
      if (!relative) continue;
      const target = path.join(destination, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const res = await get(`https://api.github.com/repos/${spec.repo}/git/blobs/${file.sha}`);
      const data = await res.json();
      await fs.writeFile(target, Buffer.from(data.content, data.encoding === "base64" ? "base64" : "utf8"));
      done++;
    }
    if (spec.entry) {
      await fs.copyFile(path.join(destination, spec.entry), path.join(destination, "index.html"));
    }
    process.stdout.write(`-> installed ${done}\n`);
    results.push({ id, ok: true, bytes });
  } catch (error) {
    process.stdout.write(`-> FAILED ${String(error.message).slice(0, 90)}\n`);
    results.push({ id, ok: false, reason: error.message });
  }
}
const ok = results.filter(r => r.ok);
process.stdout.write(`\ninstalled ${ok.length}/${results.length} repos, ${(ok.reduce((s, r) => s + r.bytes, 0) / 1048576).toFixed(1)} MB\n`);
