'use client'

import { useEffect } from 'react'

/**
 * Registers the app's own service worker.
 *
 * The file is `public/gg-app-sw.js`, not `/gg-sw.js` — that one belongs to the
 * proxy and must keep owning `/browse/`. Registering here rather than in a
 * script tag means it only runs in the browser, after paint, so it never delays
 * first render on the one page load that matters.
 *
 * Registration is skipped in development, where a cache in front of the dev
 * server produces the most confusing class of "my change didn't apply" bug.
 */
export default function GlobalSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    // Wait for the page to be idle: a worker install fires network requests,
    // and it has no business competing with the first screen of games.
    const register = () => {
      navigator.serviceWorker
        .register('/gg-app-sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          /* private mode, or a browser that said no: the site works either way */
        })
    }

    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (typeof idle === 'function') {
      const handle = idle(register)
      return () => {
        const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback
        cancel?.(handle)
      }
    }
    const timer = window.setTimeout(register, 2500)
    return () => window.clearTimeout(timer)
  }, [])

  return null
}
