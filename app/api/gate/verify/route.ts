import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The gate is disabled — the lounge is public.
 *
 * This endpoint used to mint a signed `gg_gate` cookie from a password compiled
 * into the bundle. Nothing has read that cookie since the gate was turned off,
 * so the only thing the code still did was keep a plaintext password in the
 * repository and hand out a credential for a check that no longer exists. It
 * answers the same shape as before so an old client does not break.
 */
export async function POST() {
  return NextResponse.json({ ok: true, disabled: true });
}
