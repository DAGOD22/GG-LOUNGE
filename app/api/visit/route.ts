import { NextResponse } from "next/server";
import { logGamePlay, getUserFromToken } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fix 10: in-memory rate limit for /api/visit — 30 req/min per IP to prevent leaderboard spam
const visitRate = new Map<string, { count: number; reset: number }>();
function hitVisitLimit(ip: string): boolean {
  const now = Date.now();
  const e = visitRate.get(ip);
  if (!e || now > e.reset) {
    visitRate.set(ip, { count: 1, reset: now + 60_000 });
    // occasional cleanup to avoid unbounded growth
    if (visitRate.size > 5000) {
      for (const [k, v] of visitRate) if (now > v.reset) visitRate.delete(k);
    }
    return true;
  }
  if (e.count >= 30) return false;
  e.count++;
  return true;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(()=> ({}));
    const gameId = typeof (body as any).gameId === "string" ? (body as any).gameId.slice(0,80) : "";
    if (!gameId) return NextResponse.json({ ok: true });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "0.0.0.0";
    if (!hitVisitLimit(ip)) {
      return NextResponse.json({ ok: true, rateLimited: true }, { status: 429, headers: { "Retry-After": "60" } });
    }
    // Leaderboard only counts signed-in users (per user request)
    const cookie = req.headers.get("cookie") || "";
    const token = cookie.split(";").find(s=> s.trim().startsWith("ggl_token="))?.split("=")[1]?.trim() || "";
    const user = token ? await getUserFromToken(token).catch(()=> null) : null;
    if (!user) {
      // Guest play — still return ok but don't count for leaderboard
      return NextResponse.json({ ok: true, guest: true });
    }
    await logGamePlay(gameId, ip, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: true });
  }
}
