'use client';
import { useEffect, useRef, useState } from 'react';
import { bootProxy, normalizeProxyUrl } from '@/lib/proxy-client';

/**
 * Full-bleed player for proxy-only games. The game fills the viewport and the
 * proxy is invisible infrastructure — the player never sees a browser shell,
 * an address bar or the proxied URL.
 */
export function ProxyGameFrame({ title, target }: { title: string; target: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Loading…');

  useEffect(() => {
    let cancelled = false;
    bootProxy().then(runtime => {
      if (cancelled) return;
      setSrc(runtime.encode(normalizeProxyUrl(target)));
      setStatus('');
    }).catch(cause => {
      if (cancelled) return;
      setStatus('');
      setError(cause instanceof Error ? cause.message : 'The game could not start.');
    });
    return () => { cancelled = true; };
  }, [target]);

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#0b0d12', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{title}</h1>
      {!src && !error && (
        <div role="status" aria-live="polite" style={{ margin: 'auto', color: '#b5c1cc', font: '600 14px system-ui' }}>{status}</div>
      )}
      {error && (
        <div role="alert" style={{ margin: 'auto', maxWidth: 520, padding: 24, borderRadius: 12, border: '1px solid #ae5960', background: '#2c1920', color: '#ffd4d8', font: '14px system-ui' }}>
          <strong>Couldn’t start {title}</strong>
          <p style={{ marginTop: 8 }}>{error}</p>
          <p style={{ marginTop: 8, opacity: 0.8 }}>This title needs the proxy. A managed browser may disable service workers, and the game’s own network can still block access.</p>
          <button onClick={() => location.reload()} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 999, border: 0, background: '#d9f56b', color: '#0b0d12', fontWeight: 800, cursor: 'pointer' }}>Retry</button>
        </div>
      )}
      {src && (
        <iframe
          ref={frame}
          src={src}
          title={title}
          allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ flex: 1, width: '100%', height: '100%', border: 0, background: '#000' }}
        />
      )}
    </main>
  );
}
