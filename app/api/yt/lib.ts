/**
 * Shared helpers for the GG-Lounge video engine (YouTube + TikTok).
 *
 * The school firewall blocks youtube.com, googlevideo.com, piped instances and
 * just about every video CDN. Our *server* is not behind that firewall, so the
 * lounge fetches everything upstream and re-serves it from its own origin:
 * the browser only ever talks to the lounge ("school mode").
 *
 * Providers, in order:
 *   1. innertube  — YouTube's own internal API (youtube.com/youtubei/v1/*).
 *                   No third party, most reliable data + stream URLs.
 *   2. piped      — community Piped API instances.
 *   3. invidious  — community Invidious API instances.
 *   4. embed      — official youtube-nocookie embed (last resort, client side).
 */

// ---------------------------------------------------------------- upstreams --

/** Public Piped API instances (github.com/TeamPiped/documentation). */
export const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi-libre.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.drgns.space",
  "https://pipedapi.ducks.party",
  "https://piped-api.codespace.cz",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.private.coffee",
  "https://pipedapi.darkness.services",
  "https://pipedapi.orangenet.cc",
  "https://pipedapi.owo.si",
  "https://piped-api.privacy.com.de",
] as const;

/** Public Invidious API instances (docs.invidious.io/instances). */
export const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://invidious.f5.si",
  "https://iv.datura.network",
  "https://invidious.privacyredirect.com",
  "https://invidious.jing.rocks",
  "https://iv.ggtyler.dev",
  "https://iv.melmac.space",
  "https://invidious.materialio.us",
  "https://inv.tux.pizza",
  "https://invidious.privacydev.net",
  "https://vid.puffyan.us",
  "https://invidious.lunivers.trade",
] as const;

/** TikTok metadata mirrors (tikwm is a public proxy/mirror of TikTok data). */
export const TIKTOK_MIRRORS = [
  "https://www.tikwm.com",
  "https://api2.tikwm.com",
  "https://tikwm.com",
] as const;

const UPSTREAM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * googlevideo URLs are bound to the client that produced them: fetch an
 * ANDROID-client URL with a desktop UA and the CDN answers 403. Both halves of
 * the pipeline (player request + media relay) must agree, so the user agent per
 * InnerTube client lives here.
 */
export const CLIENT_UA: Record<string, string> = {
  ANDROID: "com.google.android.youtube/19.44.38 (Linux; U; Android 11; en_US) gzip",
  IOS: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_2 like Mac OS X)",
  MWEB:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  TVHTML5_SIMPLY_EMBEDDED_PLAYER:
    "Mozilla/5.0 (CrKey armv7l 12.5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
  WEB: UPSTREAM_UA,
  DEFAULT: UPSTREAM_UA,
};

export function clientUa(client?: string | null): string {
  const key = String(client || "").toUpperCase();
  return CLIENT_UA[key] || UPSTREAM_UA;
}

/** Google's CDN wants a plausible youtube context on every media request. */
export const MEDIA_REFERRER = "https://www.youtube.com/watch?v=";

// ---------------------------------------------------------------- allowlist --

/**
 * Hosts we are willing to proxy bytes for. Anything a provider hands us is
 * *also* accepted when it carries a valid signature (see signMediaUrl), which
 * keeps us from needing an exhaustive list of every mirror host on earth while
 * still refusing to act as an open proxy for strangers.
 */
