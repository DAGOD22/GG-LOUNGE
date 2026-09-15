import { isBlockedHost } from "../yt/lib";

export const runtime = "nodejs";
/** Vercel Hobby caps functions at 60s; asking for more fails the build. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * Generic image relay used by the lounge itself: cloak favicons and custom
 * background photos would otherwise be blocked (or CORS-refused) on school
 * networks. Images only — anything else gets a blank pixel.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  if (!raw) return new Response("Missing url", { status: 400 });

  let target: URL | null = null;
  try {
    const u = new URL(raw);
    if ((u.protocol === "https:" || u.protocol === "http:") && !isBlockedHost(u.hostname)) {
      target = u;
      if (target.protocol === "http:") target.protocol = "https:";
    }
  } catch {
    target = null;
  }
  if (!target) return new Response("URL not allowed", { status: 400 });

  const url = target.toString();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.6",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const type = (upstream.headers.get("content-type") || "").toLowerCase();
    const len = Number(upstream.headers.get("content-length") || 0);
    if (!upstream.ok || !type.startsWith("image/") || (len && len > MAX_BYTES)) {
      await upstream.body?.cancel().catch(() => {});
      return blank();
    }
    const buf = new Uint8Array(await upstream.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return blank();
    const headers = new Headers({
      "content-type": type,
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    });
    if (type.includes("svg")) {
      // strip scripts/smileys from third-party svg favicons before serving
      const text = new TextDecoder().decode(buf).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "");
      headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      return new Response(text, { headers });
    }
    return new Response(buf, { headers });
  } catch {
    return blank();
  }
}

function blank(): Response {
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
  return new Response(new Uint8Array(gif), {
    headers: { "content-type": "image/gif", "cache-control": "public, max-age=600", "x-gg-blank": "1" },
  });
}
