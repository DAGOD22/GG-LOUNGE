import { NextResponse } from "next/server";
import { GATE_COOKIE, GATE_MAX_AGE, createGateValue } from "@/lib/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gate disabled — accept any password, always succeed
 * Keeps old clients working but no longer required.
 */
export async function POST() {
  const expiry = Date.now() + GATE_MAX_AGE * 1000;
  const val = createGateValue(expiry);
  const res = NextResponse.json({ ok: true, disabled: true });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.headers.set("Set-Cookie", `${GATE_COOKIE}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GATE_MAX_AGE}${secure}`);
  return res;
}
