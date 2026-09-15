import { isBlockedHost } from "../../yt/lib";

export const runtime = "nodejs";
/** Vercel Hobby caps functions at 60s; asking for more fails the build. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Stock photo / looping-video relay for backgrounds.
 *
 * Only the curated providers below are reachable, so this is a media cache and
 * not an open proxy. Everything is served same-origin, which is what makes the
 * backgrounds load on a school network (and dodges CORS entirely).
 */
const STOCK_HOSTS = [
  "storage.googleapis.com",
  "commondatastorage.googleapis.com",
  "picsum.photos",
  "fastly.picsum.photos",
  "images.unsplash.com",
  "upload.wikimedia.org",
  "videos.pexels.com",
  "images.pexels.com",
  "cdn.pixabay.com",
  "i.imgur.com",
  "raw.githubusercontent.com",
  "mdn.github.io",
  "www.w3schools.com",
];

const MAX_VIDEO = 40 * 1024 * 1024;

function allowed(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return STOCK_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  if (!raw) return new Response("Missing url", { status: 400 });
  let target: URL | null = null;
  try {
    const u = new URL(raw);
    if ((u.protocol === "https:" || u.protocol === "http:") && !isBlockedHost(u.hostname) && allowed(u)) {
      target = u;
      if (target.protocol === "http:") target.protocol = "https:";
    }
  } catch {
    target = null;
  }
  if (!target) return new Response("Host not allowed", { status: 403 });

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "*/*",
  };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  let upstream: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      upstream = await fetch(target.toString(), { headers, redirect: "follow", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return new Response("Upstream unreachable", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream ${upstream.status}`, { status: 502 });
  }
  const type = upstream.headers.get("content-type") || "application/octet-stream";
  if (!/^(image\/|video\/|audio\/)/i.test(type)) {
    await upstream.body?.cancel().catch(() => {});
    return new Response("Not media", { status: 502 });
  }
  const len = Number(upstream.headers.get("content-length") || 0);
  if (len && len > MAX_VIDEO) {
    await upstream.body?.cancel().catch(() => {});
    return new Response("File too large", { status: 413 });
  }

  const out = new Headers();
  out.set("content-type", type);
  for (const key of ["content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(key);
    if (v) out.set(key, v);
  }
  out.set("cache-control", "public, max-age=604800, immutable");
  out.set("accept-ranges", "bytes");
  out.set("cross-origin-resource-policy", "same-origin");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
