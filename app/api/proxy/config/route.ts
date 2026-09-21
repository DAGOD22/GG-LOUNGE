import { NextResponse } from 'next/server';
import { assertPublicTarget } from '@/lib/network-target';
export const dynamic = 'force-dynamic';
export function GET() {
  const raw = process.env.WISP_URL?.trim();
  let wisp: string | null = process.env.GG_LOCAL_WISP === '1' && !process.env.VERCEL ? '/wisp/' : null;
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'wss:' || url.username || url.password || /^(localhost|127\.|0\.|\[?::1\]?$)/i.test(url.hostname)) throw new Error();
      assertPublicTarget(url);
      wisp = url.href;
    } catch {
      return NextResponse.json({ error: 'WISP_URL must be a public wss:// endpoint without credentials.' }, { status: 503 });
    }
  }
  return NextResponse.json({ engine: 'scramjet', wisp, websockets: Boolean(wisp) }, { headers: { 'Cache-Control': 'no-store' } });
}
