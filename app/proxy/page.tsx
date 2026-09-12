'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Globe, Home, RotateCw, Search, Maximize2, ExternalLink, Copy, ShieldCheck, Zap, X, AlertTriangle, Clock, Wifi } from 'lucide-react';

declare global {
  interface Window {
    __uv$config?: { encodeUrl: (url: string) => string; decodeUrl: (url: string) => string; prefix: string; bare: string };
  }
}

// Smart automatic bare — user never picks, we rotate invisibly
const LOCAL_BARES = ['/api/bare/', '/api/edu/', '/api/learn/', '/api/t/'] as const;
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

// BING ONLY — smart automatic search. No chooser, no confusing options.
const BING_URL = 'https://www.bing.com/search?q=';

const QUICK: [string, string, string][] = [
  ['YouTube', '/games/youtube/index.html', '#FF0000'],
  ['Hole.io', 'https://holeonline.io/', '#35a6a3'],
  ['Roblox', 'https://web.cloudmoonapp.com/run-site/?sid=_AKHfyOMGzkGg0az6FZ9bA&quality=SD', '#ff0000'],
  ['now.gg', 'https://now.gg', '#ff6c83'],
  ['Bing', 'https://www.bing.com', '#00809D'],
  ['Poki', 'https://poki.com', '#ff6c83'],
  ['CrazyGames', 'https://www.crazygames.com', '#7d6bff'],
  ['TikTok', 'https://m.tiktok.com', '#000000'],
  ['Discord', 'https://discord.com/app', '#5865F2'],
  ['Reddit', 'https://www.reddit.com', '#FF4500'],
  ['Twitch', 'https://www.twitch.tv', '#9146FF'],
  ['GitHub', 'https://github.com', '#24292f'],
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

async function probeBare(url: string, timeout = 4000): Promise<{ url: string; ok: boolean; ms: number }> {
  const start = performance.now();
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeout) as any });
    const ms = Math.round(performance.now() - start);
    if (r.ok) return { url, ok: true, ms };
    return { url, ok: false, ms };
  } catch {
    const ms = Math.round(performance.now() - start);
    return { url, ok: false, ms: 9999 };
  }
}

