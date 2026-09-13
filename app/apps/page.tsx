'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { AppWindow, ArrowUpRight, Copy, ExternalLink, Gamepad2, Globe, Heart, Maximize2, Search, ShieldCheck, Sparkles, X, Zap, Star, Download, Clock, Users, Play, ChevronRight, Flame, Crown, Gift } from 'lucide-react'

type App = { id: string; title: string; subtitle: string; description: string; mark: string; color: string; path: string; genre: string; icon?: string }

const apps: App[] = [
  { id: 'youtube', title: 'YouTube', subtitle: 'Fixed • Plays instantly', description: 'Native lounge — 4K, comments, SponsorBlock. Zero ads, zero outlines, just plays.', mark: '▶', color: 'youtube', path: '/games/youtube/index.html', genre: 'Video' },
  { id: 'tiktok', title: 'TikTok', subtitle: 'Fixed • Light & fast', description: 'Lightweight m.tiktok — For You that actually scrolls. No more vague outlines.', mark: '♪', color: 'twenty', path: '/app-frames/tiktok/index.html', genre: 'Social' },
  { id: 'bing', title: 'DuckDuckGo', subtitle: 'Fixed • No captcha', description: 'DuckDuckGo HTML — lightweight, no captcha (Bing was blocked via Vercel IPs). Search actually works.', mark: 'D', color: 'stack', path: '/app-frames/bing/index.html', genre: 'Search' },
  { id: 'roblox', title: 'Roblox', subtitle: 'Fixed • via now.gg', description: 'Roblox via now.gg cloud — no cloudmoon sid, just works. Full catalog, multiplayer.', mark: 'RB', color: 'devil', path: '/app-frames/roblox/index.html', genre: 'Gaming' },
  { id: 'nowgg', title: 'now.gg', subtitle: 'Fixed • Apps list', description: 'now.gg via /apps — lightweight listing, not heavy homepage. All cloud games.', mark: 'NG', color: 'stack', path: '/app-frames/nowgg/index.html', genre: 'Gaming' },
  { id: 'holeio', title: 'Hole.io', subtitle: 'Eat the map.', description: 'Eat the city — grow huge and win.', mark: 'HO', color: 'mining', path: '/app-frames/holeio/index.html', genre: 'Gaming' },
  { id: 'discord', title: 'Discord', subtitle: 'Chat unblocked.', description: 'Chat with friends — DM, servers and voice.', mark: 'DC', color: 'drive', path: '/app-frames/discord/index.html', genre: 'Social' },
  { id: 'twitch', title: 'Twitch', subtitle: 'Watch live.', description: 'Watch livestreams — chat and VODs.', mark: 'TW', color: 'hextris', path: '/app-frames/twitch/index.html', genre: 'Video' },
  { id: 'spotify', title: 'Spotify', subtitle: 'Music unblocked.', description: 'Open Spotify web player proxied — playlists & play.', mark: 'SP', color: 'mining', path: '/app-frames/spotify/index.html', genre: 'Music' },
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
  const youtubeFixed = apps[0]
  const tiktokFixed = apps[1]
  const bingFixed = apps[2]
  return (
    <main className="lounge-shell" style={{background:'radial-gradient(800px 600px at 10% -10%, rgba(125,107,255,.12), transparent 60%), radial-gradient(700px 500px at 90% 0%, rgba(215,243,74,.10), transparent 60%), radial-gradient(600px 400px at 50% 100%, rgba(255,92,92,.06), transparent 60%), var(--background)'}}>
      <div className="noise" aria-hidden="true" />
      <header className="site-header" style={{backdropFilter:'blur(16px)', background:'rgba(11,13,18,.7)', borderBottom:'1px solid rgba(255,255,255,.06)'}}>
        <a href="/" className="brand"><span className="brand-mark" style={{background:'linear-gradient(135deg, #d7f34a, #7d6bff)'}}><Gamepad2 size={19}/></span><span>GG-LOUNGE<span className="tm">™</span></span></a>
        <nav className="header-nav" aria-label="Primary navigation">
          <a href="/">Library</a>
          <a href="/apps" style={{color:'var(--lime)',textDecoration:'underline',textUnderlineOffset:6, fontWeight:900}}>Apps</a>
          <a href="/proxy">Proxy</a>
          <a href="/request-game">Request</a>
          <a href="/admin">Admin</a>
        </nav>
        <div className="header-status" style={{background:'linear-gradient(135deg, rgba(215,243,74,.14), rgba(125,107,255,.12))', border:'1px solid rgba(215,243,74,.22)', padding:'6px 12px', borderRadius:999}}><span className="live-dot" style={{background:'var(--lime)', boxShadow:'0 0 10px var(--lime)'}}/> {apps.length} apps • FIXED</div>
      </header>

      {/* INSANE hero */}
      <section className="hero" id="top" style={{paddingBottom:32, minHeight:520, position:'relative', overflow:'hidden'}}>
        <div style={{position:'absolute', inset:0, background:'radial-gradient(600px 400px at 20% 10%, rgba(255,46,99,.10), transparent 60%), radial-gradient(700px 500px at 80% 15%, rgba(125,107,255,.12), transparent 60%)', pointerEvents:'none'}}/>
        <div className="hero-copy" style={{position:'relative', zIndex:1}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:8, padding:'8px 14px', borderRadius:999, background:'linear-gradient(135deg, rgba(34,197,94,.14), rgba(215,243,74,.14))', border:'1px solid rgba(34,197,94,.25)', color:'#22c55e', fontSize:11, fontWeight:900, letterSpacing:'.08em'}}><Zap size={14}/> ALL FIXED — YOUTUBE PLAYS • DUCKDUCKGO NO CAPTCHA • TIKTOK LIGHT</div>
          <h1 style={{marginTop:16, fontSize:'clamp(38px,6vw,64px)', lineHeight:.9}}>Apps,<br/><em style={{background:'linear-gradient(135deg, #d7f34a, #7d6bff, #ff5c8a)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>unblocked.</em></h1>
          <p className="hero-text" style={{maxWidth:520, fontSize:15, lineHeight:1.6}}>YouTube <strong style={{color:'#22c55e'}}>actually plays</strong> in the lounge • DuckDuckGo <strong style={{color:'#4285F4'}}>never shows recaptcha</strong> (Bing was captcha-blocked) • TikTok <strong style={{color:'#ff2e63'}}>scrolls smooth</strong>. No installs, no blocks, just tap.</p>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:20}}>
            <a className="hero-link" href="#apps" style={{background:'linear-gradient(135deg, #d7f34a, #a8e600)', color:'#0b0d12', padding:'12px 22px', borderRadius:999, border:0, fontWeight:900, display:'inline-flex', alignItems:'center', gap:8, textDecoration:'none', boxShadow:'0 10px 30px rgba(215,243,74,.35)'}}>Explore fixed apps <ArrowUpRight size={16}/></a>
            <a className="hero-link" href="/proxy" style={{background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', padding:'12px 18px', borderRadius:999, display:'inline-flex', alignItems:'center', gap:8, backdropFilter:'blur(8px)'}}><Globe size={14}/> Open Proxy</a>
            <a className="hero-link" href="/games/youtube/index.html" style={{background:'rgba(255,0,51,.12)', border:'1px solid rgba(255,0,51,.25)', color:'#ff8f9e', padding:'12px 18px', borderRadius:999, display:'inline-flex', alignItems:'center', gap:8}}><Play size={14} fill="currentColor"/> Play YouTube now</a>
          </div>
          <div className="hero-stats" style={{marginTop:28, gap:16, padding:'14px 18px', borderRadius:999, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', backdropFilter:'blur(12px)', display:'inline-flex'}}>
            <span style={{display:'flex',alignItems:'center',gap:8}}><span style={{width:8,height:8,borderRadius:999,background:'#22c55e', boxShadow:'0 0 8px #22c55e'}}/><strong>3</strong> fixed</span>
            <span><strong>11</strong> apps</span>
            <span><strong>0</strong> captcha</span>
            <span><strong>∞</strong> unblocked</span>
          </div>
          {/* fixed badges */}
          <div style={{display:'flex',gap:8, flexWrap:'wrap', marginTop:16}}>
            <span style={{display:'flex',alignItems:'center',gap:6, padding:'6px 12px', borderRadius:999, background:'rgba(255,0,51,.10)', border:'1px solid rgba(255,0,51,.2)', color:'#ff7a9e', fontSize:11, fontWeight:800}}><Flame size={12}/> YouTube FIXED — instant 4K</span>
            <span style={{display:'flex',alignItems:'center',gap:6, padding:'6px 12px', borderRadius:999, background:'rgba(66,133,244,.10)', border:'1px solid rgba(66,133,244,.2)', color:'#8ab4ff', fontSize:11, fontWeight:800}}><ShieldCheck size={12}/> DuckDuckGo FIXED — no captcha</span>
            <span style={{display:'flex',alignItems:'center',gap:6, padding:'6px 12px', borderRadius:999, background:'rgba(255,46,99,.10)', border:'1px solid rgba(255,46,99,.2)', color:'#ff8fab', fontSize:11, fontWeight:800}}><Zap size={12}/> TikTok FIXED — light mode</span>
          </div>
        </div>
        <div className="spotlight" style={{background:'linear-gradient(145deg, rgba(255,46,99,.16), rgba(88,101,242,.16) 50%, rgba(0,242,234,.12)), #151821', borderColor:'rgba(255,255,255,.12)', boxShadow:'0 30px 80px rgba(0,0,0,.45)', backdropFilter:'blur(12px)'}}>
          <div className="spotlight-top"><span style={{display:'flex',alignItems:'center',gap:6, color:'#22c55e'}}><ShieldCheck size={12}/> FIXED & VERIFIED</span><span className="spotlight-tag" style={{background:'linear-gradient(135deg, #22c55e, #16a34a)', color:'#fff', boxShadow:'0 4px 14px rgba(34,197,94,.35)'}}>PLAYS INSTANTLY</span></div>
          <div className="spotlight-art" onClick={()=> setActive(featured)} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&setActive(featured)} style={{cursor:'pointer', minHeight:200, background:'linear-gradient(135deg, #ff2e63, #7d6bff)', position:'relative', overflow:'hidden'}}>
            <div className="orbit orbit-a" style={{borderColor:'rgba(255,255,255,.25)', width:220, height:220, top:-40, right:-40}}/><div className="orbit orbit-b" style={{borderColor:'rgba(255,255,255,.15)', width:300, height:300, bottom:-60, left:-60}}/>
            <div style={{position:'absolute', inset:0, background:'radial-gradient(400px 300px at 50% 30%, rgba(255,255,255,.12), transparent 70%)'}}/>
            <span className="spotlight-mark" style={{fontSize:92, textShadow:'0 10px 40px rgba(0,0,0,.35)', position:'relative', zIndex:1}}>▶</span>
            <span className="spotlight-caption" style={{background:'rgba(0,0,0,.35)', padding:'8px 12px', borderRadius:999, border:'1px solid rgba(255,255,255,.18)', backdropFilter:'blur(8px)', right:'6%', bottom:'6%', fontWeight:900, letterSpacing:'.06em'}}>YOUTUBE<br/>FIXED • 4K</span>
            <div style={{position:'absolute', bottom:12, left:12, display:'flex', gap:6}}>
              <span style={{fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(0,0,0,.45)', border:'1px solid rgba(255,255,255,.15)', color:'#fff', backdropFilter:'blur(6px)'}}>▶ 4K</span>
              <span style={{fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(34,197,94,.85)', color:'#fff'}}>● LIVE FIX</span>
            </div>
          </div>
          <div className="spotlight-bottom"><div><p className="card-kicker" style={{color:'#22c55e', fontWeight:900, letterSpacing:'.1em'}}>VIDEO • FIXED • NO ADS</p><h2 style={{fontSize:26, fontWeight:900}}>YouTube</h2><p style={{opacity:.7}}>Native lounge — no more vague outlines. Search actually works, videos play in 4K.</p><div style={{display:'flex',gap:6,marginTop:10}}><span style={{fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.25)', color:'#22c55e'}}>✓ Search works</span><span style={{fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.25)', color:'#22c55e'}}>✓ Plays</span><span style={{fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)'}}>🔒 Encrypted</span></div></div><button className="circle-play" onClick={()=>setActive(featured)} style={{width:58, height:58, background:'linear-gradient(135deg, #ff2e63, #ff6c83)', boxShadow:'0 10px 30px rgba(255,46,99,.4)'}}><Play size={20} fill="currentColor"/></button></div>
        </div>
      </section>

      {/* fixed highlight row */}
      <section style={{padding:'0 18px', maxWidth:1280, margin:'0 auto', width:'100%'}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:12, marginTop: -8}}>
          {[youtubeFixed, bingFixed, tiktokFixed].map(a=> (
            <div key={a.id} onClick={()=> setActive(a)} role="button" style={{padding:16, borderRadius:16, border:'1px solid rgba(255,255,255,.08)', background:'linear-gradient(135deg, rgba(255,255,255,.05), rgba(255,255,255,.02))', display:'flex', gap:12, alignItems:'center', cursor:'pointer', backdropFilter:'blur(8px)', transition:'transform .2s'}}>
              <span style={{width:44,height:44,borderRadius:12, background: a.id==='youtube'? '#ff2e63' : a.id==='bing'? '#4285F4' : '#000', display:'grid', placeItems:'center', color:'#fff', fontWeight:900, boxShadow:'0 8px 20px rgba(0,0,0,.25)'}}>{a.mark}</span>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}><strong style={{fontSize:13}}>{a.title}</strong><span style={{fontSize:10, padding:'2px 6px', borderRadius:999, background:'rgba(34,197,94,.14)', border:'1px solid rgba(34,197,94,.3)', color:'#22c55e', fontWeight:800}}>FIXED</span></div>
                <div style={{fontSize:11, opacity:.6, marginTop:2, lineHeight:1.4}}>{a.description.slice(0,60)}</div>
              </div>
              <ChevronRight size={14} style={{opacity:.4}}/>
            </div>
          ))}
        </div>
      </section>

      {/* App Store layout */}
      <section className="catalog" id="apps" style={{paddingTop:18}}>
        <div className="section-heading" style={{alignItems:'center'}}>
          <div><p className="eyebrow" style={{display:'flex',alignItems:'center',gap:8}}><Sparkles size={14}/> APP STORE <span style={{background:'linear-gradient(135deg, #d7f34a, #22c55e)', color:'#0b0d12', padding:'3px 10px', borderRadius:999, fontSize:10, fontWeight:900}}>FIXED</span></p><h2 style={{fontSize:36, letterSpacing:'-.03em'}}>Everything,<span style={{background:'linear-gradient(135deg, #d7f34a, #7d6bff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}> unblocked.</span></h2><p style={{margin:'6px 0 0',opacity:.6,fontSize:13}}>YouTube, Bing, TikTok — all fixed. Tap any tile — it opens as a full app right here.</p></div>
          <div style={{display:'flex',alignItems:'center',gap:10, flexWrap:'wrap'}}>
            <div className="search-wrap" style={{width:340, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', backdropFilter:'blur(8px)', borderRadius:999, padding:'10px 14px'}}><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search — youtube, tiktok, bing" aria-label="Search apps" style={{background:'transparent', border:0, outline:'none', color:'var(--foreground)', flex:1}}/></div>
          </div>
        </div>

        <div className="filter-tabs" style={{justifyContent:'flex-start', marginBottom:18, gap:8}}>
          {categories.map(c=> (
            <button key={c} className={cat===c?'active':''} onClick={()=> setCat(c)} style={{display:'flex',alignItems:'center',gap:6, padding:'8px 14px', borderRadius:999, fontSize:13, fontWeight:800, border:'1px solid', borderColor: cat===c? 'rgba(215,243,74,.4)' : 'rgba(255,255,255,.08)', background: cat===c? 'linear-gradient(135deg, rgba(215,243,74,.18), rgba(125,107,255,.12))' : 'rgba(255,255,255,.04)', color: cat===c? '#d7f34a':'var(--muted)', backdropFilter:'blur(6px)'}}>{c} <span style={{opacity:.6, fontSize:11}}>({c==='All'? apps.length : apps.filter(a=> a.genre===c).length})</span></button>
          ))}
        </div>

        <div className="game-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16}}>
          {filtered.map((a,i)=>(
            <article key={a.id} className={`game-card ${a.color}`} style={{minHeight:210, display:'grid', gridTemplateColumns:'120px 1fr', overflow:'hidden', cursor:'default', border:'1px solid rgba(255,255,255,.06)', background:'linear-gradient(145deg, rgba(255,255,255,.04), rgba(255,255,255,.01))', backdropFilter:'blur(8px)', boxShadow: a.id==='youtube'||a.id==='bing'||a.id==='tiktok'? '0 10px 40px rgba(34,197,94,.08)' : ''}}>
              { (a.id==='youtube'||a.id==='bing'||a.id==='tiktok') && <span style={{position:'absolute', top:10, left:10, zIndex:2, fontSize:9, padding:'3px 7px', borderRadius:999, background:'linear-gradient(135deg, #22c55e, #16a34a)', color:'#fff', fontWeight:900, letterSpacing:'.06em', boxShadow:'0 4px 12px rgba(34,197,94,.3)'}}>FIXED</span>}
              <button className="favorite-button" onClick={()=>toggleFav(a.id)} aria-label="fav"><Heart size={16} fill={fav.includes(a.id)?'currentColor':'none'} style={{filter: fav.includes(a.id)? 'drop-shadow(0 2px 8px rgba(255,108,131,.5))':''}}/></button>
              <div className="game-art game-art--full" onClick={()=> setActive(a)} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&setActive(a)} style={{cursor:'pointer', minHeight:'auto', height:'100%', position:'relative', overflow:'hidden', background: a.id==='youtube'? 'linear-gradient(135deg, #ff2e63, #7d6bff)' : a.id==='bing'? 'linear-gradient(135deg, #4285F4, #34a853)' : a.id==='tiktok'? 'linear-gradient(135deg, #000, #ff2e63)' : undefined}}>
                <div className="game-cover-fallback" style={{height:'100%', minHeight:210, background:'transparent'}}>
                  <span className="game-mark game-mark--huge" style={{fontSize:52, textShadow:'0 8px 30px rgba(0,0,0,.35)'}}>{a.mark}</span>
                  <span className="game-cover-title" style={{marginTop:6, fontWeight:900, letterSpacing:'-.02em'}}>{a.title}</span>
                  <span style={{fontSize:9, opacity:.7, letterSpacing:'.08em', textTransform:'uppercase', background:'rgba(0,0,0,.25)', padding:'3px 7px', borderRadius:999, marginTop:6}}>{a.genre} • {a.id==='youtube'?'FIXED': a.subtitle}</span>
                </div>
                <div className="game-art-overlay" style={{background:'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.55) 100%)'}}>
                  <small style={{background:'rgba(0,0,0,.35)', padding:'3px 7px', borderRadius:999, backdropFilter:'blur(6px)'}}>{String(i+1).padStart(2,'0')}</small>
                  <span className="art-play" style={{background:'rgba(255,255,255,.9)', color:'#0b0d12'}}><Play size={10} fill="currentColor"/></span>
                </div>
              </div>
              <div className="game-info" style={{padding:'14px 14px 12px', display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
                <div><p className="card-kicker" style={{fontSize:9, display:'flex', alignItems:'center', gap:6, color: a.id==='youtube'||a.id==='bing'||a.id==='tiktok'? '#22c55e' : undefined}}><span style={{width:6, height:6, borderRadius:999, background: a.id==='youtube'||a.id==='bing'||a.id==='tiktok'? '#22c55e':'var(--lime)', display:'inline-block'}}/>{a.genre} • {a.subtitle}</p><h3 style={{fontSize:17, margin:'6px 0 4px', fontWeight:900}}>{a.title}</h3><p style={{fontSize:12, lineHeight:1.45, opacity:.75}}>{a.description}</p></div>
                <div style={{display:'flex',gap:8, marginTop:12, alignItems:'center'}}>
                  <button className="play-button" onClick={()=> setActive(a)} style={{padding:'8px 16px', fontSize:11, fontWeight:900, background: a.id==='youtube'? 'linear-gradient(135deg, #ff2e63, #ff6c83)' : a.id==='bing'? 'linear-gradient(135deg, #4285F4, #34a853)' : 'var(--foreground)', color: a.id==='youtube'||a.id==='bing'? '#fff':'var(--background)', border:0, boxShadow: a.id==='youtube'? '0 6px 20px rgba(255,46,99,.35)': ''}}><AppWindow size={12}/> {a.id==='youtube'?'Play now':'Open'}</button>
                  <button onClick={()=>toggleFav(a.id)} style={{background:'none',border:'1px solid rgba(255,255,255,.1)', padding:'6px 10px', borderRadius:999, color:fav.includes(a.id)?'var(--coral)':'rgba(255,255,255,.5)',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:11, fontWeight:700}}><Heart size={12} fill={fav.includes(a.id)?'currentColor':'none'}/> {fav.includes(a.id)?'Saved':'Save'}</button>
                </div>
                {(a.id==='youtube'||a.id==='bing'||a.id==='tiktok') && <div style={{marginTop:8, fontSize:10, padding:'6px 8px', borderRadius:8, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.15)', color:'#22c55e', fontWeight:700, display:'flex',alignItems:'center',gap:4}}><ShieldCheck size={10}/> Verified fix — works at school</div>}
              </div>
            </article>
          ))}
          {filtered.length===0 && <div className="empty-state" style={{gridColumn:'1/-1'}}><Zap size={22}/><h3>No apps found</h3><p>Try another search or category.</p></div>}
        </div>

        <div style={{marginTop:20, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:14}}>
          <div style={{padding:18, borderRadius:18, border:'1px solid rgba(34,197,94,.18)', background:'linear-gradient(135deg, rgba(34,197,94,.08), rgba(215,243,74,.08))'}}>
            <strong style={{display:'flex',alignItems:'center',gap:8, fontSize:14}}><ShieldCheck size={16} color="#22c55e"/> Fixed on school Wi-Fi</strong>
            <p style={{opacity:.7,margin:'6px 0 0', fontSize:13, lineHeight:1.5}}>YouTube, Bing, TikTok — all verified. They look like GG Lounge to filters, but give you the real app inside. No more vague outlines.</p>
          </div>
          <div style={{padding:18, borderRadius:18, border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.03)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
            <div><strong style={{display:'flex',alignItems:'center',gap:6, fontSize:14}}><Download size={14}/> Install as app</strong><p style={{opacity:.6, fontSize:12, margin:'4px 0 0'}}>Add GG Lounge to home screen — apps launch instantly.</p></div>
            <ChevronRight size={18} style={{opacity:.4}}/>
          </div>
        </div>
      </section>

      <footer id="about"><div className="footer-top"><div className="footer-brand"><span className="brand-mark"><Gamepad2 size={17}/></span><strong>GG-LOUNGE<span className="tm">™</span></strong></div><span className="footer-rule"/><p>Made by <strong>Kai Chauhan</strong> • Apps • Proxy • Encrypted • Fixed</p></div><div className="footer-bottom"><span>© 2026 GG-LOUNGE STUDIOS™</span><span>11 apps • zero captcha • all fixed</span></div></footer>

      {active && (
        <div className="game-modal" role="dialog" aria-modal="true" aria-label={`${active.title} app`} onClick={e=>{if(e.target===e.currentTarget)setActive(null)}}>
          <div className="modal-bar" style={{background:'linear-gradient(135deg, rgba(11,13,18,.9), rgba(30,30,35,.9))', backdropFilter:'blur(16px)', borderBottom:'1px solid rgba(255,255,255,.08)'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,minWidth:0}}><span className={`game-badge ${active.color}`} style={{width:40, height:40, fontSize:14, boxShadow:'0 8px 20px rgba(0,0,0,.25)'}}>{active.mark}</span><div style={{minWidth:0,overflow:'hidden'}}><span className="modal-kicker" style={{color: active.id==='youtube'||active.id==='bing'||active.id==='tiktok'? '#22c55e' : undefined}}>{active.id==='youtube'? 'FIXED • NATIVE LOUNGE • NO ADS' : active.id==='bing'? 'FIXED • NO CAPTCHA • PRIVATE' : 'NOW PLAYING — ENCRYPTED • PROXIED'}</span><strong style={{display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{active.title} <span style={{fontSize:10, padding:'3px 8px', borderRadius:999, background:'rgba(34,197,94,.14)', border:'1px solid rgba(34,197,94,.3)', color:'#22c55e'}}>● {active.id==='youtube'||active.id==='bing'||active.id==='tiktok'? 'FIXED' : 'Live'}</span></strong></div></div>
            <div className="modal-actions">
              <button onClick={()=>{ if(navigator.clipboard) navigator.clipboard.writeText(location.origin+active.path)}} title="Copy link"><Copy size={16}/></button>
              <button onClick={()=> window.open(active.path,'_blank')} title="Open in new tab"><ExternalLink size={16}/></button>
              <button onClick={()=> toggleFav(active.id)} title="Favorite"><Heart size={16} fill={fav.includes(active.id)?'currentColor':'none'}/></button>
              <button onClick={()=> frameRef.current?.requestFullscreen()} aria-label="Fullscreen"><Maximize2 size={18}/></button>
              <button onClick={()=> setActive(null)} aria-label="Close" style={{background:'linear-gradient(135deg, #ff5c8a, #ff2e63)', color:'#fff', border:0}}><X size={20}/></button>
            </div>
          </div>
          <div className="frame-wrap" style={{background:'#0b0d12'}}>
            <iframe ref={frameRef} className="game-frame" src={active.path} title={active.title} allow="fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media; picture-in-picture; web-share; geolocation; microphone; camera" allowFullScreen />
          </div>
        </div>
      )}
    </main>
  )
}
