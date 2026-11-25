#!/usr/bin/env node
/**
 * Strip the mirror site's own furniture from installed game builds.
 *
 * The builds we fetch are complete and genuine, but the mirror's pages also
 * load its ad script and analytics from `/js/main.js`. That file is not part of
 * any game (it injects AdSense + a third-party tracker and rewrites the title),
 * and the lounge should never ship someone else's analytics or ad code.
 *
 * This removes the include and points any leftover absolute links back at the
 * lounge. It touches no game code.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("public/games");
const INCLUDE = /[ \t]*<script[^>]*src=["']\/js\/main\.js["'][^>]*>\s*<\/script>\s*\r?\n?/gi;
const HOME_LINKS = /https?:\/\/3kh0\.(?:github\.io|net)\/?/gi;

let pages = 0, links = 0;
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { await walk(full); continue; }
    if (!/\.html?$/i.test(entry.name)) continue;
    const original = await fs.readFile(full, "utf8");
    let next = original.replace(INCLUDE, "");
    const before = next;
    next = next.replace(HOME_LINKS, "/");
    if (next !== original) {
      await fs.writeFile(full, next);
      pages++;
      if (next !== before) links++;
    }
  }
}
await walk(ROOT);
process.stdout.write(`cleaned ${pages} page(s); rewrote ${links} mirror link(s)\n`);
