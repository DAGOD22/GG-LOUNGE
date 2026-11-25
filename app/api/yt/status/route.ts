import { NextResponse } from "next/server";
import { PipedProbe } from "@/lib/yt-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnosis endpoint for the YouTube picker.
 *
 * The picker used to render a bare "no internet" screen whenever the Piped
 * relay failed, which is wrong twice over: the visitor's connection is usually
 * fine, and the real cause is on our side (relay outage or an egress block).
 * This reports which of those it is so the page can say something true.
 */
export async function GET() {
  const probe = await PipedProbe.check();
  return NextResponse.json(probe, { headers: { "cache-control": "no-store" } });
}
