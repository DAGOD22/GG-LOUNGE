import { NextResponse } from 'next/server';

/**
 * Proxy transport discovery.
 *
 * The lounge proxy runs entirely on the in-app Bare relay (/api/bare/), which
 * is a plain HTTP transport. It used to advertise a Wisp (WebSocket) endpoint
 * as well, and the client preferred it whenever one was configured — but a Wisp
 * link needs its own always-on WebSocket server, and on this deployment it was
 * either missing or unreachable, so proxied pages hung on a blank screen.
 *
 * There is now no Wisp at all: no environment variable, no WebSocket branch, no
 * "Wisp connected" status. Browsing works over HTTP only.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      engine: 'ultraviolet',
      transport: 'bare',
      bare: '/api/bare/',
      wisp: null,
      websockets: false,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