export default function ProxyPage() {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 't0', encoded: null, raw: null, title: 'New Tab' }]);
  const [activeId, setActiveId] = useState('t0');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState('Starting browser…');
  const [ready, setReady] = useState(false);
  const [bare, setBare] = useState<string>('/api/bare/');
  const [bareHealth, setBareHealth] = useState<Record<string, { ok: boolean; ms: number }>>({});
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find(t => t.id === activeId) || tabs[0];
  const encodedCurrent = activeTab?.encoded || null;

  // Minimal persist — only bare + history, no engine/cloak complexity
  useEffect(() => {
    try {
      const h = localStorage.getItem('gg_proxy_history_v2'); if (h) setHistoryStack(JSON.parse(h));
      const b = localStorage.getItem('gg_bare'); if (b) setBare(b);
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem('gg_proxy_history_v2', JSON.stringify(historyStack.slice(-40))); } catch {} }, [historyStack]);

  // Panic key — keep it simple, invisible, no UI
  useEffect(() => {
    let hits = 0; let t: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`') {
        hits++; clearTimeout(t); t = window.setTimeout(() => hits = 0, 1200);
        if (hits >= 3) { hits = 0; window.location.replace('https://classroom.google.com'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Boot — smart automatic, no UI spam. Cached 5min, then silent probe.
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        setStatus('Starting browser…');
        try {
          const cached = JSON.parse(localStorage.getItem('gg_bare_cache') || 'null')
          if (cached && cached.url && cached.exp > Date.now()) {
            const r = await probeBare(cached.url, 2200)
            if (r.ok) {
              if (cancelled) return
              setBare(cached.url); setBareHealth(h=> ({...h, [cached.url]:{ok:true,ms:r.ms}}))
              localStorage.setItem('gg_bare', cached.url)
              document.cookie = `gg_bare=${encodeURIComponent(cached.url)}; path=/; max-age=86400; samesite=lax`
              await loadScript('/uv/uv.bundle.js'); await loadScript('/uv/uv.config.js');
              try { const w = window as any; if (w.__uv$config && cached.url) w.__uv$config.bare = cached.url.endsWith('/') ? cached.url : cached.url + '/'; } catch {}
              try { if (navigator.serviceWorker.controller) { if (!cancelled){ setReady(true); setStatus('Ready'); } return } } catch {}
            }
          }
        } catch {}
        // GOD LEVEL: probe with blacklist for 10min if bare failed last time, and sort by ms
        const blacklist: Record<string, number> = (()=>{ try{ return JSON.parse(localStorage.getItem('gg_bare_blacklist')||'{}')}catch{return{}} })()
        const isBlacklisted = (u:string)=> blacklist[u] && blacklist[u] > Date.now()
        const localCandidates = LOCAL_BARES.filter(u=> !isBlacklisted(u)).slice(0,3)
        const localChecks = await Promise.all((localCandidates.length?localCandidates: [...LOCAL_BARES].slice(0,2)).map(u => probeBare(u, 3000)));
        localChecks.forEach(r => { setBareHealth(h => ({ ...h, [r.url]: { ok: r.ok, ms: r.ms } })); if(!r.ok){ blacklist[r.url]=Date.now()+10*60*1000; try{ localStorage.setItem('gg_bare_blacklist', JSON.stringify(blacklist)) }catch{} } });
        let chosen = localChecks.filter(r => r.ok).sort((a, b) => a.ms - b.ms)[0]?.url;
        let ms = localChecks.find(r => r.url === chosen)?.ms ?? null;
        if (!chosen) {
          setStatus('Connecting…');
          const pubCandidates = PUBLIC_BARES.filter(u=> !isBlacklisted(u)).slice(0,3)
          const publicChecks = await Promise.all((pubCandidates.length?pubCandidates:PUBLIC_BARES.slice(0, 2)).map(u => probeBare(u, 3000)));
          publicChecks.forEach(r => { setBareHealth(h => ({ ...h, [r.url]: { ok: r.ok, ms: r.ms } })); if(!r.ok){ blacklist[r.url]=Date.now()+10*60*1000; try{ localStorage.setItem('gg_bare_blacklist', JSON.stringify(blacklist)) }catch{} } });
          chosen = publicChecks.filter(r => r.ok).sort((a, b) => a.ms - b.ms)[0]?.url;
          ms = publicChecks.find(r => r.url === chosen)?.ms ?? null;
          if (!chosen) {
            for (const u of [...LOCAL_BARES.slice(2), ...PUBLIC_BARES.slice(2)]) {
              const r = await probeBare(u, 3000);
              setBareHealth(h => ({ ...h, [r.url]: { ok: r.ok, ms: r.ms } }));
              if (r.ok) { chosen = r.url; break; }
            }
          }
        }
        if (!chosen) { chosen = '/api/bare/'; if (!cancelled) setStatus('Connecting…'); }
        if (cancelled) return;
        setBare(chosen);
        localStorage.setItem('gg_bare', chosen);
        try { localStorage.setItem('gg_bare_cache', JSON.stringify({ url: chosen, exp: Date.now()+5*60*1000 })) } catch {}
        document.cookie = `gg_bare=${encodeURIComponent(chosen)}; path=/; max-age=86400; samesite=lax`;
        await loadScript('/uv/uv.bundle.js'); await loadScript('/uv/uv.config.js');
        try { const w = window as any; if (w.__uv$config && chosen) w.__uv$config.bare = chosen.endsWith('/') ? chosen : chosen + '/'; } catch {}
        let reg: ServiceWorkerRegistration | null = null;
        let lastErr: any = null;
        const candidates = [
          { script: '/uv/uv.sw.js', scope: '/service/' },
          { script: '/uv/uv.sw.js', scope: '/' },
          { script: '/service/uv.sw.js', scope: '/service/' },
        ];
        for (const c of candidates) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try { reg = await navigator.serviceWorker.register(c.script, { scope: c.scope } as any); lastErr = null; break; } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 350)); }
          }
          if (reg) break;
        }
        if (!reg) throw lastErr || new Error('SW failed');
        try { await reg.update(); } catch {}
        try { await Promise.race([navigator.serviceWorker.ready, new Promise((_,rej)=> setTimeout(()=> rej(new Error('timeout')), 3600))]); } catch {}
        if (!navigator.serviceWorker.controller && !reg.active) await new Promise(r => setTimeout(r, 650));
        if (!cancelled) { setReady(true); setStatus('Ready'); }
      } catch {
        if (!cancelled) setStatus('Starting…');
        setTimeout(() => { if (!cancelled) boot(); }, 1200);
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (activeTab?.raw) setAddress(activeTab.raw);
    else if (!activeTab?.encoded) setAddress('');
  }, [activeId, activeTab?.raw, activeTab?.encoded]);

  // Sync display URL from iframe — silent
  useEffect(() => {
    if (!ready || !encodedCurrent) return;
    const id = window.setInterval(() => {
      try {
        const loc = (frame.current?.contentWindow as any)?.location?.href;
        if (!loc) return;
        const cfg = window.__uv$config;
        if (!cfg) return;
        const prefix = cfg.prefix || '/service/';
        const altPrefix = prefix === '/service/' ? '/a/' : '/service/';
        let enc = '';
        if (loc.includes(prefix)) enc = loc.slice(loc.indexOf(prefix) + prefix.length);
        else if (loc.includes(altPrefix)) enc = loc.slice(loc.indexOf(altPrefix) + altPrefix.length);
        else return;
        const decode = cfg.decodeUrl; if (!decode) return;
        let decoded = ''; try { decoded = decode(enc.split('?')[0].split('#')[0]); } catch { return; }
        if (decoded && decoded !== activeTab.raw && /^https?:\/\//.test(decoded)) {
          setTabs(prev => prev.map(t => t.id === activeId ? { ...t, raw: decoded } : t));
          setAddress(decoded);
        }
      } catch {}
    }, 900);
    return () => clearInterval(id);
  }, [ready, encodedCurrent, activeId, activeTab?.raw]);

  const switchBare = useCallback((nextBare: string) => {
    setBare(nextBare);
    localStorage.setItem('gg_bare', nextBare);
    document.cookie = `gg_bare=${encodeURIComponent(nextBare)}; path=/; max-age=86400; samesite=lax`;
    try { const w = window as any; if (w.__uv$config) w.__uv$config.bare = nextBare.endsWith('/') ? nextBare : nextBare + '/'; } catch {}
    setStatus(`Retrying…`);
  }, []);

  const go = useCallback(async (raw: string, opts?: { bareOverride?: string }) => {
    const cfg = window.__uv$config; const enc = cfg?.encodeUrl;
    if (!enc || !cfg?.bare) { setFrameError('Starting up — try again in a second.'); return; }
    const bareToUse = opts?.bareOverride || bare;
    if (bareToUse && cfg.bare !== bareToUse) try { cfg.bare = bareToUse.endsWith('/') ? bareToUse : bareToUse + '/'; } catch {}
    let url = raw.trim(); if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      if (url.includes('.') && !url.includes(' ')) url = 'https://' + url;
      else url = BING_URL + encodeURIComponent(url);
    }
    try { new URL(url); } catch { setFrameError('Invalid URL'); return; }
    // Smart automatic: YouTube → native lounge (never vague outlines)
    try {
      const u = new URL(url);
      const isYouTube = u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be') || u.hostname.includes('m.youtube.com');
      if (isYouTube) {
        let vid = u.searchParams.get('v') || '';
        if (!vid && u.hostname === 'youtu.be') vid = u.pathname.slice(1).split('/')[0];
        if (!vid) { const m = u.pathname.match(/\/shorts\/([\w-]{11})/); if (m) vid = m[1]; }
        const q = u.searchParams.get('search_query') || u.searchParams.get('q') || '';
        if (vid && /^[\w-]{11}$/.test(vid)) { window.location.href = `/games/youtube/index.html?v=${encodeURIComponent(vid)}`; return; }
        if (q) { window.location.href = `/games/youtube/index.html?q=${encodeURIComponent(q)}`; return; }
        window.location.href = '/games/youtube/index.html'; return;
      }
      if (u.hostname.includes('tiktok.com') && u.hostname === 'www.tiktok.com') { u.hostname = 'm.tiktok.com'; url = u.toString(); }
      if (u.hostname.includes('cloudmoonapp.com') && !u.searchParams.has('quality')) { u.searchParams.set('quality','SD'); url = u.toString(); }
      // now.gg needs lightweight handling — force https and strip heavy params
      if (u.hostname.includes('now.gg')) { u.protocol = 'https:'; url = u.toString(); }
    } catch {}
    // Smart bare swap for heavy sites if local bare is unhealthy
    if (/(tiktok\.com|discord\.com|now\.gg|youtube\.com|youtu\.be|cloudmoon|roblox\.com)/i.test(url) && bare.startsWith('/api/') && bareHealth[bare] && !bareHealth[bare].ok) {
      const pub = PUBLIC_BARES.find(b => bareHealth[b]?.ok);
      if (pub && cfg.bare !== pub) try { cfg.bare = pub.endsWith('/') ? pub : pub + '/'; } catch {}
    }
    const prefix = (cfg.prefix as string) || '/service/';
    const encoded = prefix + enc(url);
    setFrameError(null); setFrameLoading(true);
    setHistoryStack(h => [...h, url].slice(-40));
    setTabs(prev => prev.map(t => t.id === activeId ? { ...t, encoded, raw: url, title: new URL(url).hostname.replace(/^www\./, '') } : t));
  }, [activeId, bare, bareHealth]);

  const handleFrameError = useCallback(() => {
    setFrameLoading(false);
    const allBares = [...LOCAL_BARES as unknown as string[], ...PUBLIC_BARES];
    const idx = allBares.indexOf(bare);
    const nextCandidates = allBares.slice(idx + 1).concat(allBares.slice(0, idx)).filter(b => bareHealth[b]?.ok);
    const next = nextCandidates[0] || allBares.find(b => b !== bare);
    if (next && next !== bare) {
      switchBare(next);
      setTimeout(() => { if (activeTab.raw) go(activeTab.raw, { bareOverride: next }); }, 700);
      setFrameError(`Retrying…`);
    } else setFrameError('Couldn’t load. Tap Retry.');
  }, [bare, bareHealth, activeTab.raw, go, switchBare]);

  function nav(fn: () => void) { try { fn(); } catch {} }

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); go(address); };

  return (
    <main className="proxy-shell" style={{ ['--bg' as never]: '#0b0d12', ['--ink' as never]: '#f4f2ec', minHeight:'100vh', background:'#0b0d12', color:'#f4f2ec', display:'flex', flexDirection:'column' }}>
      {/* Simple top bar — no tabs, no engine chooser, no cloak UI */}
      <header className="proxy-bar" style={{ position:'sticky', top:0, zIndex:20, display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'rgba(11,13,18,.92)', backdropFilter:'blur(16px)', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
        <a className="proxy-brand" href="/" style={{ display:'flex', alignItems:'center', gap:8, fontWeight:900, letterSpacing:'.02em', textDecoration:'none', color:'#f4f2ec', flex:'none' }}><Globe size={16}/> GG-LOUNGE<span style={{ opacity:.5, fontWeight:700 }}>/ BING</span></a>
        <div className="proxy-nav" style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button aria-label="Back" onClick={() => nav(() => frame.current?.contentWindow?.history.back())} style={sIcon}><ArrowLeft size={16} /></button>
          <button aria-label="Forward" onClick={() => nav(() => frame.current?.contentWindow?.history.forward())} style={sIcon}><ArrowRight size={16} /></button>
          <button aria-label="Reload" onClick={() => { if (activeTab.encoded && frame.current) { frame.current.src = activeTab.encoded; setFrameLoading(true); } else nav(() => frame.current?.contentWindow?.location.reload()); }} style={sIcon}><RotateCw size={16} /></button>
          <button aria-label="Home" onClick={() => { setTabs([{ id:'t0', encoded:null, raw:null, title:'New Tab'}]); setActiveId('t0'); setAddress(''); setFrameError(null); }} style={sIcon}><Home size={16} /></button>
        </div>
        <form className="proxy-form" onSubmit={handleSubmit} style={{ flex:1, display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.10)', borderRadius:999, padding:'6px 12px', minWidth:0 }}>
          <Search size={14} style={{ opacity:.5, flex:'none' }} />
          <input ref={addressRef} value={address} onChange={e => setAddress(e.target.value)} placeholder={ready ? "Search Bing or enter URL — try youtube.com" : 'Starting…'} disabled={!ready} aria-label="Search Bing or enter URL" style={{ flex:1, background:'transparent', border:0, outline:'none', color:'#f4f2ec', fontSize:14, minWidth:0 }} onKeyDown={e => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} />
          {address && <button type="button" onClick={() => setAddress('')} style={{ border:0, background:'rgba(255,255,255,.12)', color:'#f4f2ec', width:20, height:20, borderRadius:99, display:'grid', placeItems:'center', cursor:'pointer', flex:'none' }}><X size={10} /></button>}
        </form>
        <div style={{ display:'flex', gap:6, alignItems:'center', flex:'none' }}>
          <span title={ready ? `Route: ${bare} — ${bareHealth[bare]?.ms ? bareHealth[bare].ms+'ms' : 'auto'}` : status} style={{ fontSize:11, display:'flex', alignItems:'center', gap:6, opacity:.7, whiteSpace:'nowrap', padding:'6px 10px', borderRadius:999, border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.04)' }}>{ready ? <Wifi size={12}/> : <Clock size={12}/>} {ready ? (bareHealth[bare]?.ms ? `Ready • ${bareHealth[bare].ms}ms` : 'Ready') : status}</span>
          <button title="Copy" onClick={() => { if (activeTab.raw) navigator.clipboard.writeText(activeTab.raw); }} style={sIconSmall}><Copy size={12} /></button>
          <button title="Open" onClick={() => { if (activeTab.raw) window.open(activeTab.raw, '_blank'); else if (activeTab.encoded) window.open(activeTab.encoded, '_blank'); }} style={sIconSmall}><ExternalLink size={12} /></button>
          <button title="Fullscreen" onClick={() => frame.current?.requestFullscreen()} style={sIconSmall}><Maximize2 size={12} /></button>
        </div>
      </header>

      {!encodedCurrent ? (
        <section style={{ position:'relative', padding:'42px 24px 60px', maxWidth:1100, margin:'0 auto', width:'100%' }}>
          <div style={{textAlign:'center', maxWidth:700, margin:'0 auto'}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:8, padding:'7px 14px', borderRadius:999, background:'linear-gradient(135deg, rgba(0,128,157,.18), rgba(215,243,74,.14))', border:'1px solid rgba(0,128,157,.25)', fontSize:11, fontWeight:900, letterSpacing:'.06em', color:'#7dd3ff'}}><ShieldCheck size={14}/> BING ONLY • SMART AUTO • NO SETUP</div>
            <h1 style={{fontSize:'clamp(36px,6vw,60px)', lineHeight:.9, margin:'18px 0 12px', fontWeight:900, letterSpacing:'-.03em'}}>Search with <em style={{fontStyle:'italic', background:'linear-gradient(135deg, #00809D, #7d6bff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Bing.</em> Go anywhere.</h1>
            <p style={{fontSize:15, opacity:.65, lineHeight:1.6, maxWidth:560, margin:'0 auto'}}>No chooser, no toggles. Type anything — we auto-detect URL vs search and route to Bing. YouTube → native player, Roblox/now.gg → cloud, everything encrypted.</p>
            <form onSubmit={handleSubmit} style={{marginTop:22, display:'flex', gap:0, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:999, padding:'6px', backdropFilter:'blur(12px)', boxShadow:'0 20px 60px rgba(0,0,0,.35)'}}>
              <div style={{flex:1, display:'flex', alignItems:'center', gap:12, padding:'0 18px'}}>
                <Search size={18} style={{opacity:.5}}/>
                <input value={address} onChange={e=> setAddress(e.target.value)} placeholder={ready? "Search Bing or enter URL — try roblox.com" : 'Starting…'} disabled={!ready} style={{flex:1, background:'transparent', border:0, outline:'none', color:'#f4f2ec', fontSize:15, padding:'10px 0'}}/>
              </div>
              <button type="submit" disabled={!ready} style={{padding:'12px 22px', borderRadius:999, background:'linear-gradient(135deg, #00809D, #7d6bff)', color:'#fff', border:0, fontWeight:900, fontSize:14, cursor: ready? 'pointer':'not-allowed', display:'flex', alignItems:'center', gap:8, whiteSpace:'nowrap'}}>Search <Zap size={14}/></button>
            </form>
            <div style={{display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap', marginTop:14}}>
              <span style={{fontSize:11, opacity:.5}}>Try:</span>
              {['roblox.com','now.gg','youtube cat videos','hole.io'].map(s=> <button key={s} onClick={()=> go(s)} disabled={!ready} style={{fontSize:12, padding:'6px 12px', borderRadius:999, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'#f4f2ec', cursor:'pointer'}}>{s}</button>)}
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center', marginTop:16 }}>
              <span style={{ padding:'7px 12px', borderRadius:99, border:'1px solid rgba(0,128,157,.25)', background:'rgba(0,128,157,.12)', color:'#7dd3ff', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', gap:6 }}><ShieldCheck size={12}/> Encrypted • Bing • Private</span>
              <span style={{ padding:'7px 12px', borderRadius:99, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.06)', color:'rgba(244,242,236,.7)', fontSize:11, fontWeight:700 }}>YouTube native • Roblox cloud</span>
            </div>
          </div>

          <div style={{marginTop:28}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between', marginBottom:12}}>
              <h3 style={{fontSize:12, fontWeight:900, letterSpacing:'.08em', opacity:.6}}>QUICK LAUNCH — BING + UNBLOCKED APPS</h3>
              <span style={{fontSize:11, opacity:.4}}>{QUICK.length} apps</span>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12}}>
              {QUICK.map(([name, url, col]) => (
                <button key={name} disabled={!ready} onClick={() => { if(name==='YouTube') window.location.href='/games/youtube/index.html'; else go(url); }} style={{
                  padding:'16px 14px', borderRadius:16, border:'1px solid rgba(255,255,255,.08)', background: ready? 'linear-gradient(145deg, rgba(255,255,255,.06), rgba(255,255,255,.02))' : 'rgba(255,255,255,.03)', color:'#f4f2ec', cursor: ready? 'pointer':'not-allowed', textAlign:'left', display:'flex', flexDirection:'column', gap:10, transition:'transform .2s', backdropFilter:'blur(8px)'
                }} onMouseEnter={e=> e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=> e.currentTarget.style.transform='translateY(0)'}>
                  <span style={{width:36, height:36, borderRadius:10, background:col, display:'grid', placeItems:'center', fontWeight:900, fontSize:12, color:'#fff', boxShadow:`0 8px 20px ${col}40`}}>{name[0]}</span>
                  <span style={{fontWeight:800, fontSize:13}}>{name}</span>
                  <span style={{fontSize:11, opacity:.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{url.replace('https://','').slice(0,22)}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop:18, padding:14, borderRadius:14, border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.03)', maxWidth:760, marginLeft:'auto', marginRight:'auto' }}>
            <div style={{ fontWeight:900, fontSize:12, display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}><ShieldCheck size={14}/> No settings needed — everything is automatic. Just search or paste a URL.</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.55)', marginTop:6, lineHeight:1.5, textAlign:'center' }}>Search, YouTube and Roblox just work — everything is private and automatic. If a site stalls, we instantly try another way.</div>
          </div>

          {historyStack.length > 0 && (
            <div style={{ marginTop:18, width:'100%', maxWidth:760, marginLeft:'auto', marginRight:'auto', textAlign:'left' }}>
              <div style={{ fontSize:11, letterSpacing:'.06em', color:'rgba(255,255,255,.45)', fontWeight:800, display:'flex', justifyContent:'space-between' }}>
                <span>RECENT</span>
                <button onClick={() => setHistoryStack([])} style={{ background:'none', border:0, color:'rgba(255,255,255,.45)', fontSize:11, cursor:'pointer', textDecoration:'underline' }}>Clear</button>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:8 }}>
                {historyStack.slice(-10).reverse().map((u, i) => (
                  <button key={i} onClick={() => go(u)} style={{ padding:'7px 12px', borderRadius:99, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.05)', color:'#f4f2ec', fontSize:12, cursor:'pointer', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u}</button>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <div style={{ flex:1, position:'relative', display:'flex', flexDirection:'column', minHeight:0, background:'#fff' }}>
          {frameLoading && (
            <div style={{ position:'absolute', inset:0, zIndex:2, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, background:'rgba(11,13,18,.88)', color:'#f4f2ec', textAlign:'center', padding:20 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', border:'3px solid rgba(255,255,255,.15)', borderTopColor:'#00809D', animation:'spin .8s linear infinite' }} />
              <div style={{ fontWeight:900 }}>Loading…</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.6)', maxWidth:520 }}>Opening <code style={{ background:'rgba(255,255,255,.08)', padding:'2px 6px', borderRadius:6 }}>{activeTab.raw}</code></div>
            </div>
          )}
          {frameError && (
            <div style={{ position:'absolute', inset:0, zIndex:3, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, background:'rgba(11,13,18,.92)', color:'#f4f2ec', textAlign:'center', padding:24 }}>
              <AlertTriangle size={28} color="#ffbe46" />
              <div style={{ fontWeight:900, fontSize:16 }}>Couldn’t load</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,.65)', maxWidth:560, lineHeight:1.6 }}>{frameError}</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
                <button onClick={() => { setFrameError(null); setFrameLoading(true); if (frame.current) frame.current.src = frame.current.src; }} style={btnRetry}>Retry</button>
                <button onClick={() => { if (activeTab.raw) window.open(activeTab.raw, '_blank'); }} style={btnGhost}>Open direct</button>
                <button onClick={() => setTabs([{ id:'t0', encoded:null, raw:null, title:'New Tab'}])} style={btnGhost}>Home</button>
              </div>
            </div>
          )}
          <iframe ref={frame} className="proxy-frame" src={encodedCurrent} title="Bing proxied" allow="fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture; geolocation; microphone; camera; display-capture; web-share" allowFullScreen onLoad={() => { setFrameLoading(false); setFrameError(null); }} onError={handleFrameError} style={{ flex:1, border:0, background:'#fff', minHeight:'calc(100vh - 58px)' }} />
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </main>
  );
}

const sIcon: React.CSSProperties = { width:32, height:32, display:'grid', placeItems:'center', borderRadius:10, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.06)', color:'#f4f2ec', cursor:'pointer', flex:'none' };
const sIconSmall: React.CSSProperties = { width:28, height:28, display:'grid', placeItems:'center', borderRadius:9, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.05)', color:'#f4f2ec', cursor:'pointer', flex:'none' };
const btnRetry: React.CSSProperties = { padding:'10px 16px', borderRadius:10, border:'1px solid rgba(0,128,157,.4)', background:'rgba(0,128,157,.16)', color:'#7dd3ff', fontWeight:800, cursor:'pointer' };
const btnGhost: React.CSSProperties = { padding:'10px 16px', borderRadius:10, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.06)', color:'#f4f2ec', fontWeight:800, cursor:'pointer' };
