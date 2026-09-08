import { NextResponse } from "next/server";
import { listGames } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public list of community-published games for the lounge homepage. */
export async function GET() {
  try {
    const games = await listGames();
    return NextResponse.json(
      { games },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (err) {
    console.error("[games]", err);
    return NextResponse.json({ games: [] });
  }
}
