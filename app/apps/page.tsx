'use client'
import { useEffect, useState, useRef } from 'react'
import { AppWindow, ArrowUpRight, Copy, ExternalLink, Gamepad2, Globe, Heart, Maximize2, Search, ShieldCheck, Sparkles, X, Zap } from 'lucide-react'

type App = { id: string; title: string; subtitle: string; description: string; mark: string; color: string; path: string; genre: string }

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

export default function AppsPage(){
  const [query,setQuery]=useState('')
  const [active,setActive]=useState<App|null>(null)
  const [fav,setFav]=useState<string[]>([])
  const frameRef=useRef<HTMLIFrameElement>(null)
  useEffect(()=>{ try{ const v=JSON.parse(localStorage.getItem('ggl_app_fav')||'[]'); if(Array.isArray(v)) setFav(v)}catch{} },[])
  const filtered = apps.filter(a=> `${a.title} ${a.subtitle} ${a.description}`.toLowerCase().includes(query.toLowerCase()))
  function toggleFav(id:string){ setFav(c=>{const n=c.includes(id)?c.filter(x=>x!==id):[...c,id]; try{localStorage.setItem('ggl_app_fav',JSON.stringify(n))}catch{}; return n})}
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
        <div className="header-status"><span className="live-dot"/> {apps.length} apps</div>
      </header>
      <section className="hero" id="top" style={{paddingBottom:22}}>
        <div className="hero-copy">
          <p className="eyebrow"><AppWindow size={14}/> UNBLOCKED APPS</p>
          <h1>Apps, <em>unblocked.</em></h1>
          <p className="hero-text">YouTube, Roblox, Discord, TikTok and more — all in one place. Tap any app to open it.</p>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}>
            <a className="hero-link" href="#apps">Open catalog <ArrowUpRight size={15}/></a>
            <a className="hero-link" href="/proxy" style={{background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)'}}><Globe size={14}/> Open Proxy</a>
          </div>
        </div>
        <div className="spotlight">
          <div className="spotlight-top"><span>FEATURED / 01</span><span className="spotlight-tag">ENCRYPTED</span></div>
          <div className="spotlight-art" onClick={()=> setActive(apps[0])} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&setActive(apps[0])} style={{cursor:'pointer'}}>
            <div className="orbit orbit-a"/><div className="orbit orbit-b"/><span className="spotlight-mark">YT</span><span className="spotlight-caption">VIDEO<br/>UNBLOCKED</span>
          </div>
          <div className="spotlight-bottom"><div><p className="card-kicker">VIDEO</p><h2>YouTube</h2><p>Tap to launch — full YouTube.</p></div><button className="circle-play" onClick={()=>setActive(apps[0])}><ShieldCheck size={18}/></button></div>
        </div>
      </section>

      <section className="catalog" id="apps">
        <div className="section-heading">
          <div><p className="eyebrow">ALL APPS</p><h2>Everything else<span>.</span></h2><p style={{margin:'6px 0 0',opacity:.6,fontSize:13}}>Each app opens right here — no extra tabs needed.</p></div>
          <div className="toolbar" style={{marginTop:8}}>
            <div className="search-wrap"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search apps — youtube, roblox, discord" aria-label="Search apps"/></div>
            <span style={{fontSize:12,opacity:.6,display:'flex',alignItems:'center',gap:6}}><Zap size={14}/> {filtered.length} apps</span>
          </div>
        </div>
        <div className="game-grid">
          {filtered.map((a,i)=>(
            <article key={a.id} className={`game-card ${a.color}`}>
              <button className="favorite-button" onClick={()=>toggleFav(a.id)} aria-label="fav"><Heart size={17} fill={fav.includes(a.id)?'currentColor':'none'}/></button>
              <div className="game-art" onClick={()=> setActive(a)} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&setActive(a)} style={{cursor:'pointer'}}>
                <span className="game-mark">{a.mark}</span><small>{String(i+1).padStart(2,'0')}</small>
              </div>
              <div className="game-info">
                <div><p className="card-kicker">{a.genre} · Ready</p><h3>{a.title}</h3><p>{a.description}</p><p style={{fontFamily:'monospace',fontSize:10,opacity:.45,marginTop:6}}>{a.subtitle}</p></div>
                <div style={{display:'flex',gap:8}}>
                  <button className="play-button" onClick={()=> setActive(a)}><AppWindow size={13}/> Open</button>
                  <button onClick={()=>toggleFav(a.id)} style={{background:'none',border:0,color:fav.includes(a.id)?'var(--coral)':'rgba(255,255,255,.4)',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:11}}><Heart size={12} fill={fav.includes(a.id)?'currentColor':'none'}/> {fav.includes(a.id)?'Saved':'Save'}</button>
                </div>
              </div>
            </article>
          ))}
          {filtered.length===0 && <div className="empty-state"><Zap size={22}/><h3>No apps found</h3><p>Try another search.</p></div>}
        </div>
        <div style={{marginTop:18,padding:14,borderRadius:16,border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.03)',fontSize:12,lineHeight:1.6}}>
          <strong style={{display:'flex',alignItems:'center',gap:6}}><Sparkles size={14} color="var(--lime)"/> How it works</strong>
          <p style={{opacity:.7,margin:'6px 0 0'}}>Apps open instantly and work even on school networks. Just tap and enjoy — everything runs right here in GG Lounge.</p>
        </div>
      </section>

      <footer id="about"><div className="footer-top"><div className="footer-brand"><span className="brand-mark"><Gamepad2 size={17}/></span><strong>GG-LOUNGE<span className="tm">™</span></strong></div><span className="footer-rule"/><p>Made by <strong>Kai Chauhan</strong></p></div><div className="footer-bottom"><span>© 2026 GG-LOUNGE STUDIOS™</span><span>Apps proxied • encrypted</span></div></footer>

      {active && (
        <div className="game-modal" role="dialog" aria-modal="true" aria-label={`${active.title} app`} onClick={e=>{if(e.target===e.currentTarget)setActive(null)}}>
          <div className="modal-bar">
            <div style={{display:'flex',alignItems:'center',gap:12,minWidth:0}}><span className={`game-badge ${active.color}`}>{active.mark}</span><div style={{minWidth:0,overflow:'hidden'}}><span className="modal-kicker">NOW PLAYING — {active.genre.toUpperCase()} / ENCRYPTED</span><strong style={{display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{active.title}</strong></div></div>
            <div className="modal-actions">
              <button onClick={()=>{ if(navigator.clipboard) navigator.clipboard.writeText(location.origin+active.path)}} title="Copy link"><Copy size={16}/></button>
              <button onClick={()=> window.open(active.path,'_blank')} title="Open in new tab"><ExternalLink size={16}/></button>
              <button onClick={()=> toggleFav(active.id)} title="Favorite"><Heart size={16} fill={fav.includes(active.id)?'currentColor':'none'}/></button>
              <button onClick={()=> frameRef.current?.requestFullscreen()} aria-label="Fullscreen"><Maximize2 size={18}/></button>
              <button onClick={()=> setActive(null)} aria-label="Close"><X size={20}/></button>
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
