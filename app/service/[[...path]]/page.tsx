import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * What `/service/…` returns when the service worker is not controlling the page.
 *
 * `/service/<encoded>` is a proxied document. It is normally answered by the
 * service worker and this route never runs. When it *does* run, that is the
 * whole diagnosis: no worker is in control, so there is nothing to proxy.
 *
 * What used to run here was worse than useless. It was a client component that
 * decoded the URL, tried to hand it to `/proxy?url=…`, and on any failure did
 * `location.replace('/proxy')` — so an unproxied request silently replaced the
 * address the user had asked for with the proxy's home page. From the outside
 * that is indistinguishable from "the proxy bounces me back to GG-Lounge", and
 * it destroyed the evidence needed to fix it: the destination was gone from the
 * address bar by the time anyone looked.
 *
 * So: keep the destination visible, say plainly what failed, and offer the two
 * actions that actually help — install the worker and retry, or open the real
 * site. Nothing here redirects on its own.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Proxy worker not running',
  robots: { index: false, follow: false },
};

/** Decode Ultraviolet's XOR codec, matching `app/uv/uv.config.js`. */
function decodeXor(payload: string): string | null {
  let raw = payload;
  try { raw = decodeURIComponent(payload); } catch { /* already raw */ }
  const decoded = raw
    .split('')
    .map((char, index) => (index % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 2) : char))
    .join('');
  return /^https?:\/\//i.test(decoded) ? decoded : null;
}

export default async function ServiceFallback({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const payload = (path ?? []).join('/');
  const decoded = payload ? decodeXor(payload) : null;
  const host = (() => {
    try { return decoded ? new URL(decoded).host : ''; } catch { return ''; }
  })();

  return (
    <main
      id="main-content"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px 20px',
        background: '#0b0d12',
        color: '#e8edf4',
      }}
    >
      <div style={{ maxWidth: 560, width: '100%' }}>
        <p style={{ fontSize: 11, letterSpacing: '.18em', fontWeight: 800, color: '#d7f34a', margin: 0 }}>
          GG-LOUNGE / PROXY
        </p>
        <h1 style={{ fontSize: 26, lineHeight: 1.15, margin: '10px 0 14px' }}>
          {host ? `${host} can’t be opened yet` : 'The proxy worker isn’t running'}
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: '#b5c1cc', margin: '0 0 14px' }}>
          This address is a proxied page, and proxied pages are served by a background
          worker in your browser. That worker is not in control of this page right now, so
          there is nothing here to load. Nothing is wrong with the destination.
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: '#8f9bab', margin: '0 0 18px', paddingLeft: 18 }}>
          <li>Private/incognito windows and some school or work browsers disable service workers.</li>
          <li>An extension, or “block all cookies”, can stop the worker registering.</li>
          <li>If you have just deployed, a reload is usually all it takes.</li>
        </ul>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            href={decoded ? `/proxy?url=${encodeURIComponent(decoded)}` : '/proxy'}
            style={{
              background: '#d7f34a', color: '#0b0d12', fontWeight: 800, fontSize: 13,
              padding: '10px 16px', borderRadius: 10, textDecoration: 'none',
            }}
          >
            Retry through the proxy
          </Link>
          {decoded && (
            <a
              href={decoded}
              target="_blank"
              rel="noreferrer"
              style={{
                border: '1px solid #2a3242', color: '#e8edf4', fontWeight: 700, fontSize: 13,
                padding: '10px 16px', borderRadius: 10, textDecoration: 'none',
              }}
            >
              Open {host || 'the site'} directly ↗
            </a>
          )}
        </div>
        {decoded && (
          <p style={{ fontSize: 11, color: '#5f6b7a', marginTop: 18, overflowWrap: 'anywhere' }}>
            Requested: {decoded}
          </p>
        )}
      </div>
    </main>
  );
}
