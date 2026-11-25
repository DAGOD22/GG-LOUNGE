/**
 * Owner resolution for per-user rows.
 *
 * Signed-in requests are identified by the session cookie. Guests are
 * identified by an HMAC-signed anonymous id, because plain ids are guessable
 * and are echoed back in share links.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getUserFromToken } from "./db";

export function secret(): string {
  return process.env.BETTER_AUTH_SECRET || process.env.ADMIN_PASSWORD || "gg-lounge-dev-secret";
}

export function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** `anonId.hmac` — the id alone is not enough to claim the row. */
export function mintGuestToken(anonId: string): string {
  return `${anonId}.${sign(anonId)}`;
}

export function guestIdFromToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const anonId = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(anonId));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  if (!/^anon_[a-z0-9]+$/i.test(anonId)) return null;
  return anonId;
}

export function ownerTokenFromCookie(req: Request): string | null {
  const raw = req.headers.get("cookie") || "";
  return raw.split(";").map(s => s.trim()).find(s => s.startsWith("ggl_token="))?.slice("ggl_token=".length).trim() || null;
}

export async function resolveOwner(req: Request): Promise<string | null> {
  const token = ownerTokenFromCookie(req);
  if (token) {
    const user = await getUserFromToken(token);
    if (user) return user.id;
  }
  // A guest identifies itself with a signed token in the same header.
  const guest = req.headers.get("x-gg-guest");
  return guest ? guestIdFromToken(guest) : null;
}
