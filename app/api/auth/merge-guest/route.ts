import { NextResponse } from "next/server";
import { getUserFromToken, incrementGameStats } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bring guest progress across the sign-in boundary.
 *
 * Guest plays were being recorded into `localStorage` under `ggl_plays_<id>` and
 * then thrown away the moment the player had an account — the browser kept them
 * forever and the profile never saw them. The client sends the guest tally here
 * immediately after login/registration and then clears it, so the numbers move
 * from the browser to the account exactly once instead of being lost or
 * double-counted.
 *
 * Only positive integers are accepted, capped at a sane ceiling per game: this
 * endpoint runs on the player's own account and must not become a way to write
 * an arbitrary play count by hand.
 */
const MAX_PER_GAME = 500;
const MAX_GAMES = 60;

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie.split(";").find(part => part.trim().startsWith("ggl_token="))?.split("=")[1]?.trim() || "";
  const user = await getUserFromToken(token).catch(() => null);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const raw = body && typeof body === "object" ? body.plays : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Send { plays: { gameId: count } }." }, { status: 400 });
  }

  const entries = Object.entries(raw as Record<string, unknown>)
    .filter(([gameId]) => typeof gameId === "string" && gameId.length > 0 && gameId.length <= 80)
    .slice(0, MAX_GAMES);

  let merged = 0;
  for (const [gameId, value] of entries) {
    const count = Math.floor(Number(value));
    if (!Number.isFinite(count) || count <= 0) continue;
    // One call per play is how the counter is defined, so replay it that way
    // rather than inventing a "set total" path the rest of the app does not have.
    const times = Math.min(count, MAX_PER_GAME);
    for (let i = 0; i < times; i++) {
      await incrementGameStats(user.id, gameId, 0);
    }
    merged += times;
  }

  return NextResponse.json({ ok: true, merged });
}
