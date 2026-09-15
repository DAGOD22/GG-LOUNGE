import { isAllowedMediaUrl, isBlockedHost, sameOriginImageUrl, verifyMediaSignature } from "../lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin image proxy for thumbnails/avatars ("strict school mode").
 * Anything allowlisted passes; other hosts need a signature minted by this
 * server (so providers can hand us fresh mirrors without us becoming an open
 * proxy).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  if (!raw) return new Response("Missing url", { status: 400 });

  let target: URL | null = null;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" && !isBlockedHost(u.hostname)) {
      target = isAllowedMediaUrl(u.toString()) ? u : verifyMediaSignature(u.toString(), searchParams.get("s")) ? u : null;
    }
  } catch {
    target = null;
  }
  if (!target) return new Response("Host not allowed", { status: 400 });

  let upstream: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      upstream = await fetch(target.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // A dead thumbnail proxy must never break the page: answer with a 1x1.
    return blankPng();
  }

  if (!upstream.ok || !upstream.body) return blankPng();
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!/^image\//i.test(contentType) && !/video\/mp4|application\/octet-stream/i.test(contentType)) {
    await upstream.body.cancel().catch(() => {});
    return blankPng();
  }

  const out = new Headers();
  out.set("content-type", contentType);
  const length = upstream.headers.get("content-length");
  if (length && Number(length) < 12 * 1024 * 1024) out.set("content-length", length);
  out.set("Cache-Control", "public, max-age=604800, immutable");
  out.set("X-Content-Type-Options", "nosniff");
  if (/svg/i.test(contentType)) {
    out.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  }
  return new Response(upstream.body, { headers: out });
}

function blankPng(): Response {
  // 1x1 transparent gif — tiny, always valid, keeps layouts intact
  const gif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    "base64",
  );
  return new Response(new Uint8Array(gif), {
    headers: {
      "content-type": "image/gif",
      "cache-control": "public, max-age=3600",
      "x-gg-blank": "1",
    },
  });
}

export { sameOriginImageUrl };
