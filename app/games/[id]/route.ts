import { NextResponse } from "next/server";
import { getGame } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const game = await getGame(id);
    if (!game?.html) return new NextResponse("Game not found", { status: 404 });
    return new NextResponse(game.html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:;",
      },
    });
  } catch (err) {
    console.error("[games/[id]]", err);
    return new NextResponse("Couldn't load game", { status: 500 });
  }
}
