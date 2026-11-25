'use client'

import { useState } from 'react'
import Link from 'next/link'

/**
 * A real 404.
 *
 * Without this file Next serves its own bare "404: This page could not be
 * found." — white page, default font, no way back. On a site that is mostly
 * deep links to 254 game pages, a mistyped slug is not an exotic case, it is
 * the most likely way someone arrives at a page that does not exist.
 *
 * So this page does three things the default cannot: it keeps the lounge's own
 * look, it offers the search box (`?q=` is a working entry point now), and it
 * reels the visitor back to something playable instead of dead-ending them.
 */
export default function NotFound() {
  const [term, setTerm] = useState('')

  return (
    <main className="lounge-shell" id="main-content">
      <div className="noise" aria-hidden="true" />
      <section
        className="catalog"
        style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}
      >
        <div style={{ maxWidth: 560 }}>
          <p className="eyebrow" style={{ justifyContent: 'center' }}>ERROR 404</p>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, margin: '6px 0 10px', letterSpacing: '-.02em' }}>
            That page isn’t on the floor.
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px', fontWeight: 600 }}>
            The link is broken, or the game was renamed. Nothing was lost — your favourites and play history
            are still saved on this device.
          </p>

          <form
            onSubmit={event => {
              event.preventDefault()
              const next = term.trim()
              if (next) location.href = `/?q=${encodeURIComponent(next)}`
            }}
            style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 18 }}
          >
            <label htmlFor="not-found-search" className="sr-only">Search the library</label>
            <input
              id="not-found-search"
              value={term}
              onChange={event => setTerm(event.target.value)}
              placeholder="Search 254 games"
              autoComplete="off"
              style={{
                flex: '1 1 240px',
                minWidth: 0,
                padding: '11px 14px',
                borderRadius: 999,
                border: '1px solid var(--line)',
                background: 'rgba(255,255,255,.05)',
                color: 'var(--foreground)',
                fontSize: 13,
                fontWeight: 700,
              }}
            />
            <button
              type="submit"
              style={{
                padding: '11px 20px',
                borderRadius: 999,
                border: '1px solid var(--lime)',
                background: 'var(--lime)',
                color: '#0b0d12',
                fontWeight: 900,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Search
            </button>
          </form>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link className="gg-secondary" href="/">← Back to the lounge</Link>
            <Link className="gg-secondary" href="/#games">Browse all games</Link>
            <Link className="gg-secondary" href="/secret-link-doc">Link directory</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
