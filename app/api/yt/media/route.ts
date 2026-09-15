import {
  isAllowedMediaUrl,
  isBlockedHost,
  sameOriginMediaUrl,
  verifyMediaSignature,
} from "../lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Resolve the upstream URL for a proxy request.
 * Allowlisted hosts always pass; anything else needs our signature (only this
 * server can sign, so this is never an open proxy).
 */
export function resolveTarget(raw: string | null, sig: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.protocol === "http:") url.protocol = "https:";
  if (isBlockedHost(url.hostname)) return null;
  if (isAllowedMediaUrl(url.toString())) return url;
  if (verifyMediaSignature(url.toString(), sig)) return url;
  // tolerate a signature computed over the pre-normalisation string
  if (verifyMediaSignature(raw, sig)) return url;
  return null;
}

/**
 * Same-origin media proxy ("school mode").
 * Streams video/audio bytes (and HLS manifests/segments) through the lounge so
 * a school filter that blocks video CDNs still only ever sees this site.
 * Supports Range requests so seeking works.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  const target = resolveTarget(raw, searchParams.get("s"));

  if (!target) {
    return new Response(JSON.stringify({ error: "Host not allowed" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "*/*",
    "Accept-Encoding": "identity",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.youtube.com/",
  };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  let upstream: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    upstream = await fetch(target.toString(), {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err) {
    clearTimeout(timer);
    return new Response(
      JSON.stringify({
        error: "Upstream unreachable",
        detail: err instanceof Error ? err.message : "fetch failed",
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
  clearTimeout(timer);

  if (!upstream.ok && upstream.status !== 206) {
    const body = await upstream.text().catch(() => "");
    return new Response(JSON.stringify({ error: `Upstream ${upstream.status}`, detail: body.slice(0, 300) }), {
      status: upstream.status === 403 ? 502 : upstream.status,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }

  const out = new Headers();
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"]) {
    const value = upstream.headers.get(key);
    if (value) out.set(key, value);
  }
  if (!out.has("content-type")) out.set("content-type", "application/octet-stream");
  // m3u8s fetched through here get rewritten below so their segments also come
  // from the lounge origin.
  if (/mpegurl|mpegURL|vnd\.apple\.mpegurl/i.test(out.get("content-type") || "")) {
    const text = await upstream.text();
    const base = upstream.url || target.toString();
    const rewritten = text
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          // EXT-X-KEY / EXT-X-MAP URIs need proxying too
          return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${proxyUrl(absolutise(uri, base))}"`);
        }
        return proxyUrl(absolutise(trimmed, base));
      })
      .join("\n");
    out.set("content-type", "application/vnd.apple.mpegurl");
    out.delete("content-length");
    out.set("Cache-Control", "private, max-age=60");
    return new Response(rewritten, { status: upstream.status, headers: out });
  }

  out.set("Cache-Control", "private, max-age=0");
  out.set("X-Content-Type-Options", "nosniff");
  out.set("Accept-Ranges", "bytes");
  out.set("Access-Control-Allow-Origin", "*");

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

function absolutise(uri: string, base: string): string {
  if (/^https?:/i.test(uri)) return uri;
  try {
    return new URL(uri, base).toString();
  } catch {
    return uri;
  }
}

/** Rewrite a manifest URI to a signed, same-origin media URL. */
function proxyUrl(absolute: string): string {
  return sameOriginMediaUrl(absolute);
}
