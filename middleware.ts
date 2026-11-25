import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, rateLimitResponse, type RateDecision } from "@/lib/rate-limit";

/**
 * One limiter, one set of buckets.
 *
 * This file used to carry its own copy of the sliding-window code while
 * lib/rate-limit.ts carried another, so an address could spend its budget twice
 * over — once against the middleware counter and once against the route counter —
 * and the two disagreed about how much was left. Everything now shares the
 * buckets in lib/rate-limit.ts; the policies below stay here because they are
 * about *this* edge, not about counting.
 */
const API_POLICIES: { match: (pathname: string) => boolean; key: string; limit: number; windowMs: number; message: string }[] = [
  {
    match: p => p.startsWith("/api/yt"),
    key: "yt",
    limit: 120,
    windowMs: 60_000,
    message: "Rate limited — slow down",
  },
  {
    match: p => p.startsWith("/api/bare") || p.startsWith("/api/edu") || p.startsWith("/api/learn") || p.startsWith("/api/t"),
    key: "bare",
    limit: 1800,
    windowMs: 60_000,
    message: "Rate limited — bare busy",
  },
  { match: p => p.startsWith("/api/visit"), key: "visit", limit: 30, windowMs: 60_000, message: "Rate limited" },
  { match: p => p.startsWith("/api/game-requests"), key: "req", limit: 20, windowMs: 60_000, message: "Rate limited" },
  { match: p => p.startsWith("/api/presence"), key: "presence", limit: 240, windowMs: 60_000, message: "Rate limited" },
  { match: p => p.startsWith("/api/coop"), key: "coop", limit: 240, windowMs: 60_000, message: "Rate limited" },
  { match: p => p.startsWith("/api/gg-gpt"), key: "gg-gpt", limit: 30, windowMs: 60_000, message: "Rate limited — one question at a time" },
  { match: p => p.startsWith("/api/uploads"), key: "uploads", limit: 120, windowMs: 60_000, message: "Rate limited — too many pieces" },
  { match: p => p.startsWith("/api/report"), key: "report", limit: 20, windowMs: 60_000, message: "Rate limited" },
  { match: p => p.startsWith("/api/achievements") || p.startsWith("/api/game-stats") || p.startsWith("/api/user-state"), key: "progress", limit: 300, windowMs: 60_000, message: "Rate limited" },
  { match: p => p.startsWith("/api/search"), key: "search", limit: 120, windowMs: 60_000, message: "Rate limited" },
  { match: p => p.startsWith("/api/leaderboard") || p.startsWith("/api/games") || p.startsWith("/api/health"), key: "read", limit: 240, windowMs: 60_000, message: "Rate limited" },
];

function limited(decision: RateDecision, limit: number, message: string): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000));
  return new NextResponse(JSON.stringify({ error: message, retryAfter }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfter),
      ...rateLimitResponse(limit, decision.remaining, decision.resetAt),
    },
  });
}

/**
 * Gate disabled — public lounge (user requested remove password for everything)
 * Only rate limiting remains for abuse protection.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ——— Rate limit high-abuse APIs ———
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";

  // The media routes carry video, so they get their own much larger budget
  // rather than a string comparison in three places.
  if (pathname === "/api/yt/media" || pathname === "/api/yt/img") {
    const media = rateLimit(`yt:media:${ip}`, 1200, 60_000);
    if (!media.ok) return limited(media, 1200, "Rate limited — slow down");
  }

  const policy = API_POLICIES.find(entry => entry.match(pathname));
  if (policy) {
    const decision = rateLimit(`${policy.key}:${ip}`, policy.limit, policy.windowMs);
    if (!decision.ok) return limited(decision, policy.limit, policy.message);
  }

  // Everything is public now — no gate, no ban redirect
  // Gate page still exists but just redirects home
  if (pathname === "/gate" || pathname.startsWith("/gate/")) {
    const url = new URL("/", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
