import { NextResponse } from "next/server";
import { logGamePlay } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(()=> ({}));
    const gameId = typeof (body as any).gameId === "string" ? (body as any).gameId.slice(0,80) : "";
    if (!gameId) return NextResponse.json({ ok: true });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
    await logGamePlay(gameId, ip);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: true });
  }
}
