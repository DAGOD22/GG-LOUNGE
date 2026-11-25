'use client'

import { useEffect } from 'react'

/**
 * Makes sure exactly one service worker owns this origin.
 *
 * There used to be two: `/gg-app-sw.js` for offline caching, and `/uv/uv.sw.js`
 * for the proxy. Both were registered at scope `/`, and a scope only holds one
 * registration — so the second one to install replaced the first, sending it to
 * `state === 'redundant'`. The visible symptoms were "Proxy worker installation
 * failed" and, because the *replaced* worker was the proxy's, proxied
 * navigations falling through to Next.js and bouncing back to the lounge.
 *
 * The two are now one worker (`/uv/uv.sw.js`, which proxies AND caches), so this
 * component's only job on boot is to retire the old offline worker if it is
 * still installed. It also deliberately does NOT register the proxy worker —
 * that happens on the proxy page, where the user has asked for a proxy and
 * where a slow install cannot delay the first screen of games.
 */
export default function GlobalSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const retire = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          registrations
            .filter(registration => {
              const url = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL
              if (!url) return false
              // The old standalone offline worker, in every path it ever had.
              return /\/(gg-app-sw|gg-sw|proxy\/sw)\.js$/.test(new URL(url).pathname)
            })
            .map(registration => registration.unregister()),
        )
      } catch {
        /* private mode, or a browser that said no: the site works either way */
      }
    }

    // Wait for the page to be idle: unregistering a worker can trigger network
    // work, and it has no business competing with the first screen of games.
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (typeof idle === 'function') {
      const handle = idle(retire)
      return () => {
        const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback
        cancel?.(handle)
      }
    }
    const timer = window.setTimeout(retire, 2500)
    return () => window.clearTimeout(timer)
  }, [])

  return null
}
