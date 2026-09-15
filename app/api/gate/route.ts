import { NextResponse } from "next/server";
import { findActiveBan, logVisit } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ban gate (called by middleware for page navigations).
 * Checks the visitor IP against bans and logs the visit.
 */
export async function GET(request: Request) {
  const headers = request.headers;
  const forwarded = headers.get("x-gate-ip") || headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim().slice(0, 80) || "unknown";
  const ua = (headers.get("user-agent") || "").slice(0, 300);
  const visitPath = (headers.get("x-gate-path") || "/").slice(0, 200);

  // Fire-and-forget visit log so it never slows down page loads.
  void logVisit(ip, ua, visitPath);

  try {
    const ban = await findActiveBan(ip);
    if (!ban) return NextResponse.json({ banned: false });
    return NextResponse.json({ banned: true, reason: ban.reason, expiresAt: ban.expiresAt });
  } catch (err) {
    console.error("[gate]", err);
    // Fail open: a DB hiccup must not lock everyone out.
    return NextResponse.json({ banned: false });
  }
}
