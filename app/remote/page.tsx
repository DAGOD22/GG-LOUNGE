'use client';

/**
 * Remote game host.
 *
 * Runs a real website through the lounge's existing Scramjet proxy and presents
 * it as a game. Used for titles that only exist as a live web app — Monkeytype,
 * for example — so the game is the genuine third-party product (its own account
 * system, its own saves) rather than a lookalike rebuild.
 *
 * The URL is passed as ?url=. Only http(s) addresses are accepted.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, RotateCw } from 'lucide-react';
import { bootProxy, type ProxyRuntime, type ScramjetFrame } from '@/lib/proxy-client';

const TIMEOUT_MS = 45000;

export default function RemoteGamePage() {
  const iframe = useRef<HTMLIFrameElement>(null);
  const controlled = useRef<ScramjetFrame | null>(null);
  const runtime = useRef<ProxyRuntime | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [target, setTarget] = useState('');
  const [status, setStatus] = useState('Connecting to the lounge proxy…');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const navigate = useCallback((raw: string) => {
    try {
      if (!controlled.current) throw new Error('The proxy has not finished connecting yet.');
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS addresses can be opened.');
      setError('');
      setStatus('Loading the real site through the proxy…');
      controlled.current.go(url.href);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setStatus('Upstream response timed out.');
        setError('The site did not respond within 45 seconds. Your network or school filter may be blocking it, or the Wisp backend may be unreachable.');
      }, TIMEOUT_MS);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this address.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError('');
    setStatus('Connecting to the lounge proxy…');

    const requested = new URLSearchParams(window.location.search).get('url');
    const safe = requested && /^https?:\/\//i.test(requested) ? requested : '';
    setTarget(safe);
    if (!safe) {
      setError('No site address was supplied to the remote game host.');
      return;
    }

    bootProxy()
      .then(result => {
        if (cancelled || !iframe.current) return;
        runtime.current = result;
        const frame = result.controller.createFrame(iframe.current);
        controlled.current = frame;
        frame.addEventListener('urlchange', event => { if (!cancelled) setTarget(String(event.url)); });
        setReady(true);
        setStatus(result.notice);
        navigate(safe);
      })
      .catch(cause => {
        if (!cancelled) {
          setStatus('Not connected');
          setError(cause instanceof Error ? cause.message : 'Proxy startup failed.');
        }
      });

    return () => {
      cancelled = true;
      controlled.current = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [attempt, navigate]);

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#0b0d12',
        color: '#f4f2ec',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 12px',
          fontSize: 12,
          background: 'rgba(20,23,32,.95)',
          borderBottom: '1px solid rgba(255,255,255,.08)',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ fontSize: 11, letterSpacing: '.18em', color: '#9699a8' }}>GG-LOUNGE · REMOTE</strong>
        {target && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
            {target.replace(/^https?:\/\//, '')}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => ready && target ? navigate(target) : setAttempt(v => v + 1)}
          title="Reload"
          aria-label="Reload"
          style={iconButton}
        >
          <RotateCw size={14} />
        </button>
        {target && (
          <a href={target} target="_blank" rel="noopener noreferrer" title="Open outside the proxy" style={iconButton}>
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {!error && !ready && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', margin: 0, fontSize: 12, color: '#b5c1cc' }}>
          <Loader2 size={14} className="spin" /> {status}
        </p>
      )}

      {error && (
        <div
          role="alert"
          style={{
            margin: 12,
            padding: 16,
            borderRadius: 12,
            border: '1px solid #ae5960',
            background: '#2c1920',
            color: '#ffd4d8',
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <strong>Couldn’t load this remote game.</strong>
          <p style={{ margin: '6px 0 10px' }}>{error}</p>
          <button type="button" onClick={() => setAttempt(v => v + 1)} style={primaryButton}>
            Retry connection
          </button>
          <p style={{ fontSize: 11, opacity: .85, marginBottom: 0 }}>
            Remote games run the real third-party site through the lounge proxy, so they need a working
            connection and are still subject to that site’s own logins and network rules.
          </p>
        </div>
      )}

      <iframe
        ref={iframe}
        src="about:blank"
        title="Remote game"
        allow="fullscreen; autoplay; encrypted-media; clipboard-write; clipboard-read"
        style={{ flex: 1, width: '100%', border: 0, background: '#fff', display: error ? 'none' : 'block' }}
        onLoad={() => { if (timer.current) clearTimeout(timer.current); if (runtime.current) setStatus(runtime.current.notice); }}
      />
    </main>
  );
}

const iconButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,.14)',
  background: 'transparent',
  color: '#f4f2ec',
  cursor: 'pointer',
};

const primaryButton: React.CSSProperties = {
  background: '#d7f34a',
  color: '#0b0d12',
  fontWeight: 800,
  fontSize: 13,
  border: 0,
  borderRadius: 999,
  padding: '9px 18px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
