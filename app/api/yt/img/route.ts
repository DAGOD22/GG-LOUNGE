import { isAllowedMediaUrl } from "../lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same-origin image proxy for thumbnails/avatars ("strict school mode"). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  if (!raw) {
    return new Response("Missing url", { status: 400 });
  }

  const target = isAllowedMediaUrl(raw);
  if (!target) {
    return new Response("Host not allowed", { status: 400 });
  }

  let upstream: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      upstream = await fetch(target.toString(), {
        headers: {
          "User-Agent": "GG-Lounge/1.0 (unblocked-youtube-client)",
          Accept: "image/*",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return new Response("Upstream unreachable", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream ${upstream.status}`, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!/^(image|video\/mp4|application\/octet-stream)/i.test(contentType)) {
    // Thumbnails are images; refuse anything unexpected.
    await upstream.body.cancel().catch(() => {});
    return new Response("Unexpected content type", { status: 502 });
  }

  const out = new Headers();
  out.set("content-type", contentType);
  const length = upstream.headers.get("content-length");
  if (length) out.set("content-length", length);
  out.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=86400");

  return new Response(upstream.body, { headers: out });
}
