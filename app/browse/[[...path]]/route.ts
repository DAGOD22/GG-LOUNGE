import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
// A bookmark opened without an active worker returns to the launcher instead of 404.
export function GET(request: Request) {
  if (request.headers.get('sec-fetch-dest') && !['document','iframe'].includes(request.headers.get('sec-fetch-dest')!)) return Response.json({ error: 'The proxy worker is not active. Reopen the page through /proxy.' }, { status: 503 });
  const incoming = new URL(request.url);
  let target = '';
  try { target = decodeURIComponent(incoming.pathname.slice('/browse/'.length)); } catch {}
  const launcher = new URL('/proxy', incoming.origin);
  if (/^https?:\/\//i.test(target)) launcher.searchParams.set('url', target);
  return NextResponse.redirect(launcher, 307);
}
