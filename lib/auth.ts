import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "gg_admin_session";

/**
 * Admin password. In development a documented default keeps local setup
 * frictionless; in production the env var is REQUIRED — boot fails loudly
 * instead of silently shipping a password that is public in the repository.
 */
export function adminPassword(): string {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ADMIN_PASSWORD is not set. Refusing to start the admin console with a built-in password. Set ADMIN_PASSWORD in your hosting environment (Vercel → Project → Settings → Environment Variables).",
    );
  }
  console.warn("[auth] ADMIN_PASSWORD unset — using the development default. Never deploy this.");
  return "220115";
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
