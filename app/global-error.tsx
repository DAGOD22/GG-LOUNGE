'use client'

/**
 * The last line of defence.
 *
 * `app/error.tsx` catches a render failure inside a page. `global-error.tsx`
 * catches the ones that take out the root layout, where there is no stylesheet,
 * no provider and no header left to lean on — so it has to look after itself.
 *
 * Both exist because a client-side crash used to leave a blank screen. On a site
 * a person opens during a five-minute gap between classes, a blank screen reads
 * as "this site is broken and blocked", which is the exact impression the site
 * cannot afford. It says what happened, it offers a reload, and it keeps a way
 * home that works even if routing is what failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b0d12',
          color: '#f4f2ec',
          fontFamily: "'Space Grotesk Variable', system-ui, -apple-system, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <div
            style={{
              width: 52,
              height: 52,
              margin: '0 auto 18px',
              borderRadius: 16,
              display: 'grid',
              placeItems: 'center',
              background: '#d7f34a',
              color: '#0b0d12',
              fontSize: 24,
              fontWeight: 900,
            }}
            aria-hidden="true"
          >
            !
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 10px', letterSpacing: '-.02em' }}>
            The lounge hit a snag.
          </h1>
          <p style={{ color: '#9aa3b2', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px', fontWeight: 600 }}>
            Something failed while drawing this page. Your saved games, favourites and settings are untouched —
            they live on this device, not in the page that broke.
          </p>
          {error?.digest && (
            <p style={{ color: '#6c7484', fontSize: 11, fontFamily: 'ui-monospace, monospace', margin: '0 0 18px' }}>
              reference: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '11px 22px',
                borderRadius: 999,
                border: '1px solid #d7f34a',
                background: '#d7f34a',
                color: '#0b0d12',
                fontWeight: 900,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            {/* A plain anchor, not <Link>: if the router is what crashed, the
                router is the wrong tool for getting out. */}
            <a
              href="/"
              style={{
                padding: '11px 22px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,.16)',
                color: '#f4f2ec',
                fontWeight: 800,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Back to the lounge
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
