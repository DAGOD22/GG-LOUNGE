import { NextResponse } from "next/server";
import { pipedGet } from "../lib";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Piped API endpoints the lounge client is allowed to use.
const ALLOWED = [
  "trending",
  "search",
  "streams",
  "comments",
  "channel",
  "playlists",
  "suggestions",
  "sponsors",
  "nextpage",
  "c",
  "user",
  "feed",
] as const;

const CACHE_SECONDS: Record<string, number> = {
  trending: 300,
  search: 60,
  streams: 600,
  comments: 120,
  channel: 300,
  playlists: 300,
  suggestions: 300,
  sponsors: 3600,
  nextpage: 120,
  c: 300,
  user: 300,
  feed: 120,
};

export async function GET(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const ip = getClientIp(req as any);
  const rl = rateLimit(`yt:${ip}`, 60, 60_000);
  if (!rl.ok) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
    const res = NextResponse.json({ error: "Rate limited — slow down", retryAfter }, { status: 429 });
    const hdr = rateLimitResponse(60, 0, rl.resetAt);
    Object.entries(hdr).forEach(([k, v]) => res.headers.set(k, v));
    res.headers.set("Retry-After", String(retryAfter));
    return res;
  }
  const { path } = await context.params;
  const [root, ...rest] = path ?? [];

  if (!root || !(ALLOWED as readonly string[]).includes(root)) {
    return NextResponse.json({ error: "Unknown endpoint" }, { status: 404 });
  }

  // Basic input hygiene for id-style segments (video/channel ids).
  const joined = [root, ...rest].map(encodeURIComponent).join("/");
  const incoming = new URL(req.url);
  const qs = incoming.searchParams.toString();
  const upstreamPath = `/${joined}${qs ? `?${qs}` : ""}`;

  const result = await pipedGet(upstreamPath);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: "Video network unreachable",
        detail:
          "All Piped API instances failed from our server. Try again or pick another server in Settings.",
        upstream: result.error,
      },
      { status: 502 },
    );
  }

  const ttl = CACHE_SECONDS[root] ?? 60;
  return NextResponse.json(result.data, {
    status: result.status,
    headers: {
      "x-yt-instance": result.instance,
      "Cache-Control": `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
    },
  });
}
