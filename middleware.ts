import { NextResponse, type NextRequest } from "next/server";

// ——— Simple in-memory rate limit for API abuse (per-IP, per-route) ———
const _rlBuckets = new Map<string, { count: number; resetAt: number }>()
function _rl(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const b = _rlBuckets.get(key)
  if (!b || b.resetAt <= now) {
    const nb = { count: 1, resetAt: now + windowMs }
    _rlBuckets.set(key, nb)
    return { ok: true, remaining: limit - 1, resetAt: nb.resetAt }
  }
  if (b.count >= limit) return { ok: false, remaining: 0, resetAt: b.resetAt }
  b.count++
  return { ok: true, remaining: limit - b.count, resetAt: b.resetAt }
}

/**
 * Gate disabled — public lounge (user requested remove password for everything)
 * Only rate limiting remains for abuse protection.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ——— Rate limit high-abuse APIs ———
  const _ipRL = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  if (pathname.startsWith("/api/yt")) {
    const r = _rl(`yt:${_ipRL}`, 60, 60_000);
    if (!r.ok) return new NextResponse(JSON.stringify({ error: "Rate limited — slow down", retryAfter: Math.ceil((r.resetAt - Date.now()) / 1000) }), { status: 429, headers: { "content-type": "application/json", "retry-after": String(Math.ceil((r.resetAt - Date.now()) / 1000)), "x-ratelimit-limit": "60", "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.ceil(r.resetAt / 1000)) } });
  }
  if (pathname.startsWith("/api/bare") || pathname.startsWith("/api/edu") || pathname.startsWith("/api/learn") || pathname.startsWith("/api/t")) {
    const r = _rl(`bare:${_ipRL}`, 120, 60_000);
    if (!r.ok) return new NextResponse(JSON.stringify({ error: "Rate limited — bare busy", retryAfter: Math.ceil((r.resetAt - Date.now()) / 1000) }), { status: 429, headers: { "content-type": "application/json", "retry-after": String(Math.ceil((r.resetAt - Date.now()) / 1000)), "x-ratelimit-limit": "120", "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.ceil(r.resetAt / 1000)) } });
  }
  if (pathname === "/api/visit" || pathname.startsWith("/api/visit")) {
    const r = _rl(`visit:${_ipRL}`, 30, 60_000);
    if (!r.ok) return new NextResponse(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { "retry-after": String(Math.ceil((r.resetAt - Date.now()) / 1000)) } });
  }
  if (pathname.startsWith("/api/game-requests")) {
    const r = _rl(`req:${_ipRL}`, 20, 60_000);
    if (!r.ok) return new NextResponse(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { "retry-after": String(Math.ceil((r.resetAt - Date.now()) / 1000)) } });
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
