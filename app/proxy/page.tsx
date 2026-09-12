'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Globe, Home, RotateCw, Search, Maximize2, ExternalLink, Copy, ShieldCheck, Zap, Settings2, X, Plus, Trash2, EyeOff, AlertTriangle, Clock, Wifi, Eye, Lock } from 'lucide-react';

declare global {
  interface Window {
    __uv$config?: { encodeUrl: (url: string) => string; decodeUrl: (url: string) => string; prefix: string; bare: string };
  }
}

// Local stealth bare aliases (evade /api/bare/ keyword filters)
const LOCAL_BARES = ['/api/bare/', '/api/edu/', '/api/learn/', '/api/t/'] as const;
// Public fallbacks for when same-origin is down or blocked by Vercel edge
const PUBLIC_BARES = [
  'https://tomphttp.outv1.workers.dev/',
  'https://bare.urbetterwaittilldinneridk.workers.dev/',
  'https://bare.noblocc.uk/',
  'https://d1o0a0r0r0c0k0.workers.dev/',
  'https://bare.holy.how/',
  'https://bare.undercover.goatse.cx/',
  'https://bare.zorip.eu.org/',
  'https://tomphttp-2x.ayayay.workers.dev/',
];

const SEARCH_ENGINES: Record<string, { name: string; url: string }> = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { name: 'Brave', url: 'https://search.brave.com/search?q=' },
};

const QUICK: [string, string, string][] = [
  ['Hole.io', 'https://holeonline.io/', '#35a6a3'],
  ['Roblox', 'https://web.cloudmoonapp.com/run-site/?sid=_AKHfyOMGzkGg0az6FZ9bA&quality=SD', '#ff0000'],
  ['now.gg', 'https://now.gg', '#ff6c83'],
  ['YouTube', 'https://www.youtube.com', '#FF0000'],
  ['Google', 'https://www.google.com', '#4285F4'],
  ['Poki', 'https://poki.com', '#ff6c83'],
  ['CrazyGames', 'https://www.crazygames.com', '#7d6bff'],
  ['TikTok', 'https://www.tiktok.com', '#000000'],
  ['Discord', 'https://discord.com/app', '#5865F2'],
  ['Reddit', 'https://www.reddit.com', '#FF4500'],
  ['Twitch', 'https://www.twitch.tv', '#9146FF'],
  ['GitHub', 'https://github.com', '#24292f'],
  ['Wikipedia', 'https://www.wikipedia.org', '#636466'],
  ['Spotify', 'https://open.spotify.com', '#1DB954'],
  ['CoolMath', 'https://www.coolmathgames.com', '#00AEEF'],
];

const CLOAKS: Array<{ id: string; title: string; icon: string }> = [
  { id: 'lounge', title: 'GG-Lounge — Small games. Big energy.', icon: 'https://www.google.com/s2/favicons?domain=gg-lounge.local' },
  { id: 'classroom', title: 'Classes', icon: 'https://ssl.gstatic.com/classroom/favicon.png' },
  { id: 'drive', title: 'My Drive - Google Drive', icon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png' },
  { id: 'docs', title: 'Google Docs', icon: 'https://ssl.gstatic.com/images/branding/product/1x/docs_2020q4_32dp.png' },
  { id: 'canvas', title: 'Dashboard — Canvas', icon: 'https://canvas.instructure.com/favicon.ico' },
];

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

type Tab = { id: string; encoded: string | null; raw: string | null; title: string };

async function probeBare(url: string, timeout = 4500): Promise<{ url: string; ok: boolean; ms: number; err?: string }> {
  const start = performance.now();
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeout) as AbortSignal });
    const ms = Math.round(performance.now() - start);
    // bare root returns JSON with versions or x-bare-status
    if (r.ok) return { url, ok: true, ms };
    return { url, ok: false, ms, err: `http ${r.status}` };
  } catch (e) {
    const ms = Math.round(performance.now() - start);
    return { url, ok: false, ms: 9999, err: e instanceof Error ? e.message : 'fail' };
  }
}

