import { createHmac, timingSafeEqual } from "node:crypto";

export const GATE_PASSWORD = 'kai is the best at coding';
export const GATE_COOKIE = 'gg_gate';
export const GATE_MAX_AGE = 3 * 60 * 60; // 3 hours in seconds
export const GATE_SECRET = process.env.GATE_SECRET || process.env.ADMIN_PASSWORD || 'kai-gate-secret-220115';

export function createGateValue(expiryMs: number): string {
  const data = String(expiryMs);
  const sig = createHmac('sha256', GATE_SECRET).update(data).digest('hex');
  return `${data}.${sig}`;
}

export function verifyGateValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = createHmac('sha256', GATE_SECRET).update(expStr).digest('hex');
  try {
    if (sig.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function getGateCookieHeader(expiryMs: number): string {
  const val = createGateValue(expiryMs);
  // HttpOnly, Secure in production, SameSite Lax, Path /, Max-Age 3h
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${GATE_COOKIE}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GATE_MAX_AGE}${secure}`;
}

export function parseGateCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === GATE_COOKIE) return rest.join('=');
  }
  return null;
}
