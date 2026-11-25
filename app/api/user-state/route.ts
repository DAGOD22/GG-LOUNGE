import { NextResponse } from "next/server";
import { getUserState, setUserState } from "@/lib/db";
import { resolveOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-user lounge state (favorites, play counts, recently played).
 *
 * The owner is derived server-side and never taken from the request: a session
 * cookie for signed-in users, an HMAC-signed guest token otherwise (see
 * lib/owner.ts). This route used to trust `?id=` straight from the client, so
 * anyone could read or overwrite another user's favorites and play history.
 */

export async function GET(req: Request) {
  const owner = await resolveOwner(req);
  if (!owner) return NextResponse.json({ error: "not identified" }, { status: 401 });
  const state = await getUserState(owner);
  return NextResponse.json({ state });
}

export async function POST(req: Request) {
  try {
    const owner = await resolveOwner(req);
    if (!owner) return NextResponse.json({ error: "not identified" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const favorites = Array.isArray(body?.favorites) ? body.favorites.slice(0, 100).map((x: unknown) => String(x).slice(0, 40)) : [];
    const playCounts = typeof body?.playCounts === "object" && body.playCounts ? body.playCounts : {};
    const sanitized: Record<string, number> = {};
    for (const k of Object.keys(playCounts).slice(0, 200)) sanitized[String(k).slice(0, 40)] = Math.max(0, Math.min(9999, Number(playCounts[k]) || 0));
    const recentlyPlayed = Array.isArray(body?.recentlyPlayed) ? body.recentlyPlayed.slice(0, 20).map((x: unknown) => String(x).slice(0, 40)) : [];
    const saved = await setUserState(owner, { favorites, playCounts: sanitized, recentlyPlayed });
    return NextResponse.json({ ok: true, state: saved });
  } catch (e) {
    console.error("[user-state]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
