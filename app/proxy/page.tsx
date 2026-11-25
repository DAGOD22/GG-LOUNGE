'use client';
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Home, RotateCw, Search } from 'lucide-react';
import { bootProxy, createFrame, normalizeProxyUrl, type ProxyFrame, type ProxyRuntime } from '@/lib/proxy-client';
import { setProxyDestination } from '@/lib/proxy-activity';

const shortcuts = [
  ['YouTube', 'https://www.youtube.com/'], ['Bing', 'https://www.bing.com/'],
  ['Wikipedia', 'https://www.wikipedia.org/'], ['GitHub', 'https://github.com/'],
  ['Discord', 'https://discord.com/app'], ['Reddit', 'https://www.reddit.com/'],
  ['Roblox website', 'https://www.roblox.com/'], ['now.gg', 'https://now.gg/'],
];
export default function ProxyPage() {
  const iframe = useRef<HTMLIFrameElement>(null);
  const controlledFrame = useRef<ProxyFrame | null>(null);
  const runtime = useRef<ProxyRuntime | null>(null);
  const [address, setAddress] = useState('');
  const [current, setCurrent] = useState('');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Starting the proxy…');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [limited, setLimited] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback((input: string) => {
    try {
      if (!controlledFrame.current) throw new Error('Wait for the proxy to connect first.');
      const url = normalizeProxyUrl(input);
      const active = runtime.current;
      if (!active) throw new Error('Wait for the proxy to connect first.');
      const proxied = active.encode(url);
      setError(''); setLoading(true); setAddress(url); setCurrent(proxied);
      setProxyDestination(url);
      controlledFrame.current.go(proxied);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { setLoading(false); setStatus('Upstream response timed out.'); setError('No page response after 35 seconds. The destination may be unreachable, rate-limiting us, or requiring JavaScript the proxy cannot carry. Try again or open the site directly.'); }, 35000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this address.'); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let frame: ProxyFrame | null = null;
    setReady(false); setError(''); setStatus('Starting the proxy…');
    bootProxy().then(result => {
      if (cancelled || !iframe.current) return;
      runtime.current = result;
      frame = createFrame(iframe.current, result.prefix, result.decode);
      const active = frame;
      controlledFrame.current = active;
      // The frame reports the real destination on every navigation, so the
      // address bar follows redirects and in-page links instead of freezing on
      // whatever was typed.
      active.addEventListener('urlchange', (event: { url: string }) => {
        if (cancelled) return;
        setAddress(event.url);
        setCurrent(event.url);
        // Publish where the frame actually is, so the roster can say
        // "in the proxy on youtube.com" and follow in-frame navigation —
        // this route's own query string does not change when it happens.
        setProxyDestination(event.url);
        setLoading(false);
        setError('');
      });
      setReady(true); setLimited(false); setStatus(result.notice);
      const requested = new URLSearchParams(location.search).get('url');
      if (requested) navigate(requested);
    }).catch(cause => {
      if (!cancelled) { setStatus('Not connected'); setError(cause instanceof Error ? cause.message : 'Proxy startup failed.'); }
    });
    return () => {
      cancelled = true;
      controlledFrame.current = null;
      if (timer.current) clearTimeout(timer.current);
      // The effect may re-run (Retry); tear the old frame's polling down.
      frame?.destroy();
    };
  }, [attempt, navigate]);

  function onLoad() {
    if (!current) return;
    if (timer.current) clearTimeout(timer.current);
    setLoading(false);
    // iframe.onload also fires for HTTP 404/502. Inspect our own error document.
    try {
      const doc = iframe.current?.contentDocument;
      if (doc?.title === 'Proxy connection failed' || doc?.title?.startsWith('Ultraviolet')) {
        const detail = doc.body?.innerText?.slice(0, 450);
        if (detail && /failed|error|unreachable/i.test(detail)) setError(detail);
      }
    } catch { /* destination isolation prevents inspection; do not call it a failure */ }
    if (runtime.current) setStatus(runtime.current.notice);
  }
  return <main className="proxy-shell" style={{ minHeight: '100dvh' }} id="main-content">
    <header className="proxy-bar" style={{ flexWrap: 'wrap', height: 'auto', minHeight: 58, padding: '10px 16px' }}>
      <Link className="proxy-brand" href="/"><Globe size={17} /> GG-LOUNGE <span>/ PROXY</span></Link>
      <div className="proxy-nav">
        <button aria-label="Back" disabled={!current} onClick={() => controlledFrame.current?.back()}><ArrowLeft size={16} /></button>
        <button aria-label="Forward" disabled={!current} onClick={() => controlledFrame.current?.forward()}><ArrowRight size={16} /></button>
        <button aria-label="Reload page" disabled={!current} onClick={() => navigate(address)}><RotateCw size={16} /></button>
        <button aria-label="Proxy home" onClick={() => { setCurrent(''); setAddress(''); setError(''); setLoading(false); if (iframe.current) iframe.current.src = 'about:blank'; }}><Home size={16} /></button>
      </div>
      <form className="proxy-form" style={{ minWidth: 180, flex: 1 }} onSubmit={event => { event.preventDefault(); navigate(address); }}>
        <Search size={15} /><input aria-label="Website address or search" placeholder="Search or enter a website" value={address} onChange={event => setAddress(event.target.value)} />
        <button type="submit" disabled={!ready}>Go</button>
      </form>
      <a href="/apps" style={{ fontSize: 13, color: 'var(--foreground)' }}>Apps</a>
    </header>
    <div role="status" aria-live="polite" style={{ padding: '8px 18px', background: 'var(--panel)', color: limited ? '#ffd18b' : '#b5c1cc', fontSize: 12 }}>
      {loading ? 'Loading through the proxy…' : status}
    </div>
    {error && <div role="alert" style={{ padding: 20, margin: 16, border: '1px solid #ae5960', borderRadius: 12, background: '#2c1920', color: '#ffd4d8' }}>
      <strong>Couldn’t connect</strong><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{error}</p>
      <button className="play-button" onClick={() => ready && current ? navigate(address) : setAttempt(value => value + 1)}>Retry connection</button>
      {address && <a href={address} target="_blank" rel="noreferrer" style={{ marginLeft: 10, fontSize: 12, color: 'inherit' }}>Open directly ↗</a>}
      <p style={{ fontSize: 12 }}>
        Some big games portals — CrazyGames, Poki, Coolmath and now.gg — refuse traffic that arrives from a
        datacenter address, which is what a hosted proxy looks like to them. Nothing on this page can change that:
        it is their block, not a bug here. The catalogue’s own 250+ self-hosted games are unaffected and always work.
      </p>
      <p style={{ fontSize: 12 }}>A managed browser may also disable service workers or WebSockets, and the proxy cannot remove a destination’s login, CAPTCHA, DRM or cloud-streaming restrictions.</p>
    </div>}
    {!current && <section className="proxy-home">
      <p className="eyebrow">ONE BROWSER · ONE CONNECTION</p><h1>Your apps, together.</h1>
      <p>Self-hosted proxy runtime. Every app uses the same launcher and waits for the proxy to be ready.</p>
      <div className="proxy-quick">{shortcuts.map(([name, url]) => <button key={url} disabled={!ready} onClick={() => navigate(url)}>{name}</button>)}</div>
      <p style={{ maxWidth: 620, margin: '24px auto', fontSize: 13 }}>Roblox experiences need the Roblox app or a compatible cloud gaming service. Browsing its website is not the same as running the game. Video and realtime apps work through the same connection as everything else, but a site that insists on its own custom protocol can still refuse to load.</p>
    </section>}
    {current && /(?:roblox\.com|now\.gg)/i.test(current) && <p style={{ margin: 0, padding: '8px 18px', fontSize: 12, color: '#ffd18b' }}>Cloud gaming availability, accounts and WebRTC are controlled by the provider. This launcher does not supply a Roblox game server.</p>}
    <iframe ref={iframe} src="about:blank" title="Proxied browser" className="proxy-frame" allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write" allowFullScreen onLoad={onLoad} onError={() => { setLoading(false); setError('The proxied page failed to load.'); }} style={{ display: current ? 'block' : 'none', width: '100%', flex: 1, minHeight: 'calc(100dvh - 108px)', border: 0, background: 'white' }} />
    {current && <a href={current} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, padding: '6px 18px' }}><ExternalLink size={12} style={{ display: 'inline' }} /> Open original site outside the proxy</a>}
  </main>;
}
