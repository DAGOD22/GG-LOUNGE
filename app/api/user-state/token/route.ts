import { NextResponse } from "next/server";
import { mintGuestToken } from "@/lib/owner";
import { checkRateLimit } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands a guest a signed token for their own anonymous row. The mint endpoint
 * cannot be used to obtain a token for an id chosen by the caller — the id has
 * to look like one we generate, and the signature is what actually grants
 * access, so a token is only ever useful to the browser that asked for it.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`guest-token:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const anonId = typeof body?.anonId === "string" ? body.anonId.trim() : "";
  if (!/^anon_[a-z0-9]{4,48}$/i.test(anonId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  return NextResponse.json({ token: mintGuestToken(anonId) });
}
