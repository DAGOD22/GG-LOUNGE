import { NextResponse } from 'next/server';
import { assertPublicTarget } from '@/lib/network-target';
export const dynamic = 'force-dynamic';

export function GET() {
  const raw = process.env.WISP_URL?.trim();
  let wisp: string | null = process.env.GG_LOCAL_WISP === '1' && !process.env.VERCEL ? '/wisp/' : null;
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'wss:' || url.username || url.password || url.hash) throw new Error();
      assertPublicTarget(url);
      // The pinned libcurl Wisp transport requires a trailing slash on its path.
      // Normalize rather than letting a valid backend silently fail at runtime.
      if (!url.pathname.endsWith('/')) url.pathname += '/';
      wisp = url.href;
    } catch {
      return NextResponse.json(
        { error: 'WISP_URL must be a public wss:// endpoint without credentials or a fragment.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }
  return NextResponse.json(
    { engine: 'scramjet', wisp, websockets: Boolean(wisp) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
