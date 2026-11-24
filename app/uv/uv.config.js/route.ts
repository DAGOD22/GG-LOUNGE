import { NextResponse } from 'next/server';

/**
 * Ultraviolet's client config.
 *
 * This used to be a dynamic Node route that read a `gg_bare` cookie and wrote
 * a different `bare:` address per visitor. It is now one fixed file, and the
 * reason is a bug that cost days: a service worker's install cannot tolerate a
 * config that can fail. The worker is evaluated from scratch on every install
 * and every cold start, so a single non-200 here, a cookie parsing surprise or
 * a cold Node lambda mid-install leaves the worker `redundant` — which the page
 * reports, accurately and uselessly, as "Proxy worker installation failed".
 *
 * Nothing was gained by the cookie, either: the only value it could take was
 * `/api/bare/`, which is what this route already fell back to. So it is a
 * constant, served with an immutable cache header, and the worker can no longer
 * be broken by anything the browser sends it.
 *
 * Kept as a route rather than moved to `public/` because the deployed worker
 * fetches exactly this path; changing the file's URL would strand every
 * already-installed worker on a 404.
 */
export const dynamic = 'force-static';

const CONFIG = `self.__uv$config = {
  prefix: "/service/",
  bare: "/api/bare/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/uv/uv.handler.js",
  bundle: "/uv/uv.bundle.js",
  config: "/uv/uv.config.js",
  sw: "/uv/uv.sw.js",
};
`;

export function GET() {
  return new NextResponse(CONFIG, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      // Never cached: an installed worker re-imports this on every cold start,
      // and a stale config is indistinguishable from a broken worker.
      'cache-control': 'no-store',
    },
  });
}
