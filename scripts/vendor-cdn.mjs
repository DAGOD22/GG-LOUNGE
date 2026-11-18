#!/usr/bin/env node
/**
 * Vendor third-party CDN assets into a game folder.
 *
 * Some of the open-source games we host still reference their libraries from a
 * CDN (jQuery, Vue, THREE, fonts, analytics). The lounge rule is that a game
 * runs entirely from our own origin, so every such reference is downloaded into
 * public/games/<id>/vendor/ and the HTML/CSS is rewritten to point at the local
 * copy. Analytics/ad snippets are removed outright rather than vendored.
 *
 * Usage: node scripts/vendor-cdn.mjs <gameId> [...]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import https from "node:https";

const ROOT = path.resolve("public/games");
const agent = new https.Agent({ rejectUnauthorized: false });

// Never worth vendoring: analytics, ads, tag managers, trackers.
const DROP = [
  /googletagmanager\.com/i, /google-analytics\.com/i, /googlesyndication\.com/i,
  /doubleclick\.net/i, /adsbygoogle/i, /hotjar\.com/i, /facebook\.net/i,
  /segment\.(com|io)/i, /mixpanel\.com/i, /clarity\.ms/i,
];
// Google Fonts stylesheets only pull webfonts; dropping them keeps the game's
// own CSS intact and just falls back to system fonts.
const DROP_CSS_FONT = /fonts\.googleapis\.com/i;

function download(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error("too many redirects"));
    https.get(url, { agent, headers: { "User-Agent": "gg-lounge-vendor" } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        return resolve(download(next, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ body: Buffer.concat(chunks), type: res.headers["content-type"] || "" }));
    }).on("error", reject);
  });
}

function localName(url) {
  const u = new URL(url);
  const base = path.basename(u.pathname) || "asset";
  const host = u.hostname.replace(/[^a-z0-9]+/gi, "-");
  return `${host}__${base}`.replace(/[^a-z0-9._-]+/gi, "-");
}

const abs = /(?:https?:)?\/\/[^\s"'`)<>]+\.(?:js|css|mjs)(?:\?[^\s"'`)<>]*)?/gi;

async function vendorGame(id) {
  const dir = path.join(ROOT, id);
  const vendorDir = path.join(dir, "vendor");
  const htmlFiles = [];
  async function walk(d) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "vendor") await walk(full); continue; }
      if (/\.(html?|css)$/i.test(e.name)) htmlFiles.push(full);
    }
  }
  await walk(dir);
  await fs.mkdir(vendorDir, { recursive: true });
  const saved = new Map();
  let removed = 0, localised = 0;

  for (const file of htmlFiles) {
    let text = await fs.readFile(file, "utf8");
    const urls = [...new Set((text.match(abs) || []).map(u => (u.startsWith("//") ? "https:" + u : u)))];
    for (const url of urls) {
      if (DROP.some(re => re.test(url))) {
        // remove the whole tag that carries it
        const esc = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        text = text.replace(new RegExp(`<script[^>]*${esc}[^>]*>\\s*</script>\\s*`, "gi"), "");
        removed++; continue;
      }
      if (DROP_CSS_FONT.test(url)) {
        text = text.replace(new RegExp(`<link[^>]*${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*>\\s*`, "gi"), "");
        removed++; continue;
      }
      let name = saved.get(url);
      if (!name) {
        name = localName(url);
        try {
          const { body } = await download(url);
          await fs.writeFile(path.join(vendorDir, name), body);
          saved.set(url, name);
        } catch (error) {
          process.stdout.write(`  ! ${id}: ${url.slice(0, 80)} -> ${error.message}\n`);
          continue;
        }
      }
      const rel = path.relative(path.dirname(file), path.join(vendorDir, name)).split(path.sep).join("/");
      text = text.split(url).join(rel);
      localised++;
    }
    await fs.writeFile(file, text);
  }
  return { id, files: saved.size, localised, removed };
}

const ids = process.argv.slice(2);
if (!ids.length) { console.error("usage: node scripts/vendor-cdn.mjs <gameId ...>"); process.exit(1); }
for (const id of ids) {
  const r = await vendorGame(id);
  process.stdout.write(`${r.id.padEnd(18)} vendored ${String(r.files).padStart(2)} file(s), ${r.localised} ref(s) localised, ${r.removed} tracker(s) removed\n`);
}
