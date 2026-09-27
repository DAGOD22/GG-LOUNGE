/**
 * Guard for /api/proxy/* only.
 *
 * Next decodes dynamic route params with decodeURIComponent, which throws
 * URIError on a malformed segment like '%%%' — surfacing as a bare 500 from
 * the router, BEFORE our route handler can answer. Real proxy segments are
 * always base64url ([A-Za-z0-9_-]) produced by encodeProxyPath, so anything
 * else (percent-encoding, slashes, dots, spaces) is rejected here with an
 * honest 400 that leaks nothing.
 *
 * The matcher is scoped strictly to the proxy API — auth, admin, achievements
 * and every other lounge route are untouched.
 */
import { NextResponse } from 'next/server'

const SEGMENT_OK = /^[A-Za-z0-9_-]+$/

export function proxy(request: Request): Response {
  const url = new URL(request.url)
  const parts = url.pathname.split('/') // ['', 'api', 'proxy', '<segment>', ...]
  const segment = parts[3] ?? ''
  if (!SEGMENT_OK.test(segment)) {
    return Response.json(
      {
        error: 'BAD_TARGET',
        message: 'That address could not be decoded.',
        status: 400,
        host: null,
      },
      { status: 400, headers: { 'cache-control': 'no-store' } },
    )
  }
  // Next 16's Node proxy runtime has no static Response.next — use NextResponse.
  return NextResponse.next()
}

export const config = {
  matcher: '/api/proxy/:path*',
}
