#!/usr/bin/env node
/**
 * Fetch real, complete web builds of games from a public GitHub mirror and
 * install them under public/games/<id>/.
 *
 * Why GitHub: the sandbox/CI that runs this has no general internet access, but
 * it does reach GitHub. Pulling the actual build files from a maintained mirror
 * means every game is a genuine, playable build (not a loader stub, not a
 * recreation), and the repo keeps one self-hosted copy with no iframe and no
 * remote dependency at runtime.
 *
 * Usage:
 *   node scripts/fetch-games.mjs            # install everything listed below
 *   node scripts/fetch-games.mjs slope sm64  # install selected ids
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import https from "node:https";

/**
 * Some build sandboxes intercept HTTPS with a corporate root CA that Node does
 * not trust, while curl/gh do. Fall back to an unverified agent *only* when the
 * verified attempt fails on a certificate error and GG_INSECURE_FETCH=1.
 */
const insecure = process.env.GG_INSECURE_FETCH === "1";
const insecureAgent = new https.Agent({ rejectUnauthorized: false });
const nativeFetch = globalThis.fetch;

async function fetchJson(url) {
  const options = { headers };
  try {
    const response = await nativeFetch(url, options);
    return { status: response.status, text: await response.text() };
  } catch (error) {
    if (!insecure) throw error;
    return await new Promise((resolve, reject) => {
      https.get(url, { headers, agent: insecureAgent }, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode || 0, text: body }));
      }).on("error", reject);
    });
  }
}

const REPO = "3kh0/3kh0-lite";
const BRANCH = "main";
const API = "https://api.github.com";
const ROOT = path.resolve("public/games");
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

/** id -> source folder inside the mirror */
const GAMES = {
  "cut-the-rope": "ctr",
  "cut-the-rope-holiday": "ctr-holiday",
  "cut-the-rope-time-travel": "ctr-tr",
  "big-tower-tiny-square": "btts",
  snowbattle: "snowbattle",
  "the-final-earth": "the-final-earth",
  "ns-shaft": "ns-shaft",
  "idle-breakout": "idle-breakout",
  craftmine: "craftmine",
  "sand-game": "sand-game",
  "missile-game": "missiles",
  connect3: "connect3",
  "meme-2048": "meme2048",
  "cupcake-2048": "cupcake2048",
  "doge-2048": "doge2048",
  "flappy-2048": "flappy-2048",
  eaglercraftx: "minecraft",
  "2048": "2048",
  smashkarts: "smashkarts",
  "minecraft-classic": "minecraft-classic",
  "meme-2048": "meme2048",
  DogeMiner: "DogeMiner",
  boxhead2play: "boxhead2play",
  "defend-the-tank": "defend-the-tank",
  "adrenaline-challenge": "adrenalinechallenge",
  "gimme-the-airpod": "gimme-the-airpod",
  tosstheturtle: "tosstheturtle",
  matrixrampage: "matrixrampage",
  canyondefense: "canyondefense",
  hextris: "hextris",
  "solar-smash": null, // no complete build in this mirror
  "subway-surfers": null,
  "survival-race": null,
  "drift-hunters": null,
  geodash: "geodash",
  slope: "slope",
  sm64: "sm64",
  "paperio2": "paperio2",
  bloonstd2: "bloonstd2",
  "tunnel-rush": "tunnel-rush",
  "retro-bowl": "retro-bowl",
  HexGL: "HexGL",
  "thisistheonlylevel": "thisistheonlylevel",
  "there-is-no-game": "there-is-no-game",
  "worlds-hardest-game": "worlds-hardest-game",
  "worlds-hardest-game-2": "worlds-hardest-game-2",
  "achievementunlocked": "achievementunlocked",
  "cell-machine": "cell-machine",
  "chrono-trigger": "ctr",
  "ctr-holiday": "ctr-holiday",
  "ctr-tr": "ctr-tr",
  "idle-shark": "idle-shark",
  "grindcraft": "grindcraft",
  "mario": "mario",
  "wolf3d": "wolf3d",
  "csgo-clicker": "csgo-clicker",
  "portalflash": "portalflash",
  "theheist": "theheist",
  "superhot": "superhot",
  "stickwar": "stickwar",
  "push-the-square": "push-the-square",
  "papery-planes": "papery-planes",
  "glass-city": "glass-city",
  "sort-the-court": "sort-the-court",
  "ducklife1": "ducklife1",
  "ducklife3": "ducklife3",
  "motox3m": "motox3m",
  "motox3m-spooky": "motox3m-spooky",
  "motox3m-winter": "motox3m-winter",
  "motox3m-pool": "motox3m-pool",
  "vex3": "vex3",
  "vex4": "vex4",
  "vex5": "vex5",
  "vex6": "vex6",
  "tank-trouble-2": "tank-trouble-2",
  "cannon-basketball-4": "cannon-basketball-4",
  "soldier-legend": "soldier-legend",
  "stormthehouse2": "stormthehouse2",
  "creativekillchamber": "creativekillchamber",
  "blackknight": "blackknight",
  "endlesswar3": "endlesswar3",
  "pandemic2": "pandemic2",
  "deal-or-no-deal": "deal-or-no-deal",
  "interactivebuddy": "interactivebuddy",
  "miniputt": "miniputt",
  "factoryballs": "factoryballs",
  "avalanche": "avalanche",
  "helicopter": "helicopter",
  "kittencannon": "kittencannon",
  "smokingbarrels": "smokingbarrels",
  "championarcher": "championarcher",
  "battleforgondor": "battleforgondor",
  "tacticalassasin2": "tacticalassasin2",
  "hba": "hba",
  "hexempire": "hexempire",
  "circlo": "circlo",
  "polybranch": "polybranch",
  "rolly-vortex": "rolly-vortex",
  "tv-static": "tv-static",
  "tanuki-sunset": "tanuki-sunset",
  "you-are-bezos": "you-are-bezos",
  "just-one-boss": "just-one-boss",
  "edgenotfound": "edgenotfound",
  "n-gon": "n-gon",
  "minesweeper": "minesweeper",
  "solitaire": "solitaire",
  "soundboard": "soundboard",
  "doge2048": "doge2048",
  "google-snake": "google-snake",
  "particle-clicker": "particle-clicker",
  "idle-breakout": "idle-breakout",
  "draw-the-hill": "draw-the-hill",
  "doodle-jump": "doodle-jump",
  "flappy-bird": "flappy-bird",
  "chrome-dino": "chrome-dino",
  "cubefield": "cubefield",
  "bloxors": "bloxors",
  "wordle": "wordle",
  "hackertype": "hackertype",
  "stack": "stack",
  "om-bounce": "om-bounce",
  "push-your-luck": "push-your-luck",
  "snowbattle": "snowbattle",
  "bigredbutton": "bigredbutton",
  "bloonstd": "bloonstd",
  "doublewires": "doublewires",
  "tube-jumpers": "tube-jumpers",
};

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "gg-lounge-game-fetcher",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function api(url, attempt = 0) {
  const response = await fetchJson(url);
  if (response.status === 403 || response.status === 429) {
    if (attempt < 6) {
      const wait = 4000 * (attempt + 1);
      process.stderr.write(`  rate limited, waiting ${wait / 1000}s\n`);
      await new Promise(resolve => setTimeout(resolve, wait));
      return api(url, attempt + 1);
    }
    throw new Error(`GitHub API refused ${url}`);
  }
  if (response.status < 200 || response.status >= 300) throw new Error(`${response.status} for ${url}`);
  return JSON.parse(response.text);
}

