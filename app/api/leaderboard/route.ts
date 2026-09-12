import { NextResponse } from "next/server";
import { leaderboard } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(20, Math.max(3, Number(url.searchParams.get("limit")||"10")));
    const rows = await leaderboard(limit);
    return NextResponse.json({ leaderboard: rows }, { headers: { "Cache-Control": "public, s-maxage=10" } });
  } catch (e) {
    return NextResponse.json({ leaderboard: [] });
  }
}
