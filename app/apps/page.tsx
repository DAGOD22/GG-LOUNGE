'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { AppWindow, ArrowUpRight, Copy, ExternalLink, Gamepad2, Globe, Heart, Maximize2, Search, ShieldCheck, Sparkles, X, Zap, Star, Download, Clock, Users, Play, ChevronRight } from 'lucide-react'

type App = { id: string; title: string; subtitle: string; description: string; mark: string; color: string; path: string; genre: string; icon?: string }

const apps: App[] = [
  { id: 'youtube', title: 'YouTube', subtitle: 'Watch unblocked.', description: 'Watch, search and comment — full YouTube experience.', mark: 'YT', color: 'youtube', path: '/app-frames/youtube/index.html', genre: 'Video' },
  { id: 'roblox', title: 'Roblox', subtitle: 'Play via cloud.', description: 'Play Roblox — full catalog, multiplayer. Just tap and play.', mark: 'RB', color: 'devil', path: '/app-frames/roblox/index.html', genre: 'Gaming' },
  { id: 'nowgg', title: 'now.gg', subtitle: 'Cloud gaming hub.', description: 'now.gg cloud — play any mobile game in browser, unblocked. SW warms before redirect.', mark: 'NG', color: 'stack', path: '/app-frames/nowgg/index.html', genre: 'Gaming' },
  { id: 'holeio', title: 'Hole.io', subtitle: 'Eat the map.', description: 'Eat the city — grow huge and win.', mark: 'HO', color: 'mining', path: '/app-frames/holeio/index.html', genre: 'Gaming' },
  { id: 'discord', title: 'Discord', subtitle: 'Chat unblocked.', description: 'Chat with friends — DM, servers and voice.', mark: 'DC', color: 'drive', path: '/app-frames/discord/index.html', genre: 'Social' },
  { id: 'tiktok', title: 'TikTok', subtitle: 'Scroll forever.', description: 'TikTok For You, proxied — full feed & comments.', mark: 'TK', color: 'twenty', path: '/app-frames/tiktok/index.html', genre: 'Social' },
  { id: 'twitch', title: 'Twitch', subtitle: 'Watch live.', description: 'Watch livestreams — chat and VODs.', mark: 'TW', color: 'hextris', path: '/app-frames/twitch/index.html', genre: 'Video' },
  { id: 'spotify', title: 'Spotify', subtitle: 'Music unblocked.', description: 'Open Spotify web player proxied — playlists & play.', mark: 'SP', color: 'mining', path: '/app-frames/spotify/index.html', genre: 'Music' },
  { id: 'google', title: 'Google', subtitle: 'Search unblocked.', description: 'Search the web — fast and private.', mark: 'GG', color: 'cookie', path: '/app-frames/google/index.html', genre: 'Search' },
  { id: 'github', title: 'GitHub', subtitle: 'Code unblocked.', description: 'Browse code — repos and commits.', mark: 'GH', color: 'stack', path: '/app-frames/github/index.html', genre: 'Tool' },
  { id: 'reddit', title: 'Reddit', subtitle: 'Browse unblocked.', description: 'Browse threads and comments.', mark: 'RE', color: 'devil', path: '/app-frames/reddit/index.html', genre: 'Social' },
]

const categories = ['All', 'Video', 'Gaming', 'Social', 'Music', 'Search', 'Tool']