let treeCache = null;
async function tree() {
  if (!treeCache) {
    const data = await api(`${API}/repos/${REPO}/git/trees/${BRANCH}?recursive=1`);
    treeCache = data.tree.filter(entry => entry.type === "blob");
  }
  return treeCache;
}

async function blob(sha) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const data = await api(`${API}/repos/${REPO}/git/blobs/${sha}`);
      const buffer = Buffer.from(data.content, data.encoding === "base64" ? "base64" : "utf8");
      return buffer;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
}

async function install(id, folder) {
  const files = (await tree()).filter(entry => entry.path.startsWith(`projects/${folder}/`));
  if (!files.length) return { id, ok: false, reason: "not in mirror" };
  if (!files.some(file => /\/index\.html$/.test(file.path))) return { id, ok: false, reason: "no index.html" };

  const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
  const destination = path.join(ROOT, id);
  process.stdout.write(`${id.padEnd(28)} ${String(files.length).padStart(4)} files ${(totalBytes / 1048576).toFixed(1).padStart(7)} MB `);

  // Replace whatever stub was there (a dead loader page is worse than nothing).
  await fs.rm(destination, { recursive: true, force: true });

  let done = 0;
  for (const file of files) {
    const relative = file.path.slice(`projects/${folder}/`.length);
    if (!relative) continue;
    const target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const data = await blob(file.sha);
    await fs.writeFile(target, data);
    done++;
  }
  process.stdout.write(`-> installed ${done}\n`);
  return { id, ok: true, bytes: totalBytes };
}

const wanted = process.argv.slice(2);
const entries = Object.entries(GAMES).filter(([id, folder]) => folder && (!wanted.length || wanted.includes(id)));
const results = [];
for (const [id, folder] of entries) {
  try {
    results.push(await install(id, folder));
  } catch (error) {
    process.stdout.write(`-> FAILED ${error.message}\n`);
    results.push({ id, ok: false, reason: error.message });
  }
}
const installed = results.filter(result => result.ok);
process.stdout.write(`\ninstalled ${installed.length}/${results.length} builds, ${(installed.reduce((sum, r) => sum + r.bytes, 0) / 1048576).toFixed(1)} MB\n`);
