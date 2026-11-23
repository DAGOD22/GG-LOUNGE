import { NextResponse } from "next/server";
import { addReport, listReports, checkRateLimit } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Game reports.
 *
 * Voting on a request is NOT handled here. It used to be: this route accepted
 * `{ upvoteRequestId }` and incremented the vote with no cooldown and no rate
 * limit, while the documented upvote endpoint applies both — so the limiter
 * could simply be skipped by calling the report endpoint instead. Upvotes go
 * through /api/game-requests/[id]/upvote.
 */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "0.0.0.0";
    if (!checkRateLimit(`report:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many reports — wait a minute." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const body = await req.json().catch(() => ({}));
    const gameId = typeof body?.gameId === "string" ? body.gameId.slice(0, 80) : "";
    const title = typeof body?.title === "string" ? body.title.slice(0, 80) : gameId;
    if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });
    const rep = await addReport(gameId, title || gameId);
    return NextResponse.json({ ok: true, report: rep });
  } catch (e) {
    console.error("[report]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

/** Report contents are for moderators only; this used to be a public list. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ reports: await listReports() });
}
