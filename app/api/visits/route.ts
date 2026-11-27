import { NextResponse } from "next/server";
import { cleanVisitorId, recordVisit, visitorStats } from "@/lib/db/visitors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The real visitor counter's endpoint.
 *
 * POST counts this browser: the server issues an anonymous `gg_vid` cookie on
 * the first visit and replays it forever after, so the same visitor is one row
 * no matter how many times they return, and nobody needs an account to be
 * counted. The response carries the whole-site totals, so the bar can show the
 * real number immediately.
 *
 * The count has to be a POST (not a cached GET) and the route has to be
 * dynamic, or a CDN would serve one visitor count to everybody.
 */
export async function POST(req: Request) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const raw = cookie
      .split(";")
      .find((part) => part.trim().startsWith("gg_vid="))
      ?.split("=")
      .slice(1)
      .join("=")
      .trim();
    const existing = cleanVisitorId(raw ? decodeURIComponent(raw) : null);
    const vid = existing ?? crypto.randomUUID();
    const stats = await recordVisit(vid);
    const response = NextResponse.json({ ok: true, ...stats });
    if (!existing) {
      response.cookies.set({
        name: "gg_vid",
        value: vid,
        path: "/",
        maxAge: 60 * 60 * 24 * 365 * 5,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return response;
  } catch (cause) {
    return NextResponse.json(
      { ok: false, error: `The visitor counter is offline right now: ${String(cause)}` },
      { status: 503 },
    );
  }
}

export async function GET() {
  try {
    const stats = await visitorStats();
    return NextResponse.json({ ok: true, ...stats });
  } catch (cause) {
    return NextResponse.json(
      { ok: false, error: `The visitor counter is offline right now: ${String(cause)}` },
      { status: 503 },
    );
  }
}
