import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gate disabled — public lounge
 * Always returns gatePassed true so middleware never redirects.
 */
export async function GET() {
  return NextResponse.json({ banned: false, gatePassed: true, gateBanned: false });
}
