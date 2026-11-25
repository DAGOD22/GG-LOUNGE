import { NextResponse } from "next/server";
import { CHATVERSE_COOKIE_NAME } from "@/lib/chatverse-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Leave CHATVERSE: clear the cookie so the door is locked again. */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: CHATVERSE_COOKIE_NAME, value: "", path: "/", maxAge: 0 });
  return response;
}