const MEDIA_HOST_PATTERNS: RegExp[] = [
  // YouTube / Google
  /(^|\.)googlevideo\.com$/i,
  /(^|\.)ytimg\.com$/i,
  /(^|\.)ggpht\.com$/i,
  /(^|\.)googleusercontent\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtube-nocookie\.com$/i,
  /(^|\.)yt\.be$/i,
  // Piped media proxies
  /^pipedproxy/i,
  /^pipedapi/i,
  /^piped-api/i,
  /^api\.piped/i,
  /(^|\.)piped\.video$/i,
  // Invidious media + static hosts
  /(^|\.)inv\.nadeko\.net$/i,
  /(^|\.)invidious\./i,
  /(^|\.)yewtu\.be$/i,
  /^iv\./i,
  /(^|\.)videoplayback/i,
  // TikTok + mirrors
  /(^|\.)tiktok\.com$/i,
  /(^|\.)tiktokcdn\.com$/i,
  /(^|\.)tiktokcdn-us\.com$/i,
  /(^|\.)tiktokcdn-eu\.com$/i,
  /(^|\.)ttstatic\.com$/i,
  /(^|\.)ttwstatic\.com$/i,
  /(^|\.)tiktokv\.com$/i,
  /(^|\.)tiktok\.us$/i,
  /(^|\.)musical\.ly$/i,
  /(^|\.)byteimg\.com$/i,
  /(^|\.)tikwm\.com$/i,
  /(^|\.)ip\.fasterit\.me$/i,
  // Known community instance domains (they rotate hosts under these roots)
  /(^|\.)kavin\.rocks$/i,
  /(^|\.)leptons\.xyz$/i,
  /(^|\.)adminforge\.de$/i,
  /(^|\.)drgns\.space$/i,
  /(^|\.)ducks\.party$/i,
  /(^|\.)codespace\.cz$/i,
  /(^|\.)reallyaweso\.me$/i,
  /(^|\.)private\.coffee$/i,
  /(^|\.)darkness\.services$/i,
  /(^|\.)orangenet\.cc$/i,
  /(^|\.)owo\.si$/i,
  /(^|\.)privacy\.com\.de$/i,
  /(^|\.)f5\.si$/i,
  /(^|\.)datura\.network$/i,
  /(^|\.)privacyredirect\.com$/i,
  /(^|\.)jing\.rocks$/i,
  /(^|\.)ggtyler\.dev$/i,
  /(^|\.)melmac\.space$/i,
  /(^|\.)materialio\.us$/i,
  /(^|\.)lugunivers\.trade$/i,
  /(^|\.)tlon\.network$/i,
];

/** Never proxy these, even with a signature (SSRF guard). */
const BLOCKED_HOSTS = /(^|\.)(localhost|internal|localdomain|corp|lan|home|internal)$|^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/i;

export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "0.0.0.0" || h === "::" || h === "::1") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const parts = h.split(".").map(Number);
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    return true; // raw IPv4 literals are never a legit media host here
  }
  if (h.includes(":")) return true; // raw IPv6
  return BLOCKED_HOSTS.test(h);
}

export function isAllowedMediaUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (isBlockedHost(url.hostname)) return null;
  if (!MEDIA_HOST_PATTERNS.some((re) => re.test(url.hostname))) return null;
  return url;
}

// ------------------------------------------------------- signed media links --
/**
 * Providers sometimes hand back hosts we have never heard of (a new mirror).
 * We stamp our own signature onto those URLs; the media route accepts any
 * https URL that carries a matching stamp. Only this server can sign, so the
 * proxy is never open.
 */
function secret(): string {
  return (
    process.env.GG_MEDIA_SECRET ||
    "gg-lounge-media-proxy-v1::" + (process.env.VERCEL_URL || "localhost")
  );
}

function hash32(input: string): string {
  // FNV-1a 32bit, twice with different seeds -> 8 hex chars, good enough to
  // stop URL guessing without pulling node:crypto into the client paths.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
    h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
  }
  const s = (h1 ^ Math.imul(h2, 0x9e3779b1)) >>> 0;
  return s.toString(36).padStart(7, "0");
}

export function signMediaUrl(url: string): string {
  return hash32(secret() + "|" + url);
}