export default function AppsPage(){
  const [query,setQuery]=useState('')
  const [active,setActive]=useState<App|null>(null)
  const [fav,setFav]=useState<string[]>([])
  const [cat,setCat]=useState('All')
  const frameRef=useRef<HTMLIFrameElement>(null)
  useEffect(()=>{ try{ const v=JSON.parse(localStorage.getItem('ggl_app_fav')||'[]'); if(Array.isArray(v)) setFav(v)}catch{} },[])
  const filtered = useMemo(()=> apps.filter(a=> {
    const qOk = `${a.title} ${a.subtitle} ${a.description}`.toLowerCase().includes(query.toLowerCase())
    const cOk = cat==='All' || a.genre===cat
    return qOk && cOk
  }), [query, cat])
  function toggleFav(id:string){ setFav(c=>{const n=c.includes(id)?c.filter(x=>x!==id):[...c,id]; try{localStorage.setItem('ggl_app_fav',JSON.stringify(n))}catch{}; return n})}
  const featured = apps[0]
  return (
    <main className="lounge-shell">
      <div className="noise" aria-hidden="true" />
      <header className="site-header">
        <a href="/" className="brand"><span className="brand-mark"><Gamepad2 size={19}/></span><span>GG-LOUNGE<span className="tm">™</span></span></a>
        <nav className="header-nav" aria-label="Primary navigation">
          <a href="/">Library</a>
          <a href="/apps" style={{color:'var(--lime)',textDecoration:'underline',textUnderlineOffset:6}}>Apps</a>
          <a href="/proxy">Proxy</a>
          <a href="/request-game">Request</a>
          <a href="/admin">Admin</a>
        </nav>
        <div className="header-status"><span className="live-dot"/> {apps.length} apps • encrypted</div>
      </header>

      {/* Premium hero */}
      <section className="hero" id="top" style={{paddingBottom:28, minHeight:480}}>
        <div className="hero-copy">
          <p className="eyebrow" style={{background:'rgba(215,243,74,.12)', border:'1px solid rgba(215,243,74,.22)', padding:'6px 10px', borderRadius:999, display:'inline-flex'}}><AppWindow size={14}/> UNBLOCKED APP STORE</p>
          <h1 style={{marginTop:14}}>Apps,<br/><em>unblocked.</em></h1>
          <p className="hero-text" style={{maxWidth:460}}>YouTube, Roblox, Discord, TikTok, Spotify — every app you need, running right inside GG Lounge. No installs, no blocks, just tap.</p>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:18}}>
            <a className="hero-link" href="#apps" style={{background:'var(--lime)', color:'#0b0d12', padding:'10px 18px', borderRadius:999, border:0, fontWeight:900, display:'inline-flex', alignItems:'center', gap:8, textDecoration:'none'}}>Explore apps <ArrowUpRight size={15}/></a>
            <a className="hero-link" href="/proxy" style={{background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', padding:'10px 16px', borderRadius:999, display:'inline-flex', alignItems:'center', gap:8}}><Globe size={14}/> Open Proxy</a>
          </div>
          <div className="hero-stats" style={{marginTop:28}}>
            <span><strong>11</strong> premium apps</span>
            <span><strong>0</strong> installs</span>
            <span><strong>∞</strong> unblocked</span>
          </div>
        </div>
        <div className="spotlight" style={{background:'linear-gradient(145deg, rgba(255,46,99,.18), rgba(88,101,242,.18) 50%, rgba(0,242,234,.14)), #151821', borderColor:'rgba(255,255,255,.12)'}}>
          <div className="spotlight-top"><span style={{display:'flex',alignItems:'center',gap:6}}><Star size={12} fill="var(--lime)" color="var(--lime)"/> FEATURED</span><span className="spotlight-tag" style={{background:'#ff2e63', color:'#fff'}}>MOST POPULAR</span></div>
          <div className="spotlight-art" onClick={()=> setActive(featured)} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&setActive(featured)} style={{cursor:'pointer', minHeight:190}}>
            <div className="orbit orbit-a" style={{borderColor:'rgba(255,46,99,.25)'}}/><div className="orbit orbit-b" style={{borderColor:'rgba(0,242,234,.25)'}}/>
            <span className="spotlight-mark" style={{fontSize:84, textShadow:'8px 8px 0 rgba(0,0,0,.25)'}}>▶</span>
            <span className="spotlight-caption" style={{background:'rgba(0,0,0,.32)', padding:'6px 10px', borderRadius:999, border:'1px solid rgba(255,255,255,.14)', backdropFilter:'blur(6px)', right:'6%', bottom:'6%'}}>YOUTUBE<br/>UNBLOCKED</span>
          </div>
          <div className="spotlight-bottom"><div><p className="card-kicker" style={{color:'#ff7a9e'}}>VIDEO • PROXIED</p><h2 style={{fontSize:26}}>YouTube</h2><p>Full watch, search, comments — no sign-in required.</p><div style={{display:'flex',gap:6,marginTop:8}}><span style={{fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)'}}>▶ 4K</span><span style={{fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)'}}>💬 Comments</span><span style={{fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)'}}>🔒 Encrypted</span></div></div><button className="circle-play" onClick={()=>setActive(featured)} style={{width:56, height:56}}><Play size={20} fill="currentColor"/></button></div>
        </div>
      </section>

      {/* App Store layout */}
      <section className="catalog" id="apps" style={{paddingTop:12}}>
        <div className="section-heading" style={{alignItems:'center'}}>
          <div><p className="eyebrow" style={{display:'flex',alignItems:'center',gap:8}}><Sparkles size={14}/> APP STORE <span style={{background:'var(--lime)', color:'#0b0d12', padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:900}}>NEW</span></p><h2 style={{fontSize:34}}>Everything,<span> unblocked.</span></h2><p style={{margin:'6px 0 0',opacity:.6,fontSize:13}}>Tap any tile — it opens as a full app right here. Save favourites with ♥.</p></div>
          <div style={{display:'flex',alignItems:'center',gap:10, flexWrap:'wrap'}}>
            <div className="search-wrap" style={{width:320}}><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search — youtube, discord, spotify" aria-label="Search apps"/></div>
          </div>
        </div>

        <div className="filter-tabs" style={{justifyContent:'flex-start', marginBottom:18}}>
          {categories.map(c=> (
            <button key={c} className={cat===c?'active':''} onClick={()=> setCat(c)} style={{display:'flex',alignItems:'center',gap:6}}>{c} <span style={{opacity:.6, fontSize:11}}>({c==='All'? apps.length : apps.filter(a=> a.genre===c).length})</span></button>
          ))}
        </div>

        <div className="game-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16}}>
          {filtered.map((a,i)=>(
            <article key={a.id} className={`game-card ${a.color}`} style={{minHeight:200, display:'grid', gridTemplateColumns:'110px 1fr', overflow:'hidden', cursor:'default'}}>
              <button className="favorite-button" onClick={()=>toggleFav(a.id)} aria-label="fav"><Heart size={16} fill={fav.includes(a.id)?'currentColor':'none'} style={{filter: fav.includes(a.id)? 'drop-shadow(0 2px 8px rgba(255,108,131,.5))':''}}/></button>
              <div className="game-art game-art--full" onClick={()=> setActive(a)} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&setActive(a)} style={{cursor:'pointer', minHeight:'auto', height:'100%'}}>
                <div className="game-cover-fallback" style={{height:'100%', minHeight:200}}>
                  <span className="game-mark game-mark--huge" style={{fontSize:48}}>{a.mark}</span>
                  <span className="game-cover-title" style={{marginTop:4}}>{a.title}</span>
                  <span style={{fontSize:9, opacity:.6, letterSpacing:'.08em', textTransform:'uppercase'}}>{a.genre}</span>
                </div>
                <div className="game-art-overlay">
                  <small>{String(i+1).padStart(2,'0')}</small>
                  <span className="art-play"><Play size={10} fill="currentColor"/></span>
                </div>
              </div>
              <div className="game-info" style={{padding:'14px 14px 12px'}}>
                <div><p className="card-kicker" style={{fontSize:9, display:'flex', alignItems:'center', gap:6}}><span style={{width:6, height:6, borderRadius:999, background:'var(--lime)', display:'inline-block'}}/>{a.genre} • {a.subtitle}</p><h3 style={{fontSize:17, margin:'6px 0 4px'}}>{a.title}</h3><p style={{fontSize:12, lineHeight:1.45, opacity:.75}}>{a.description}</p></div>
                <div style={{display:'flex',gap:8, marginTop:10, alignItems:'center'}}>
                  <button className="play-button" onClick={()=> setActive(a)} style={{padding:'7px 14px', fontSize:11, fontWeight:900, background:'var(--foreground)', color:'var(--background)', borderColor:'var(--foreground)'}}><AppWindow size={12}/> Open</button>
                  <button onClick={()=>toggleFav(a.id)} style={{background:'none',border:0,color:fav.includes(a.id)?'var(--coral)':'rgba(255,255,255,.5)',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:11, fontWeight:700}}><Heart size={12} fill={fav.includes(a.id)?'currentColor':'none'}/> {fav.includes(a.id)?'Saved':'Save'}</button>
                  <span style={{marginLeft:'auto', fontSize:10, opacity:.45, display:'flex', alignItems:'center', gap:4}}><Clock size={10}/> Instant</span>
                </div>
              </div>
            </article>
          ))}
          {filtered.length===0 && <div className="empty-state" style={{gridColumn:'1/-1'}}><Zap size={22}/><h3>No apps found</h3><p>Try another search or category.</p></div>}
        </div>

        <div style={{marginTop:20, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:14}}>
          <div style={{padding:18, borderRadius:18, border:'1px solid rgba(255,255,255,.08)', background:'linear-gradient(135deg, rgba(215,243,74,.10), rgba(125,107,255,.10))'}}>
            <strong style={{display:'flex',alignItems:'center',gap:8, fontSize:14}}><ShieldCheck size={16} color="var(--lime)"/> Works on school Wi-Fi</strong>
            <p style={{opacity:.7,margin:'6px 0 0', fontSize:13, lineHeight:1.5}}>All apps are proxied and encrypted. They look like normal GG Lounge pages to filters, but give you the real app inside.</p>
          </div>
          <div style={{padding:18, borderRadius:18, border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.03)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
            <div><strong style={{display:'flex',alignItems:'center',gap:6, fontSize:14}}><Download size={14}/> Install as app</strong><p style={{opacity:.6, fontSize:12, margin:'4px 0 0'}}>Add GG Lounge to your home screen — apps launch instantly.</p></div>
            <ChevronRight size={18} style={{opacity:.4}}/>
          </div>
        </div>
      </section>

      <footer id="about"><div className="footer-top"><div className="footer-brand"><span className="brand-mark"><Gamepad2 size={17}/></span><strong>GG-LOUNGE<span className="tm">™</span></strong></div><span className="footer-rule"/><p>Made by <strong>Kai Chauhan</strong> • Apps • Proxy • Encrypted</p></div><div className="footer-bottom"><span>© 2026 GG-LOUNGE STUDIOS™</span><span>11 apps • zero installs</span></div></footer>

      {active && (
        <div className="game-modal" role="dialog" aria-modal="true" aria-label={`${active.title} app`} onClick={e=>{if(e.target===e.currentTarget)setActive(null)}}>
          <div className="modal-bar">
            <div style={{display:'flex',alignItems:'center',gap:12,minWidth:0}}><span className={`game-badge ${active.color}`} style={{width:38, height:38, fontSize:13}}>{active.mark}</span><div style={{minWidth:0,overflow:'hidden'}}><span className="modal-kicker">NOW PLAYING — {active.genre.toUpperCase()} / ENCRYPTED • PROXIED</span><strong style={{display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{active.title} <span style={{fontSize:10, padding:'3px 8px', borderRadius:999, background:'rgba(34,197,94,.14)', border:'1px solid rgba(34,197,94,.3)', color:'#22c55e'}}>● Live</span></strong></div></div>
            <div className="modal-actions">
              <button onClick={()=>{ if(navigator.clipboard) navigator.clipboard.writeText(location.origin+active.path)}} title="Copy link"><Copy size={16}/></button>
              <button onClick={()=> window.open(active.path,'_blank')} title="Open in new tab"><ExternalLink size={16}/></button>
              <button onClick={()=> toggleFav(active.id)} title="Favorite"><Heart size={16} fill={fav.includes(active.id)?'currentColor':'none'}/></button>
              <button onClick={()=> frameRef.current?.requestFullscreen()} aria-label="Fullscreen"><Maximize2 size={18}/></button>
              <button onClick={()=> setActive(null)} aria-label="Close" style={{background:'var(--coral)', color:'#fff', borderColor:'var(--coral)'}}><X size={20}/></button>
            </div>
          </div>
          <div className="frame-wrap">
            <iframe ref={frameRef} className="game-frame" src={active.path} title={active.title} allow="fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture; web-share; geolocation; microphone; camera" allowFullScreen />
          </div>
        </div>
      )}
    </main>
  )
}
