import { isAllowedMediaUrl } from "../lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin media proxy ("school mode").
 * Streams video/audio bytes from Piped proxy + googlevideo hosts through the
 * lounge domain so school filters that block video CDNs still allow playback.
 * Supports Range requests for seeking.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  if (!raw) {
    return new Response(JSON.stringify({ error: "Missing url" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const target = isAllowedMediaUrl(raw);
  if (!target) {
    return new Response(JSON.stringify({ error: "Host not allowed" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const headers: Record<string, string> = {
    "User-Agent": "GG-Lounge/1.0 (unblocked-youtube-client)",
  };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  let upstream: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      upstream = await fetch(target.toString(), {
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Upstream unreachable",
        detail: err instanceof Error ? err.message : "fetch failed",
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(
      JSON.stringify({ error: `Upstream ${upstream.status}` }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  const out = new Headers();
  for (const key of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
  ]) {
    const value = upstream.headers.get(key);
    if (value) out.set(key, value);
  }
  out.set("Cache-Control", "private, max-age=0");
  out.set("X-Content-Type-Options", "nosniff");

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
