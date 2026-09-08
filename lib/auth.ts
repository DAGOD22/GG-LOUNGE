import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "gg_admin_session";

/** Admin password: env override, default 220115. */
export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "220115";
}

export function adminSignature(): string {
  return createHmac("sha256", adminPassword()).update("gg-lounge-admin").digest("hex");
}

export async function isAdmin(): Promise<boolean> {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  const expected = adminSignature();
  if (!value || value.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}
