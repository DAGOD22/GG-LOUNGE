'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Globe, Home, RotateCw, Search } from 'lucide-react';

declare global {
  interface Window {
    __uv$config?: { encodeUrl: (url: string) => string };
  }
}

/** Public fallback bare servers (used only if the lounge's own proxy is down). */
const PUBLIC_BARES = [
  'https://tomphttp.outv1.workers.dev/',
  'https://bare.urbetterwaittilldinneridk.workers.dev/',
];

const QUICK = [
  ['Poki', 'https://poki.com'],
  ['Google', 'https://www.google.com'],
  ['DuckDuckGo', 'https://duckduckgo.com'],
  ['GitHub', 'https://github.com'],
  ['Wikipedia', 'https://www.wikipedia.org'],
  ['Reddit', 'https://www.reddit.com'],
  ['YouTube', 'https://www.youtube.com'],
  ['CrazyGames', 'https://www.crazygames.com'],
];

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

export default function ProxyPage() {
  const [address, setAddress] = useState('');
  const [current, setCurrent] = useState('');
  const [status, setStatus] = useState('Starting proxy…');
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        // Pick a working bare server: local first, then public fallbacks.
        let bare = '/api/bare/';
        try {
          const r = await fetch('/api/bare/', { cache: 'no-store' });
          if (!r.ok) throw new Error('local down');
          await r.json();
        } catch {
          bare = '';
          for (const pub of PUBLIC_BARES) {
            try {
              const r = await fetch(pub, { cache: 'no-store' });
              if (r.ok) {
                bare = pub;
                break;
              }
            } catch {
              /* try next */
            }
          }
          if (!bare) {
            if (!cancelled) setStatus('Proxy unreachable — the lounge server has no internet right now.');
            return;
          }
        }
        document.cookie = `gg_bare=${encodeURIComponent(bare)}; path=/; max-age=3600; samesite=lax`;
        await loadScript('/uv/uv.bundle.js');
        await loadScript('/uv/uv.config.js');
        await navigator.serviceWorker.register('/uv/uv.sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        if (!cancelled) {
          setReady(true);
          setStatus(bare === '/api/bare/' ? 'Connected • lounge proxy' : 'Connected • fallback proxy');
        }
      } catch (err) {
        if (!cancelled) setStatus('Proxy failed to start: ' + (err instanceof Error ? err.message : 'error'));
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  function go(raw: string) {
    const enc = window.__uv$config?.encodeUrl;
    if (!enc) return;
    let url = raw.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = url.includes('.') && !url.includes(' ') ? 'https://' + url : 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
    }
    setCurrent(enc(url));
    setAddress(url);
  }

  function nav(fn: () => void) {
    try {
      fn();
    } catch {
      /* cross-origin */
    }
  }

  return (
    <main className="proxy-shell">
      <header className="proxy-bar">
        <a className="proxy-brand" href="/">
          <Globe size={17} /> GG-LOUNGE™ <span>/ PROXY</span>
        </a>
        <div className="proxy-nav">
          <button aria-label="Back" onClick={() => nav(() => frame.current?.contentWindow?.history.back())}>
            <ArrowLeft size={16} />
          </button>
          <button aria-label="Forward" onClick={() => nav(() => frame.current?.contentWindow?.history.forward())}>
            <ArrowRight size={16} />
          </button>
          <button aria-label="Reload" onClick={() => nav(() => frame.current?.contentWindow?.location.reload())}>
            <RotateCw size={16} />
          </button>
          <button aria-label="Home" onClick={() => { setCurrent(''); setAddress(''); }}>
            <Home size={16} />
          </button>
        </div>
        <form
          className="proxy-form"
          onSubmit={(e) => {
            e.preventDefault();
            go(address);
          }}
        >
          <Search size={15} />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={ready ? 'Search or enter a URL — e.g. poki.com' : 'Starting…'}
            disabled={!ready}
            aria-label="URL or search"
          />
        </form>
        <span className={`proxy-status ${ready ? 'ok' : ''}`}>{status}</span>
      </header>
      {!current ? (
        <section className="proxy-home">
          <p className="eyebrow">UNBLOCKED BROWSER</p>
          <h1>Go anywhere.</h1>
          <p>Powered by Interstellar&apos;s Ultraviolet proxy stack. Type a URL above or pick a shortcut.</p>
          <div className="proxy-quick">
            {QUICK.map(([name, url]) => (
              <button key={name} disabled={!ready} onClick={() => go(url)}>
                {name}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <iframe ref={frame} className="proxy-frame" src={current} title="Proxied page" allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture" />
      )}
    </main>
  );
}
