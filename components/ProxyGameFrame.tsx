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
  // A proxied title can fail *after* the runtime boots — the remote site blocks
  // the proxy, or a script never finishes. Without this the player just stares
  // at a black frame with no explanation.
  const [stalled, setStalled] = useState(false);

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

  // Preflight the target through the proxy itself. An iframe fires `onLoad`
  // even when it lands on the browser's error page, so the only honest check is
  // asking the proxy for the URL and seeing whether it returns anything.
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    setStalled(false);
    (async () => {
      try {
        const res = await fetch(src, { credentials: 'omit' });
        const body = await res.text();
        if (cancelled) return;
        if (!res.ok || body.trim().length < 40) setStalled(true);
      } catch {
        if (!cancelled) setStalled(true);
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

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
      {src && stalled && (
        <div
          role="alert"
          style={{ position: 'absolute', left: '50%', bottom: 28, transform: 'translateX(-50%)', maxWidth: 560, width: 'calc(100% - 32px)', padding: '14px 18px', borderRadius: 12, border: '1px solid #3a4450', background: 'rgba(17, 20, 26, 0.96)', color: '#e8ecf1', font: '13px/1.5 system-ui', boxShadow: '0 18px 40px rgba(0,0,0,.5)' }}
        >
          <strong style={{ display: 'block', marginBottom: 4 }}>{title} is taking a while to load.</strong>
          This title runs through the proxy. Some sites block proxied traffic, and a managed browser may disable service workers.
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => location.reload()} style={{ padding: '7px 14px', borderRadius: 999, border: 0, background: '#d9f56b', color: '#0b0d12', fontWeight: 800, cursor: 'pointer' }}>Reload</button>
            <a href={target} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', borderRadius: 999, border: '1px solid #3a4450', color: '#e8ecf1', fontWeight: 700, textDecoration: 'none' }}>Open direct</a>
          </div>
        </div>
      )}
    </main>
  );
}
