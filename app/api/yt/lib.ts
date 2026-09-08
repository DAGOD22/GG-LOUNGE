/**
 * Shared helpers for the GG-Lounge YouTube proxy (Piped-powered).
 *
 * Why Piped? The official youtube.com embed + Data API is domain-blocked on
 * most school networks (and needs an API key with quota). Piped API instances
 * serve the same YouTube metadata + proxied streams from unrelated domains,
 * and this proxy re-serves everything from our own origin so the browser only
 * ever talks to the lounge itself ("school mode").
 */

// Public Piped API instances (https://github.com/TeamPiped/documentation).
// CDN-backed instances first; the proxy rotates through these with fallback.
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

// Hosts we are willing to proxy bytes for (video/audio/images).
// Piped stream URLs come from pipedproxy-* hosts or googlevideo; thumbnails
// and avatars come from pipedproxy / ytimg / ggpht hosts.
const MEDIA_HOST_PATTERNS: RegExp[] = [
  /(^|\.)googlevideo\.com$/i,
  /(^|\.)ytimg\.com$/i,
  /(^|\.)ggpht\.com$/i,
  /(^|\.)googleusercontent\.com$/i,
  /^pipedproxy/i,
  /^pipedapi/i,
  /^piped-api/i,
  /^api\.piped/i,
  /(^|\.)piped\.video$/i,
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
];

export function isAllowedMediaUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!MEDIA_HOST_PATTERNS.some((re) => re.test(url.hostname))) return null;
  return url;
}

export function shuffledInstances(): string[] {
  const list = [...PIPED_INSTANCES];
  const start = Math.floor(Math.random() * list.length);
  return list.slice(start).concat(list.slice(0, start));
}

export async function fetchWithTimeout(
  url: string,
  ms: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "GG-Lounge/1.0 (unblocked-youtube-client)",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export type PipedResult =
  | { ok: true; data: unknown; instance: string; status: number }
  | { ok: false; error: string };

/** GET a Piped JSON endpoint, trying instances in order until one works. */
export async function pipedGet(
  pathWithQuery: string,
  opts?: { timeoutMs?: number; attempts?: number },
): Promise<PipedResult> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const attempts = opts?.attempts ?? 4;
  const errors: string[] = [];

  for (const instance of shuffledInstances().slice(0, attempts)) {
    try {
      const res = await fetchWithTimeout(
        `${instance}${pathWithQuery}`,
        timeoutMs,
      );
      if (res.status >= 500) {
        errors.push(`${instance} -> ${res.status}`);
        continue;
      }
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        // leave as text
      }
      if (!res.ok) {
        // 4xx is a real answer from a working instance (bad id etc.) — return it.
        return { ok: true, data, instance, status: res.status };
      }
      return { ok: true, data, instance, status: 200 };
    } catch (err) {
      errors.push(
        `${instance} -> ${err instanceof Error ? err.message : "fetch failed"}`,
      );
    }
  }
  return { ok: false, error: errors.join("; ") || "all instances failed" };
}
