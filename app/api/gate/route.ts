import { NextResponse } from "next/server";
import { findActiveBan, logVisit, isGateBanned } from "@/lib/db";
import { verifyGateValue } from "@/lib/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ban gate (called by middleware for page navigations).
 * Checks visitor IP against admin bans + gate escalating bans, and validates gate cookie.
 */
export async function GET(request: Request) {
  const headers = request.headers;
  const forwarded = headers.get("x-gate-ip") || headers.get("x-forwarded-for") || headers.get("x-real-ip") || "";
  const ip = forwarded.split(",")[0].trim().slice(0, 80) || "unknown";
  const ua = (headers.get("user-agent") || "").slice(0, 300);
  const visitPath = (headers.get("x-gate-path") || "/").slice(0, 200);
  const gateCookieHeader = headers.get("x-gate-cookie") || headers.get("cookie") || "";
  // extract gg_gate from cookie header
  let gateCookie: string | null = null;
  try {
    const m = gateCookieHeader.match(/(?:^|;\s*)gg_gate=([^;]+)/);
    if (m) gateCookie = decodeURIComponent(m[1]);
    // also support direct x-gate-cookie header (middleware forwards raw value)
    if (!gateCookie && headers.get("x-gate-cookie")) gateCookie = headers.get("x-gate-cookie");
  } catch {}

  // Fire-and-forget visit log
  void logVisit(ip, ua, visitPath);

  try {
    // 1. admin ban (identifier = ip)
    const adminBan = await findActiveBan(ip);
    if (adminBan) return NextResponse.json({ banned: true, reason: adminBan.reason, expiresAt: adminBan.expiresAt, gateBanned: false, gatePassed: false });

    // 2. gate escalating ban (gate:ip)
    const gateBan = await isGateBanned(ip);
    if (gateBan.banned) {
      return NextResponse.json({ banned: true, reason: "gate", expiresAt: gateBan.expiresAt, gateBanned: true, gatePassed: false, banLevel: gateBan.banLevel });
    }
    // also check explicit banned_user gate:ip (fallback)
    const explicitGate = await findActiveBan(`gate:${ip}`);
    if (explicitGate) return NextResponse.json({ banned: true, reason: explicitGate.reason, expiresAt: explicitGate.expiresAt, gateBanned: true, gatePassed: false });

    // 3. gate cookie check
    const gatePassed = verifyGateValue(gateCookie);
    if (gatePassed) {
      return NextResponse.json({ banned: false, gatePassed: true, gateBanned: false });
    }

    return NextResponse.json({ banned: false, gatePassed: false, gateBanned: false });
  } catch (err) {
    console.error("[gate]", err);
    return NextResponse.json({ banned: false, gatePassed: false, gateBanned: false });
  }
}
