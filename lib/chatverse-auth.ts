/**
 * The CHATVERSE door.
 *
 * One password, its own cookie, its own lifetime. It is deliberately *not* the
 * site's admin session: CHATVERSE is reachable from a chat page by typing a
 * password, and a person who types it should not silently receive the admin
 * console's powers (deleting games, banning people). Separate cookie, separate
 * signature, separate expiry — so revoking one never touches the other.
 *
 * The cookie value is an HMAC of a constant under the password, exactly like
 * `lib/auth.ts`, and it is compared in constant time. That means the cookie
 * cannot be forged without the password, and it carries no room, name or other
 * state — it only answers "did this browser get in".
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const CHATVERSE_COOKIE = 'gg_chatverse';

/** Session length. A chat that stays unlocked forever is a chat someone
 *  else can use from a shared classroom machine a week later. */
const SESSION_SECONDS = 60 * 60 * 12;

export function chatversePassword(): string {
  return process.env.CHATVERSE_PASSWORD || 'agastya220115';
}

export function chatverseSignature(): string {
  return createHmac('sha256', chatversePassword()).update('gg-lounge-chatverse').digest('hex');
}

/** Constant-time compare of two hex digests. */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function isChatverseMember(): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(CHATVERSE_COOKIE)?.value ?? '';
  return safeEqual(value, chatverseSignature());
}

/** The cookie the login route sets. */
export function chatverseCookie() {
  return {
    name: CHATVERSE_COOKIE,
    value: chatverseSignature(),
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  };
}

export const CHATVERSE_COOKIE_NAME = CHATVERSE_COOKIE;
export { SESSION_SECONDS as CHATVERSE_SESSION_SECONDS };
