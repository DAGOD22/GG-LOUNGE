import { NextResponse } from 'next/server';
import { checkProxyBackendTarget } from '@/lib/proxy-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

/** On-demand outbound diagnostics for a small, fixed list of destinations. */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get('target') || '';
  try {
    const result = await checkProxyBackendTarget(target);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: 'Choose one of the supported proxy diagnostic targets.' }, { status: 400, headers: NO_STORE });
  }
}
