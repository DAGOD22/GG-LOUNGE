'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, ExternalLink, Globe, Home, RotateCw, Search, ShieldBan, ShieldOff } from 'lucide-react';
import { bootProxy, normalizeProxyUrl, type ProxyRuntime, type ScramjetFrame } from '@/lib/proxy-client';
import { useCustomization } from '@/components/customization/CustomizationProvider';
import { proxyDiagnosticsEnabled, proxyDiagnostic, safeProxyErrorCode, setProxyWorkerDiagnostics } from '@/lib/proxy-diagnostics';

const shortcuts = [
  ['YouTube', 'https://www.youtube.com/'], ['Bing', 'https://www.bing.com/'],
  ['Wikipedia', 'https://www.wikipedia.org/'], ['GitHub', 'https://github.com/'],
  ['Discord', 'https://discord.com/app'], ['Reddit', 'https://www.reddit.com/'],
  ['Roblox website', 'https://www.roblox.com/'], ['now.gg', 'https://now.gg/'],
];
const HEALTH_TARGETS = ['youtube', 'roblox', 'tiktok'] as const;
type HealthTarget = typeof HEALTH_TARGETS[number];
type BackendCheck = {
  target: HealthTarget;
  clientError?: string;
  dns: { outcome: 'resolved' | 'failed' | 'blocked'; addressCount?: number; durationMs: number; code?: string };
  http: { outcome: 'connected' | 'failed' | 'skipped'; status?: number; durationMs?: number; code?: string };
};
type DiagnosticEvent = { stage: string; status?: number; code?: string; method?: string; requestType?: string; requestId?: number; at: string };
export default function ProxyPage() {
  const { settings, update } = useCustomization();
  const adblockOn = settings.adblock.enabled;
  const iframe = useRef<HTMLIFrameElement>(null);
  const controlledFrame = useRef<ScramjetFrame | null>(null);
  const runtime = useRef<ProxyRuntime | null>(null);
  const [address, setAddress] = useState('');
  const [current, setCurrent] = useState('');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Starting Scramjet…');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [limited, setLimited] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [serviceWorkerState, setServiceWorkerState] = useState('not checked');
  const [backendChecks, setBackendChecks] = useState<Partial<Record<HealthTarget, BackendCheck>>>({});
  const [checkingBackend, setCheckingBackend] = useState(false);
  const [diagnosticEvents, setDiagnosticEvents] = useState<DiagnosticEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback((input: string) => {
    try {
      if (!controlledFrame.current) throw new Error('Wait for the proxy to connect first.');
      const url = normalizeProxyUrl(input);
      setError(''); setLoading(true); setAddress(url); setCurrent(url);
      proxyDiagnostic('navigation.started', { transport: runtime.current?.transport ?? 'scramjet', outcome: 'started' });
      controlledFrame.current.go(url);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        proxyDiagnostic('navigation.timeout', { transport: runtime.current?.transport ?? 'scramjet', outcome: 'timeout', code: 'TimeoutError' });
        setLoading(false); setStatus('Upstream response timed out.');
        setError('No page response after 35 seconds. Check the lounge transport and its outbound internet access, or retry. The destination or your network may be blocking it.');
      }, 35000);
    } catch (cause) {
      proxyDiagnostic('navigation.rejected', { outcome: 'failed', code: safeProxyErrorCode(cause) });
      setError(cause instanceof Error ? cause.message : 'Could not open this address.');
    }
  }, []);

  const runOutboundDiagnostics = useCallback(async () => {
    setCheckingBackend(true);
    const results = await Promise.all(HEALTH_TARGETS.map(async target => {
      try {
        const response = await fetch(`/api/proxy/diagnostics?target=${target}`, {
          cache: 'no-store', signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value = await response.json() as BackendCheck;
        if (value.target !== target || !value.dns || !value.http) throw new Error('Invalid diagnostic response');
        return [target, value] as const;
      } catch (cause) {
        return [target, {
          target, clientError: safeProxyErrorCode(cause),
          dns: { outcome: 'failed' as const, durationMs: 0 },
          http: { outcome: 'skipped' as const },
        }] as const;
      }
    }));
    setBackendChecks(Object.fromEntries(results) as Partial<Record<HealthTarget, BackendCheck>>);
    setCheckingBackend(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const onWorkerDiagnostic = (event: MessageEvent) => {
      const data = event.data;
      const stages = new Set(['request.blocked', 'response.http-error', 'request.failed', 'worker.error', 'worker.unhandled-rejection']);
      if (!data || data.ggLounge !== 'proxy-diagnostic' || data.source !== 'service-worker' || !stages.has(data.stage)) return;
      setDiagnosticEvents(previous => [{
        stage: String(data.stage).slice(0, 64),
        status: Number.isInteger(data.status) ? data.status : undefined,
        code: typeof data.code === 'string' ? data.code : undefined,
        method: typeof data.method === 'string' ? data.method : undefined,
        requestType: typeof data.requestType === 'string' ? data.requestType : undefined,
        requestId: Number.isInteger(data.requestId) ? data.requestId : undefined,
        at: new Date().toLocaleTimeString(),
      }, ...previous].slice(0, 8));
      proxyDiagnostic(data.stage, {
        source: 'service-worker',
        outcome: ['ok', 'failed', 'blocked'].includes(data.outcome) ? data.outcome : undefined,
        transport: ['scramjet', 'wisp', 'http'].includes(data.transport) ? data.transport : undefined,
        status: Number.isInteger(data.status) ? data.status : undefined,
        requestId: Number.isInteger(data.requestId) ? data.requestId : undefined,
        code: typeof data.code === 'string' ? data.code : undefined,
        method: typeof data.method === 'string' ? data.method : undefined,
        requestType: typeof data.requestType === 'string' ? data.requestType : undefined,
      });
      if (data.stage === 'response.http-error' && Number.isInteger(data.status) && data.status >= 500) {
        setError(`The proxy received HTTP ${data.status} before a usable page loaded. This may indicate that the backend cannot reach the destination. Check backend outbound access, or open the original site.`);
      }
    };
    navigator.serviceWorker?.addEventListener('message', onWorkerDiagnostic);
    setReady(false); setError(''); setStatus('Starting Scramjet…');
    bootProxy().then(result => {
      if (cancelled || !iframe.current) return;
      runtime.current = result;
      setServiceWorkerState(result.serviceWorker.state);
      const frame = result.controller.createFrame(iframe.current);
      controlledFrame.current = frame;
      frame.addEventListener('urlchange', event => {
        if (!cancelled) { setAddress(String(event.url)); setCurrent(String(event.url)); }
      });
      setReady(true); setLimited(result.transport === 'http'); setStatus(result.notice);
      const requested = new URLSearchParams(location.search).get('url');
      if (requested) navigate(requested);
    }).catch(cause => {
      proxyDiagnostic('page.boot.failed', { outcome: 'failed', code: safeProxyErrorCode(cause) });
      if (!cancelled) { setServiceWorkerState('failed to activate'); setStatus('Not connected'); setError(cause instanceof Error ? cause.message : 'Proxy startup failed.'); }
    });
    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener('message', onWorkerDiagnostic);
      controlledFrame.current = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [attempt, navigate]);

  useEffect(() => {
    const activeRuntime = runtime.current;
    if (!ready || !activeRuntime) return;
    setProxyWorkerDiagnostics(
      activeRuntime.serviceWorker,
      diagnosticsOpen || proxyDiagnosticsEnabled(),
      activeRuntime.transport,
    );
    return () => {
      setProxyWorkerDiagnostics(activeRuntime.serviceWorker, proxyDiagnosticsEnabled(), activeRuntime.transport);
    };
  }, [diagnosticsOpen, ready]);

  function onLoad() {
    if (!current) return;
    if (timer.current) clearTimeout(timer.current);
    setLoading(false);
    // iframe.onload also fires for HTTP 404/502. Inspect our own error document.
    try {
      const doc = iframe.current?.contentDocument;
      if (doc?.title === 'Proxy connection failed') {
        const detail = doc.body?.innerText?.slice(0, 450);
        if (detail && /failed|error|unreachable/i.test(detail)) {
          proxyDiagnostic('navigation.response-failed', { outcome: 'failed', status: 502, transport: runtime.current?.transport ?? 'scramjet' });
          setError(detail);
        }
      }
    } catch { /* destination isolation prevents inspection; do not call it a failure */ }
    if (runtime.current) setStatus(runtime.current.notice);
  }
  return <main className="proxy-shell" style={{ minHeight: '100dvh' }}>
    <header className="proxy-bar" style={{ flexWrap: 'wrap', height: 'auto', minHeight: 58, padding: '10px 16px' }}>
      <a className="proxy-brand" href="/"><Globe size={17} /> GG-LOUNGE <span>/ SCRAMJET</span></a>
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
      <button
        type="button"
        onClick={() => update(s => ({ ...s, adblock: { ...s.adblock, enabled: !s.adblock.enabled } }))}
        aria-pressed={adblockOn}
        title={adblockOn ? 'Ad blocker is on — ads and trackers are being filtered' : 'Ad blocker is off'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer',
          padding: '5px 10px', borderRadius: 999, fontFamily: 'inherit',
          border: `1px solid ${adblockOn ? 'rgba(215,243,74,.55)' : 'rgba(255,255,255,.16)'}`,
          background: adblockOn ? 'rgba(215,243,74,.12)' : 'transparent',
          color: adblockOn ? '#d7f34a' : '#b5c1cc',
        }}
      >
        {adblockOn ? <ShieldBan size={14} /> : <ShieldOff size={14} />}
        {adblockOn ? 'Ads blocked' : 'Ad blocker off'}
      </button>
      <a href="/apps" style={{ fontSize: 13 }}>Apps</a>
    </header>
    <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 18px', background: 'var(--panel)', color: limited ? '#ffd18b' : '#b5c1cc', fontSize: 12 }}>
      <span>{loading ? 'Loading website through Scramjet…' : status}</span>
      <button type="button" aria-expanded={diagnosticsOpen} onClick={() => setDiagnosticsOpen(open => !open)} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 9px', color: 'inherit', background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
        <Activity size={14} /> {diagnosticsOpen ? 'Hide diagnostics' : 'Diagnostics'}
      </button>
    </div>
    {diagnosticsOpen && <section aria-label="Proxy developer diagnostics" style={{ padding: '14px 18px', background: 'var(--panel)', borderBottom: '1px solid var(--line)', color: 'var(--foreground)', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div><strong>Proxy diagnostics</strong><div style={{ color: 'var(--muted)', marginTop: 3 }}>Fixed unauthenticated probes only. No destination URLs, cookies, headers or response bodies are recorded.</div></div>
        <button type="button" disabled={checkingBackend} onClick={() => void runOutboundDiagnostics()} style={{ border: '1px solid rgba(215,243,74,.5)', borderRadius: 8, padding: '7px 10px', color: 'var(--lime)', background: 'rgba(215,243,74,.08)', cursor: checkingBackend ? 'wait' : 'pointer', font: 'inherit' }}>
          {checkingBackend ? 'Checking destinations…' : 'Test backend outbound access'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8 }}>
        <div><strong>Scramjet</strong><div>{ready ? 'Initialized' : status === 'Not connected' ? 'Initialization failed' : 'Starting'}</div></div>
        <div><strong>Transport</strong><div>{runtime.current?.transport === 'wisp' ? 'Wisp' : runtime.current?.transport === 'http' ? 'Bare HTTP fallback' : 'Not selected'}</div></div>
        <div><strong>Wisp</strong><div>{runtime.current?.wispStatus === 'connected' ? 'Protocol handshake completed' : runtime.current?.wispStatus === 'failed' ? 'Handshake failed; HTTP fallback selected' : runtime.current?.wispStatus === 'not-configured' ? 'WISP_URL is not configured' : 'Not checked'}</div></div>
        <div><strong>Bare v3</strong><div>{ready ? 'Discovery succeeded' : 'Not confirmed'}</div></div>
        <div><strong>Service worker</strong><div>{serviceWorkerState} · scope /browse/</div></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <strong>Backend DNS / TLS / HTTP checks</strong>
        {!Object.keys(backendChecks).length && <div style={{ color: 'var(--muted)', marginTop: 4 }}>Not tested from the deployed Node runtime yet.</div>}
        {HEALTH_TARGETS.map(target => {
          const check = backendChecks[target];
          if (!check) return null;
          const tlsLabel = check.http.outcome === 'connected' ? 'TLS connected' : check.http.code === 'TLS_ERROR' ? 'TLS failed' : check.http.outcome === 'failed' ? 'TLS unverified' : 'not attempted';
          const httpFailure = check.http.code === 'CONNECTION_RESET' ? 'connection reset before an HTTP response'
            : check.http.code === 'CONNECTION_REFUSED' ? 'connection refused before an HTTP response'
              : check.http.code === 'NETWORK_UNREACHABLE' ? 'network route unavailable'
                : check.http.code === 'TIMEOUT' ? 'connection timed out'
                  : check.http.code === 'TLS_ERROR' ? 'TLS handshake failed'
                    : `network error (${check.http.code || 'NETWORK_ERROR'})`;
          const httpLabel = check.http.outcome === 'connected'
            ? `HTTP ${check.http.status}${check.http.status !== undefined && check.http.status >= 300 && check.http.status < 400 ? ' redirect not followed' : ''} · host reached`
            : check.http.outcome === 'failed' ? `no HTTP response · ${httpFailure}` : 'HTTP not attempted';
          return <div key={target} style={{ marginTop: 4 }}><strong style={{ textTransform: 'capitalize' }}>{target}</strong>: {check.clientError ? `diagnostic request failed (${check.clientError})` : `DNS ${check.dns.outcome}${check.dns.code ? ` (${check.dns.code})` : ''} · ${tlsLabel} · ${httpLabel}`}</div>;
        })}
        <div style={{ color: 'var(--muted)', marginTop: 5 }}>An HTTP 403/404 still proves the backend reached the site; it does not mean the site permits browsing or login.</div>
      </div>
      <div style={{ marginTop: 12 }}>
        <strong>Recent proxied request events</strong>
        {!diagnosticEvents.length && <div style={{ color: 'var(--muted)', marginTop: 4 }}>No failures or blocked requests recorded in this page session.</div>}
        <ul style={{ margin: '5px 0 0', paddingLeft: 18 }}>
          {diagnosticEvents.map((entry, index) => <li key={`${entry.at}-${index}`}>
            {entry.at} · {entry.stage}{entry.method ? ` · ${entry.method}` : ''}{entry.requestType ? ` · ${entry.requestType}` : ''}{entry.status !== undefined ? ` · HTTP ${entry.status}` : ''}{entry.code ? ` · ${entry.code}` : ''}
          </li>)}
        </ul>
      </div>
    </section>}
    {error && <div role="alert" style={{ padding: 20, margin: 16, border: '1px solid #ae5960', borderRadius: 12, background: '#2c1920', color: '#ffd4d8' }}>
      <strong>Couldn’t connect</strong><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{error}</p>
      <button className="play-button" onClick={() => ready && current ? navigate(address) : setAttempt(value => value + 1)}>Retry connection</button>
      <p style={{ fontSize: 12 }}>A managed browser may disable service workers or WebSockets. Scramjet cannot remove a destination’s login, CAPTCHA, DRM or cloud-streaming restrictions.</p>
    </div>}
    {!current && <section className="proxy-home">
      <p className="eyebrow">ONE BROWSER · ONE CONNECTION</p><h1>Your apps, together.</h1>
      <p>Self-hosted Scramjet runtime. Every app uses the same launcher and waits for the proxy to be ready.</p>
      <div className="proxy-quick">{shortcuts.map(([name, url]) => <button key={url} disabled={!ready} onClick={() => navigate(url)}>{name}</button>)}</div>
      <p style={{ maxWidth: 620, margin: '24px auto', fontSize: 13 }}>Roblox experiences need the Roblox app or a compatible cloud gaming service. Browsing its website is not the same as running the game. Video and realtime apps need a reachable Wisp backend.</p>
    </section>}
    {current && /(?:roblox\.com|now\.gg)/i.test(current) && <p style={{ margin: 0, padding: '8px 18px', fontSize: 12, color: '#ffd18b' }}>Cloud gaming availability, accounts and WebRTC are controlled by the provider. This launcher does not supply a Roblox game server.</p>}
    <iframe ref={iframe} src="about:blank" title="Scramjet browser" className="proxy-frame" allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write" allowFullScreen onLoad={onLoad} onError={() => { proxyDiagnostic('navigation.iframe-error', { outcome: 'failed', code: 'NetworkError', transport: runtime.current?.transport ?? 'scramjet' }); setLoading(false); setError('The proxied page failed to load.'); }} style={{ display: current ? 'block' : 'none', width: '100%', flex: 1, minHeight: 'calc(100dvh - 108px)', border: 0, background: 'white' }} />
    {current && <a href={current} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, padding: '6px 18px' }}><ExternalLink size={12} style={{ display: 'inline' }} /> Open original site outside the proxy</a>}
  </main>;
}