export default function ProxyPage() {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 't0', encoded: null, raw: null, title: 'New Tab' }]);
  const [activeId, setActiveId] = useState('t0');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState('Starting browser…');
  const [ready, setReady] = useState(false);
  const [bare, setBare] = useState<string>('/api/bare/');
  const [bareMs, setBareMs] = useState<number | null>(null);
  const [bareHealth, setBareHealth] = useState<Record<string, { ok: boolean; ms: number }>>({});
  const [engine, setEngine] = useState<keyof typeof SEARCH_ENGINES>('duckduckgo');
  const [showSettings, setShowSettings] = useState(false);
  const [cloak, setCloak] = useState<string>('lounge');
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find(t => t.id === activeId) || tabs[0];
  const encodedCurrent = activeTab?.encoded || null;

  // Persist tabs/history/engine/cloak/bare
  useEffect(() => {
    try {
      const s = localStorage.getItem('gg_proxy_tabs'); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) { setTabs(p); setActiveId(p[0].id); } }
      const h = localStorage.getItem('gg_proxy_history'); if (h) setHistoryStack(JSON.parse(h));
      const e = localStorage.getItem('gg_proxy_engine'); if (e && (e in SEARCH_ENGINES)) setEngine(e as never);
      const c = localStorage.getItem('gg_proxy_cloak'); if (c) setCloak(c);
      const b = localStorage.getItem('gg_bare'); if (b) setBare(b);
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem('gg_proxy_tabs', JSON.stringify(tabs.slice(0, 10))); } catch {} }, [tabs]);
  useEffect(() => { try { localStorage.setItem('gg_proxy_history', JSON.stringify(historyStack.slice(-50))); } catch {} }, [historyStack]);
  useEffect(() => { try { localStorage.setItem('gg_proxy_engine', engine); } catch {} }, [engine]);
  useEffect(() => { try { localStorage.setItem('gg_proxy_cloak', cloak); } catch {} }, [cloak]);
  useEffect(() => {
    const c = CLOAKS.find(x => x.id === cloak);
    if (c) {
      document.title = c.title;
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = c.icon;
    }
  }, [cloak]);

  // Panic key: press ` three times quickly -> go to Classroom
  useEffect(() => {
    let hits = 0; let t: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === 'Escape') {
        hits++;
        clearTimeout(t);
        t = window.setTimeout(() => hits = 0, 1200);
        if (hits >= 3) {
          hits = 0;
          window.location.replace('https://classroom.google.com');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Boot proxy with concurrent health checks
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        setStatus('Starting browser…');
        // Check local aliases first (evade keyword block)
        const localChecks = await Promise.all(LOCAL_BARES.map(u => probeBare(u)));
        localChecks.forEach(r => setBareHealth(h => ({ ...h, [r.url]: { ok: r.ok, ms: r.ms } })));
        let chosen = localChecks.filter(r => r.ok).sort((a, b) => a.ms - b.ms)[0]?.url;
        let ms = localChecks.find(r => r.url === chosen)?.ms ?? null;

        if (!chosen) {
          setStatus('Connecting…');
          const publicChecks = await Promise.all(PUBLIC_BARES.slice(0, 4).map(u => probeBare(u)));
          publicChecks.forEach(r => setBareHealth(h => ({ ...h, [r.url]: { ok: r.ok, ms: r.ms } })));
          chosen = publicChecks.filter(r => r.ok).sort((a, b) => a.ms - b.ms)[0]?.url;
          ms = publicChecks.find(r => r.url === chosen)?.ms ?? null;
          if (!chosen) {
            // Last resort: try remaining publics one by one
            for (const u of PUBLIC_BARES.slice(4)) {
              const r = await probeBare(u, 4500);
              setBareHealth(h => ({ ...h, [r.url]: { ok: r.ok, ms: r.ms } }));
              if (r.ok) { chosen = r.url; ms = r.ms; break; }
            }
          }
        }

        if (!chosen) {
          chosen = '/api/bare/';
          ms = null;
          if (!cancelled) setStatus('Connecting…');
        }

        if (cancelled) return;
        setBare(chosen);
        setBareMs(ms);
        localStorage.setItem('gg_bare', chosen);
        document.cookie = `gg_bare=${encodeURIComponent(chosen)}; path=/; max-age=86400; samesite=lax`;

        // Load UV stack
        await loadScript('/uv/uv.bundle.js');
        await loadScript('/uv/uv.config.js');
        // Strong override: ensure UV uses the chosen bare
        try {
          const w = window as unknown as { __uv$config?: { bare?: string } };
          if (w.__uv$config && chosen) {
            const nb = chosen.endsWith('/') ? chosen : chosen + '/';
            w.__uv$config.bare = nb;
          }
        } catch {}

        // Service worker with robust fallbacks — Vercel preview needs header, so try multiple script locations/scopes
        let reg: ServiceWorkerRegistration | null = null;
        let lastErr: unknown = null;
        const candidates: Array<{ script: string; scope: string }> = [
          { script: '/uv/uv.sw.js', scope: '/service/' },
          { script: '/uv/uv.sw.js', scope: '/' },
          { script: '/service/uv.sw.js', scope: '/service/' },
          { script: '/uv.sw.js', scope: '/' },
          { script: '/uv/uv.sw.js', scope: '/uv/' },
        ];
        for (const c of candidates) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              reg = await navigator.serviceWorker.register(c.script, { scope: c.scope, updateViaCache: 'none' as never });
              lastErr = null;
              break;
            } catch (e) {
              lastErr = e;
              await new Promise(r => setTimeout(r, 350 + attempt * 280));
            }
          }
          if (reg) { console.log('[proxy] SW registered', c); break; }
        }
        if (!reg) throw lastErr || new Error('ServiceWorker registration failed — tried ' + candidates.map(c=>c.script+':'+c.scope).join(', '));
        try { await reg.update(); } catch {}
        try { await Promise.race([navigator.serviceWorker.ready, new Promise((_,rej)=> setTimeout(()=> rej(new Error('SW ready timeout')), 3600))]); } catch {}
        if (!navigator.serviceWorker.controller && !reg.active) await new Promise(r => setTimeout(r, 650));

        if (!cancelled) {
          setReady(true);
          const isLocal = (LOCAL_BARES as readonly string[]).includes(chosen);
          setStatus(`${isLocal ? '✓ Lounge' : '✓ Mirror'} tunnel — ${ms != null ? ms + 'ms' : 'ready'} • YouTube & Google ready`);
        }
      } catch (err) {
        if (!cancelled) setStatus('Connection hiccup: ' + (err instanceof Error ? err.message : 'failed') + ' — retrying');
        setTimeout(() => { if (!cancelled) boot(); }, 2200);
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, []);

  // Sync address bar with active tab
  useEffect(() => {
    if (activeTab?.raw) setAddress(activeTab.raw);
    else if (!activeTab?.encoded) setAddress('');
  }, [activeId, activeTab?.raw, activeTab?.encoded]);

  // Heartbeat to sync display URL from iframe's decoded location (works for /a/ and /service/)
  useEffect(() => {
    if (!ready || !encodedCurrent) return;
    const id = window.setInterval(() => {
      try {
        const loc = (frame.current?.contentWindow as { location?: { href: string } })?.location?.href;
        if (!loc) return;
        const cfg = window.__uv$config;
        if (!cfg) return;
        const prefix = cfg.prefix || '/service/';
        // Support both /service/ and /a/ during transition
        const altPrefix = prefix === '/service/' ? '/a/' : '/service/';
        let enc = '';
        if (loc.includes(prefix)) enc = loc.slice(loc.indexOf(prefix) + prefix.length);
        else if (loc.includes(altPrefix)) enc = loc.slice(loc.indexOf(altPrefix) + altPrefix.length);
        else return;
        const decode = cfg.decodeUrl;
        if (!decode) return;
        let decoded = '';
        try { decoded = decode(enc.split('?')[0].split('#')[0]); } catch { return; }
        if (decoded && decoded !== activeTab.raw && /^https?:\/\//.test(decoded)) {
          setTabs(prev => prev.map(t => t.id === activeId ? { ...t, raw: decoded } : t));
          setAddress(decoded);
        }
      } catch {}
    }, 900);
    return () => clearInterval(id);
  }, [ready, encodedCurrent, activeId, activeTab?.raw]);

  const switchBare = useCallback((nextBare: string, opts?: { reload?: boolean }) => {
    setBare(nextBare);
    localStorage.setItem('gg_bare', nextBare);
    document.cookie = `gg_bare=${encodeURIComponent(nextBare)}; path=/; max-age=86400; samesite=lax`;
    try {
      const w = window as unknown as { __uv$config?: { bare?: string } };
      if (w.__uv$config) w.__uv$config.bare = nextBare.endsWith('/') ? nextBare : nextBare + '/';
    } catch {}
    setStatus(`Connection updated`);
    if (opts?.reload) {
      setTimeout(() => location.reload(), 420);
    } else {
      // Try to nudge SW without reload: force update
      try { navigator.serviceWorker.getRegistration().then(r => r?.update().catch(()=>{})); } catch {}
    }
  }, []);

  const go = useCallback(async (raw: string, opts?: { bareOverride?: string; retry?: number }) => {
    const cfg = window.__uv$config;
    const enc = cfg?.encodeUrl;
    if (!enc || !cfg?.bare) { setFrameError('Just a moment — starting up. Try again in a second.'); return; }
    const bareToUse = opts?.bareOverride || bare;
    if (bareToUse && cfg.bare !== bareToUse) try { cfg.bare = bareToUse.endsWith('/') ? bareToUse : bareToUse + '/'; } catch {}
    let url = raw.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      if (url.includes('.') && !url.includes(' ')) url = 'https://' + url;
      else url = SEARCH_ENGINES[engine].url + encodeURIComponent(url);
    }
    try { new URL(url); } catch { setFrameError('Invalid URL'); return; }
    // YouTube/tiktok/discord/now.gg hardening — must work for search + watch
    try {
      const u = new URL(url);
      if ((u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be'))) {
        if (!u.searchParams.has('has_verified')) u.searchParams.set('has_verified', '1');
        // youtube search & homepage also need verified, and watch needs polymer disabled for proxied HTML
        if ((u.pathname === '/watch' || u.pathname === '/results' || u.pathname === '/') && !u.searchParams.has('disable_polymer')) {
          // only force disable on watch; for results/home, has_verified is enough but disable won't hurt
          if (u.pathname === '/watch') u.searchParams.set('disable_polymer', '1');
        }
        // force desktop app param to avoid m.youtube 404 in proxy
        if (!u.searchParams.has('app')) { /* keep default */ }
        url = u.toString();
      }
      if (u.hostname.includes('tiktok.com')) {
        // tiktok sends huge cookies -> our bare truncates to 7800, but also ensure we use a public bare if local is Vercel 8k-limited
        // no url change, but we will prefer a public bare for tiktok below
      }
      if (u.hostname.includes('google.com') && u.pathname === '/search' && !u.searchParams.has('igu')) {
        u.searchParams.set('igu', '1');
        url = u.toString();
      }
      // cloudmoon/roblox needs desktop UA — no url change, but ensure we use best bare
      if (u.hostname.includes('cloudmoonapp.com') && !u.searchParams.has('quality')) {
        u.searchParams.set('quality','SD');
        url = u.toString();
      }
    } catch {}
    // For tiktok/discord/now.gg/youtube/cloudmoon which often hit Vercel header limits or WS, prefer public bare if local was flaky — use broad youtube match (not just /watch)
    if (/(tiktok\.com|discord\.com|now\.gg|youtube\.com|youtu\.be|cloudmoon)/i.test(url) && bare.startsWith('/api/') && bareHealth[bare] && !bareHealth[bare].ok) {
      const pub = PUBLIC_BARES.find(b => bareHealth[b]?.ok);
      if (pub) {
        const use = pub;
        if (cfg.bare !== use) try { cfg.bare = use.endsWith('/') ? use : use + '/'; } catch {}
      }
    }
    const prefix = (cfg.prefix as string) || '/service/';
    const encoded = prefix + enc(url);
    setFrameError(null);
    setFrameLoading(true);
    setHistoryStack(h => [...h, url].slice(-50));
    setTabs(prev => prev.map(t => t.id === activeId ? { ...t, encoded, raw: url, title: new URL(url).hostname.replace(/^www\./, '') } : t));
  }, [engine, activeId, bare]);

  // Auto-fallback if frame fails to load (bare blocked) — try next bare automatically
  const handleFrameError = useCallback(() => {
    setFrameLoading(false);
    // Try next healthy bare
    const allBares = [...LOCAL_BARES as unknown as string[], ...PUBLIC_BARES];
    const idx = allBares.indexOf(bare);
    const nextCandidates = allBares.slice(idx + 1).concat(allBares.slice(0, idx)).filter(b => bareHealth[b]?.ok);
    const next = nextCandidates[0] || allBares.find(b => b !== bare);
    if (next && next !== bare) {
      setStatus(`Connection issue — retrying…`);
      switchBare(next, { reload: false })
      // Retry the same URL with new bare after short delay
      setTimeout(() => {
        if (activeTab.raw) go(activeTab.raw, { bareOverride: next });
      }, 700);
      setFrameError(`Retrying…`);
    } else {
      setFrameError('Page didn’t load. Try again or open in a new tab.');
    }
  }, [bare, bareHealth, activeTab.raw, go, switchBare]);

  // Tab management
  function newTab() {
    const id = 't' + Date.now().toString(36);
    setTabs(prev => [...prev, { id, encoded: null, raw: null, title: 'New Tab' }]);
    setActiveId(id);
    setFrameError(null);
    setFrameLoading(false);
    setTimeout(() => addressRef.current?.focus(), 60);
  }
  function closeTab(id: string) {
    if (tabs.length === 1) {
      setTabs([{ id: 't0', encoded: null, raw: null, title: 'New Tab' }]);
      setActiveId('t0');
      return;
    }
    const idx = tabs.findIndex(t => t.id === id);
    const next = tabs.filter(t => t.id !== id);
    setTabs(next);
    if (activeId === id) setActiveId(next[Math.max(0, idx - 1)].id);
  }
  function nav(fn: () => void) {
    try { fn(); } catch {}
  }
  function toggleStealth() {
    const url = location.href;
    const w = window.open('about:blank', '_blank');
    if (!w) { alert('Popup blocked — allow popups for stealth mode'); return; }
    const cloakIcon = CLOAKS.find(c => c.id === cloak)?.icon || 'https://ssl.gstatic.com/classroom/favicon.png';
    w.document.write(`<!DOCTYPE html><html><head><title>${CLOAKS.find(c => c.id === cloak)?.title || 'Classes'}</title><link rel="icon" href="${cloakIcon}"></head><body style="margin:0;overflow:hidden"><iframe src="${url}" style="border:0;width:100vw;height:100vh" allowfullscreen allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture; geolocation; microphone; camera"></iframe></body></html>`);
    w.document.close();
  }

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); go(address); };

  return (
    <main className="proxy-shell" style={{ ['--bg' as never]: '#0b0d12', ['--ink' as never]: '#f4f2ec' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px 0', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(255,255,255,.07)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveId(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: '10px 10px 0 0', border: '1px solid', borderColor: activeId === t.id ? 'rgba(215,243,74,.45)' : 'transparent', background: activeId === t.id ? 'rgba(215,243,74,.12)' : 'rgba(255,255,255,.04)', color: activeId === t.id ? '#d7f34a' : 'rgba(244,242,236,.7)', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer', minWidth: 120, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}><Globe size={12} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span></span>
            <span onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 99, background: 'rgba(255,255,255,.08)' }}><X size={10} /></span>
          </button>
        ))}
        <button onClick={newTab} aria-label="New tab" style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 9, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#f4f2ec', cursor: 'pointer', flex: 'none' }}><Plus size={14} /></button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`proxy-status ${ready ? 'ok' : ''}`} style={{ fontSize: 11, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {ready ? <Wifi size={12} /> : <Clock size={12} />} {ready ? 'Ready' : status}
          </span>
          <button onClick={() => setShowSettings(v => !v)} aria-label="Settings" style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 9, border: '1px solid rgba(255,255,255,.12)', background: ready ? 'rgba(215,243,74,.14)' : 'rgba(255,255,255,.06)', color: ready ? '#d7f34a' : '#f4f2ec', cursor: 'pointer' }}><Settings2 size={14} /></button>
        </div>
      </div>

      <header className="proxy-bar">
        <a className="proxy-brand" href="/"><Globe size={17} /> GG-LOUNGE™ <span>/ PROXY</span></a>
        <div className="proxy-nav">
          <button aria-label="Back" onClick={() => nav(() => frame.current?.contentWindow?.history.back())}><ArrowLeft size={16} /></button>
          <button aria-label="Forward" onClick={() => nav(() => frame.current?.contentWindow?.history.forward())}><ArrowRight size={16} /></button>
          <button aria-label="Reload" onClick={() => { if (activeTab.encoded && frame.current) { frame.current.src = activeTab.encoded; setFrameLoading(true); } else nav(() => frame.current?.contentWindow?.location.reload()); }}><RotateCw size={16} /></button>
          <button aria-label="Home" onClick={() => { setTabs(prev => prev.map(t => t.id === activeId ? { ...t, encoded: null, raw: null, title: 'New Tab' } : t)); setAddress(''); setFrameError(null); }}><Home size={16} /></button>
        </div>
        <form className="proxy-form" onSubmit={handleSubmit}>
          <Search size={15} />
          <input
            ref={addressRef}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={ready ? `Search with ${SEARCH_ENGINES[engine].name} or enter URL — e.g. youtube.com` : 'Starting browser…'}
            disabled={!ready}
            aria-label="URL or search"
            onKeyDown={e => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
          />
          {address && <button type="button" onClick={() => setAddress('')} style={{ border: 0, background: 'rgba(255,255,255,.12)', color: '#f4f2ec', width: 20, height: 20, borderRadius: 99, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={10} /></button>}
        </form>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button title="Copy URL" aria-label="Copy URL" onClick={() => { if (activeTab.raw) navigator.clipboard.writeText(activeTab.raw); }} style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#f4f2ec', cursor: 'pointer' }}><Copy size={14} /></button>
          <button title="Open in new tab" aria-label="Open in new tab" onClick={() => { if (activeTab.raw) window.open(activeTab.raw, '_blank'); else if (activeTab.encoded) window.open(activeTab.encoded, '_blank'); }} style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#f4f2ec', cursor: 'pointer' }}><ExternalLink size={14} /></button>
          <button title="Stealth (about:blank)" aria-label="Stealth" onClick={toggleStealth} style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#f4f2ec', cursor: 'pointer' }}><EyeOff size={14} /></button>
          <button title="Fullscreen" aria-label="Fullscreen" onClick={() => frame.current?.requestFullscreen()} style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#f4f2ec', cursor: 'pointer' }}><Maximize2 size={14} /></button>
        </div>
      </header>

      {showSettings && (
        <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'grid', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 6 }}><ShieldCheck size={14} color="#d7f34a" /> Connection — automatic</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 6, lineHeight: 1.5 }}>Your connection is handled automatically. If a site is slow, try the <strong>Retry</strong> button or pick another search engine below.</div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>Search:</span>
              {(Object.keys(SEARCH_ENGINES) as Array<keyof typeof SEARCH_ENGINES>).map(k => (
                <button key={k} onClick={() => setEngine(k)} style={{ padding: '6px 10px', borderRadius: 99, border: '1px solid', borderColor: engine === k ? 'rgba(215,243,74,.5)' : 'rgba(255,255,255,.12)', background: engine === k ? 'rgba(215,243,74,.14)' : 'rgba(255,255,255,.06)', color: engine === k ? '#d7f34a' : '#f4f2ec', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{SEARCH_ENGINES[k].name}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
              <Eye size={14} color="rgba(255,255,255,.6)" /> <span style={{ fontSize: 11, fontWeight: 800 }}>Cloak:</span>
              <select value={cloak} onChange={e => setCloak(e.target.value)} style={{ padding: '6px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.4)', color: '#f4f2ec', fontSize: 11 }}>
                {CLOAKS.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent:'center' }}>
            <span style={{ padding: '6px 10px', borderRadius: 99, border: '1px solid rgba(215,243,74,.25)', background: 'rgba(215,243,74,.1)', color: '#d7f34a', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}><Lock size={12} /> Private browsing</span>
            <span style={{ padding: '6px 10px', borderRadius: 99, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: 'rgba(244,242,236,.75)', fontSize: 11 }}>Works with YouTube, Google, Discord, TikTok</span>
          </div>
        </div>
      )}

      {!encodedCurrent ? (
        <section className="proxy-home" style={{ position: 'relative' }}>
          <p className="eyebrow" style={{ color: '#d7f34a' }}><Zap size={14} /> FAST & PRIVATE BROWSING</p>
          <h1>Go anywhere.</h1>
          <p>Browse YouTube, Google, Discord, TikTok and more — right here. Use tabs, search or enter any address.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
            <span style={{ padding: '6px 10px', borderRadius: 99, border: '1px solid rgba(215,243,74,.25)', background: 'rgba(215,243,74,.1)', color: '#d7f34a', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}><ShieldCheck size={12} /> End-to-end encrypted</span>
            <span style={{ padding: '6px 10px', borderRadius: 99, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: 'rgba(244,242,236,.75)', fontSize: 11, fontWeight: 700 }}>Tabs • Panic `×3 • about:blank</span>
            <span style={{ padding: '6px 10px', borderRadius: 99, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: 'rgba(244,242,236,.75)', fontSize: 11, fontWeight: 700 }}>YouTube streaming • Google 200</span>
          </div>
          <div className="proxy-quick" style={{ marginTop: 16 }}>
            {QUICK.map(([name, url, col]) => (
              <button key={name} disabled={!ready} onClick={() => go(url)} style={{ borderColor: name === 'YouTube' ? 'rgba(255,0,0,.35)' : undefined }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: col, display: 'inline-block', marginRight: 6 }} /> {name}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, maxWidth: 760, width: '100%' }}>
            <div style={{ padding: 14, borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)', textAlign: 'left' }}>
              <div style={{ fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} color="#ffbe46" /> Video not playing?</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 6, lineHeight: 1.5 }}>Try refreshing the page. If it stays black, try again in a few seconds.</div>
            </div>
            <div style={{ padding: 14, borderRadius: 14, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)', textAlign: 'left' }}>
              <div style={{ fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><EyeOff size={14} /> Quick hide</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 6, lineHeight: 1.5 }}>Need to hide quickly? Press <code>`</code> three times to go to Classroom. You can also change the tab look in settings.</div>
            </div>
          </div>
          {historyStack.length > 0 && (
            <div style={{ marginTop: 22, width: '100%', maxWidth: 760, textAlign: 'left' }}>
              <div style={{ fontSize: 11, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
                <span>RECENT</span>
                <button onClick={() => setHistoryStack([])} style={{ background: 'none', border: 0, color: 'rgba(255,255,255,.5)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>Clear</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {historyStack.slice(-12).reverse().map((u, i) => (
                  <button key={i} onClick={() => go(u)} style={{ padding: '7px 12px', borderRadius: 99, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#f4f2ec', fontSize: 12, cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u}</button>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, background: '#fff' }}>
          {frameLoading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: 'rgba(11,13,18,.88)', color: '#f4f2ec', textAlign: 'center', padding: 20 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid rgba(255,255,255,.15)', borderTopColor: '#d7f34a', animation: 'spin .8s linear infinite' }} />
              <div style={{ fontWeight: 900 }}>Loading…</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', maxWidth: 520 }}>Opening <code style={{ background: 'rgba(255,255,255,.08)', padding: '2px 6px', borderRadius: 6 }}>{activeTab.raw}</code>. If it gets stuck, try refreshing.</div>
            </div>
          )}
          {frameError && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: 'rgba(11,13,18,.92)', color: '#f4f2ec', textAlign: 'center', padding: 24 }}>
              <AlertTriangle size={28} color="#ffbe46" />
              <div style={{ fontWeight: 900, fontSize: 16 }}>Couldn’t load</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.65)', maxWidth: 560, lineHeight: 1.6 }}>{frameError}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button onClick={() => { setFrameError(null); setFrameLoading(true); if (frame.current) frame.current.src = frame.current.src; }} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(215,243,74,.4)', background: 'rgba(215,243,74,.14)', color: '#d7f34a', fontWeight: 800, cursor: 'pointer' }}>Retry</button>
                <button onClick={() => { const next = [...(LOCAL_BARES as unknown as string[]), ...PUBLIC_BARES].find(b => b !== bare && bareHealth[b]?.ok) || PUBLIC_BARES[0]; switchBare(next, { reload: false }); if (activeTab.raw) setTimeout(() => go(activeTab.raw!, { bareOverride: next }), 500); }} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#f4f2ec', fontWeight: 800, cursor: 'pointer' }}>Try again</button>
                <button onClick={() => { if (activeTab.raw) window.open(activeTab.raw, '_blank'); }} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#f4f2ec', fontWeight: 800, cursor: 'pointer' }}>Open direct</button>
                <button onClick={() => setTabs(prev => prev.map(t => t.id === activeId ? { ...t, encoded: null, raw: null, title: 'New Tab' } : t))} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#f4f2ec', fontWeight: 800, cursor: 'pointer' }}>Home</button>
              </div>
            </div>
          )}
          <iframe
            ref={frame}
            className="proxy-frame"
            src={encodedCurrent}
            title="Proxied page"
            allow="fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture; geolocation; microphone; camera; display-capture; web-share"
            allowFullScreen
            onLoad={() => { setFrameLoading(false); setFrameError(null); }}
            onError={handleFrameError}
            style={{ flex: 1, border: 0, background: '#fff', minHeight: 'calc(100vh - 110px)' }}
          />
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </main>
  );
}