export function verifyMediaSignature(url: string, sig: string | null): boolean {
  if (!sig) return false;
  const expected = signMediaUrl(url);
  // constant-ish time compare
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Turn an upstream URL into a same-origin media URL (proxy path + sig).
 * `client` carries which InnerTube identity produced the URL so the relay can
 * replay it with the matching user agent.
 */
export function sameOriginMediaUrl(raw: string, client?: string | null): string {
  const u = new URL("/api/yt/media", "http://x");
  u.searchParams.set("url", raw);
  const sig = signMediaUrl(raw);
  if (sig) u.searchParams.set("s", sig);
  if (client) u.searchParams.set("c", String(client).toUpperCase());
  return u.pathname + u.search;
}

/** Same, but for images (thumbnails/avatars/backgrounds). */
export function sameOriginImageUrl(raw: string): string {
  const u = new URL("/api/yt/img", "http://x");
  u.searchParams.set("url", raw);
  const sig = signMediaUrl(raw);
  if (sig) u.searchParams.set("s", sig);
  return u.pathname + u.search;
}

// ------------------------------------------------------------------ fetching --

export function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  const start = Math.floor(Math.random() * out.length);
  return out.slice(start).concat(out.slice(0, start));
}

/** Randomized order but with a sticky "last good" front-of-queue (per process). */
const sticky = new Map<string, number>();
export function orderedInstances(key: string, list: readonly string[]): string[] {
  const at = sticky.get(key) ?? Math.floor(Math.random() * list.length);
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[(at + i) % list.length]);
  return out;
}
export function markGood(key: string, list: readonly string[], base: string): void {
  const idx = list.indexOf(base);
  if (idx >= 0) sticky.set(key, idx);
}

export async function fetchWithTimeout(
  url: string,
  ms: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type Jsonish = Record<string, unknown> | unknown[] | string | null;

export type ProviderResult =
  | { ok: true; data: Jsonish; via: string; status?: number }
  | { ok: false; error: string; status?: number };

/**
 * GET a JSON endpoint across a pool of instances, returning the first answer
 * that isn't a server error. 4xx is treated as a real answer (bad id, etc.).
 */
export async function poolGetJson(
  poolKey: string,
  instances: readonly string[],
  pathWithQuery: string,
  opts?: { timeoutMs?: number; attempts?: number; headers?: Record<string, string> },
): Promise<ProviderResult> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const attempts = Math.min(opts?.attempts ?? 4, instances.length);
  const errors: string[] = [];
  for (const base of orderedInstances(poolKey, instances).slice(0, attempts)) {
    try {
      const res = await fetchWithTimeout(`${base}${pathWithQuery}`, timeoutMs, {
        headers: {
          Accept: "application/json",
          "User-Agent": UPSTREAM_UA,
          ...(opts?.headers ?? {}),
        },
      });
      const text = await res.text();
      let data: Jsonish = text;
      try {
        data = JSON.parse(text);
      } catch {
        /* keep raw text */
      }
      if (res.status >= 500) {
        errors.push(`${base} -> ${res.status}`);
        continue;
      }
      if (!res.ok && res.status >= 400 && errors.length && data == null) continue;
      markGood(poolKey, instances, base);
      return { ok: true, data, via: base, status: res.status };
    } catch (err) {
      errors.push(`${base} -> ${err instanceof Error ? err.message : "fetch failed"}`);
    }
  }
  return { ok: false, error: errors.join("; ") || "all instances unreachable" };
}

/** POST JSON to a single host (InnerTube). */
export async function postJson(
  url: string,
  body: unknown,
  ms = 9000,
  headers?: Record<string, string>,
): Promise<ProviderResult> {
  try {
    const res = await fetchWithTimeout(
      url,
      ms,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": UPSTREAM_UA,
          ...(headers ?? {}),
        },
        body: JSON.stringify(body),
      },
    );
    const text = await res.text();
    let data: Jsonish = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    }
    return { ok: true, data, via: "innertube", status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

// ----------------------------------------------------------------- tiny cache --

type Entry = { at: number; ttl: number; value: unknown };
const cache = new Map<string, Entry>();

export function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.ttl > 0 && Date.now() - hit.at > hit.ttl * 1000) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttl = 60): void {
  if (cache.size > 400) {
    // drop the oldest quarter
    const keys = [...cache.keys()].slice(0, 100);
    for (const k of keys) cache.delete(k);
  }
  cache.set(key, { at: Date.now(), ttl, value });
}

export { UPSTREAM_UA };
