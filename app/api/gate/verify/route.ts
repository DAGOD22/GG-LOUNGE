import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getGateState, isGateBanned, recordGateFailure, recordGateSuccess } from "@/lib/db";
import { GATE_PASSWORD, GATE_COOKIE, GATE_MAX_AGE, createGateValue, GATE_SECRET } from "@/lib/gate";
import { createHmac } from "node:crypto";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  const ip = fwd.split(",")[0].trim() || (req.headers.get("x-gate-ip") as string) || "unknown";
  return ip.slice(0, 80);
}

function safeEqual(a: string, b: string): boolean {
  try {
    if (a.length !== b.length) {
      // still do timingSafeEqual on hashed to avoid timing leak
      const ah = createHmac("sha256", GATE_SECRET).update(a).digest();
      const bh = createHmac("sha256", GATE_SECRET).update(b).digest();
      return timingSafeEqual(ah, bh) && false;
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const ip = getIp(req);
  // 5 tries per minute per IP — stops brute force before ban escalates
  const rl = rateLimit(`gate:verify:${ip}`, 5, 60_000);
  if (!rl.ok) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
    const res = NextResponse.json({ ok: false, error: "RATE_LIMITED", retryAfter }, { status: 429 });
    const hdr = rateLimitResponse(5, 0, rl.resetAt);
    Object.entries(hdr).forEach(([k, v]) => res.headers.set(k, v));
    res.headers.set("Retry-After", String(retryAfter));
    return res;
  }
  // check if already banned
  const ban = await isGateBanned(ip);
  if (ban.banned) {
    const retryAfter = ban.expiresAt ? Math.ceil((new Date(ban.expiresAt).getTime() - Date.now()) / 1000) : 86400 * 365;
    const res = NextResponse.json(
      { ok: false, error: "GATE_LOCKED", banned: true, retryAfter, expiresAt: ban.expiresAt },
      { status: 429 }
    );
    // don't reveal schedule
    res.headers.set("Retry-After", String(Math.max(60, retryAfter)));
    return res;
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const attempt = typeof body.password === "string" ? body.password : "";

  // constant-time compare with GATE_PASSWORD (server only) — no frontend leak
  const expected = GATE_PASSWORD;
  const ok = safeEqual(attempt, expected);

  if (ok) {
    await recordGateSuccess(ip);
    const expiry = Date.now() + GATE_MAX_AGE * 1000;
    const val = createGateValue(expiry);
    const res = NextResponse.json({ ok: true });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.headers.set("Set-Cookie", `${GATE_COOKIE}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GATE_MAX_AGE}${secure}`);
    return res;
  } else {
    const result = await recordGateFailure(ip);
    if (result.banned) {
      const retryAfter = result.expiresAt ? Math.ceil((new Date(result.expiresAt).getTime() - Date.now()) / 1000) : 86400 * 365;
      const res = NextResponse.json(
        { ok: false, error: "GATE_LOCKED", banned: true, retryAfter, expiresAt: result.expiresAt },
        { status: 429 }
      );
      res.headers.set("Retry-After", String(Math.max(60, retryAfter)));
      return res;
    }
    // generic 401, don't reveal schedule — users only learn by triggering it
    return NextResponse.json({ ok: false, error: "WRONG_PASSPHRASE" }, { status: 401 });
  }
}
