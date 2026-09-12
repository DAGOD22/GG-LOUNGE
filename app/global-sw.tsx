'use client';
import { useEffect } from 'react';

export default function GlobalSW() {
  useEffect(() => {
    let cancelled = false;
    async function init() {
      // don't run on server
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
      try {
        // if already controlling, skip
        if (navigator.serviceWorker.controller) return;
        // Try to register SW quickly so /service/ tunnels work on first visit to /apps etc.
        // We don't need bare probing here - uv.config.js will supply bare via cookie
        const load = (src: string) =>
          new Promise<void>((res, rej) => {
            if (document.querySelector(`script[src="${src}"]`)) return res();
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = () => res();
            s.onerror = () => rej(new Error('load ' + src));
            document.head.appendChild(s);
          });
        try { await load('/uv/uv.bundle.js'); } catch {}
        try { await load('/uv/uv.config.js'); } catch {}
        const candidates: Array<{ script: string; scope: string }> = [
          { script: '/uv/uv.sw.js', scope: '/service/' },
          { script: '/uv/uv.sw.js', scope: '/' },
          { script: '/service/uv.sw.js', scope: '/service/' },
          { script: '/uv.sw.js', scope: '/' },
        ];
        for (const c of candidates) {
          try {
            const reg = await navigator.serviceWorker.register(c.script, {
              scope: c.scope,
              updateViaCache: 'none' as never,
            });
            try { await reg.update(); } catch {}
            await Promise.race([
              navigator.serviceWorker.ready,
              new Promise((_, rej) => setTimeout(() => rej(new Error('ready timeout')), 3200)),
            ]);
            if (navigator.serviceWorker.controller || reg.active) break;
            // wait a bit for claim
            await new Promise((r) => setTimeout(r, 400));
            if (navigator.serviceWorker.controller) break;
          } catch {}
        }
      } catch {}
    }
    // Defer a bit so page paints first
    const t = setTimeout(() => void init(), 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);
  return null;
}
