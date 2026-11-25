import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { chatverseCookie, chatversePassword } from "@/lib/chatverse-auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Attempts per address before the door locks. A shared password is only as
 *  strong as the number of guesses it allows. */
const ATTEMPTS = 8;
const WINDOW_MS = 10 * 60_000;

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/**
 * Enter CHATVERSE.
 *
 * The comparison is constant-time over fixed-length digests, so neither the
 * length nor the shared prefix of a wrong guess is observable. Failures are
 * counted per address and the response is deliberately vague ("That password
 * is not right") so the endpoint cannot be used to confirm a near-miss.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = rateLimit(`chatverse:${ip}`, ATTEMPTS, WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "retry-after": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  if (!password) return NextResponse.json({ error: "Enter the password." }, { status: 400 });

  const expected = digest(chatversePassword());
  const provided = digest(password);
  // timingSafeEqual on equal-length digests; the loop-free compare avoids the
  // early-exit timing leak a string === would have.
  const ok = expected.length === provided.length && timingSafeEqual(expected, provided);
  if (!ok) return NextResponse.json({ error: "That password is not right." }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(chatverseCookie());
  return response;
}
