'use client'

import { useEffect } from 'react'

/**
 * Page-level error boundary.
 *
 * Deliberately a sibling of `global-error.tsx` rather than a copy of it: this one
 * renders *inside* the layout, so the header, fonts and theme variables are all
 * still available and it can look like part of the site. Only if this fails does
 * the global one take over.
 *
 * The useful part is `reset()`: it re-renders the segment instead of forcing a
 * full reload, so a render that failed on one bad state can often recover
 * without the person losing their place.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Vercel captures console.error from the browser; this keeps the digest and
    // the message next to each other in the logs.
    console.error('[GG-Lounge] page error', error?.digest ?? '', error)
  }, [error])

  return (
    <section
      className="catalog"
      role="alert"
      style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}
    >
      <div style={{ maxWidth: 520 }}>
        <p className="eyebrow" style={{ justifyContent: 'center' }}>SOMETHING BROKE</p>
        <h1 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 900, margin: '6px 0 10px', letterSpacing: '-.02em' }}>
          This part of the lounge didn’t load.
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px', fontWeight: 600 }}>
          It’s a display problem, not lost progress. Try again — if it keeps happening, reload the page.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              border: '1px solid var(--lime)',
              background: 'var(--lime)',
              color: '#0b0d12',
              fontWeight: 900,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              border: '1px solid var(--line)',
              color: 'var(--foreground)',
              fontWeight: 800,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Back to the lounge
          </a>
        </div>
      </div>
    </section>
  )
}
