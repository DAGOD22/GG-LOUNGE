import { NextResponse } from "next/server";
import { addReport, upvoteRequest } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(()=> ({}));
    // handle upvote fallback via report endpoint
    if (typeof (body as any).upvoteRequestId === "string") {
      const r = await upvoteRequest((body as any).upvoteRequestId);
      return NextResponse.json({ ok: true, request: r });
    }
    const gameId = typeof (body as any).gameId === "string" ? (body as any).gameId.slice(0,80) : "";
    const title = typeof (body as any).title === "string" ? (body as any).title.slice(0,80) : gameId;
    if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });
    const rep = await addReport(gameId, title || gameId);
    return NextResponse.json({ ok: true, report: rep });
  } catch (e) {
    console.error("[report]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
export async function GET() {
  const { listReports } = await import("@/lib/db");
  const reports = await listReports();
  return NextResponse.json({ reports });
}
