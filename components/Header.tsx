'use client'
import { Gamepad2, Trophy, Wifi, WifiOff, User, Cloud, LogIn, LogOut, Sun, Moon, Download, Menu, X } from 'lucide-react'

export function Header({ allGames, online, theme, authUser, achSummary, installable, mobileNavOpen, setMobileNavOpen, setShowAchievementsHub, setShowAuth, doLogout, toggleTheme, doInstall }: any){
  return (
    <header className="site-header">
      <a href="#top" className="brand" aria-label="GG-Lounge home">
        <span className="brand-mark"><Gamepad2 size={19} /></span>
        <span>GG-LOUNGE<span className="tm">™</span></span>
      </a>
      <button className="mobile-toggle" aria-label="Open menu" aria-expanded={mobileNavOpen} onClick={()=> setMobileNavOpen((v:any)=>!v)}>{mobileNavOpen ? <X size={16}/> : <Menu size={16}/>}</button>
      <nav className={`header-nav ${mobileNavOpen?'mobile-open':''}`} aria-label="Primary navigation">
        <a href="#games" onClick={()=> setMobileNavOpen(false)}>Library</a>
        <a href="/apps" onClick={()=> setMobileNavOpen(false)}>Apps</a>
        <a href="/proxy" onClick={()=> setMobileNavOpen(false)}>Proxy</a>
        <button onClick={()=> { setShowAchievementsHub(true); setMobileNavOpen(false) }} style={{background:'none',border:0,cursor:'pointer',font:'inherit',color:'inherit',display:'flex',alignItems:'center',gap:6,fontWeight:800}}><Trophy size={12}/> Achievements</button>
        <a href="#about" onClick={()=> setMobileNavOpen(false)}>Studio</a>
        <a href="/request-game" onClick={()=> setMobileNavOpen(false)}>Request a game</a>
        <a href="/admin" onClick={()=> setMobileNavOpen(false)}>Admin</a>
      </nav>
      <div className="header-actions" style={{display:'flex',alignItems:'center',gap:10}}>
        <button onClick={()=> setShowAchievementsHub(true)} aria-label="Achievements" title={authUser ? `${achSummary?.unlocked||0}/${achSummary?.total||"--"} unlocked` : "View achievements — sign in to save"} style={{width:36,height:36,borderRadius:999,border:"1px solid var(--line)",background: authUser?"var(--lime)":"rgba(255,255,255,.06)",color: authUser?"#0b0d12":"var(--foreground)",display:"grid",placeItems:"center",cursor:"pointer",position:"relative"}}><Trophy size={16}/>{authUser && achSummary && achSummary.unlocked>0 ? <span style={{position:"absolute",top:-6,right:-6,background:"#0b0d12",color:"var(--lime)",border:"1px solid var(--lime)",fontSize:9,fontWeight:900,padding:"2px 5px",borderRadius:999,lineHeight:1}}>{achSummary.unlocked}</span> : null}</button>
        <div className="header-status" style={{display:'flex',alignItems:'center',gap:6}}>
          {online ? <Wifi size={12}/> : <WifiOff size={12} color="var(--coral)"/>}
          <span className="live-dot" style={{background: online?'var(--lime)':'var(--coral)'}} /> {allGames.length} titles
        </div>
        {authUser ? (
          <span style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.06)',fontSize:12,fontWeight:800}}>
            <User size={14}/> {authUser.username}
            <span style={{display:'flex',alignItems:'center',gap:4,padding:'2px 6px',borderRadius:999,background:'rgba(34,197,94,.14)',border:'1px solid var(--line)',fontSize:10}}><Cloud size={10}/> Synced</span>
            <button onClick={doLogout} aria-label="Log out" title="Log out" style={{width:24,height:24,display:'grid',placeItems:'center',borderRadius:999,border:'1px solid var(--line)',background:'var(--panel)',cursor:'pointer'}}><LogOut size={12}/></button>
          </span>
        ) : (
          <button onClick={()=> setShowAuth('login')} style={{padding:'7px 12px',borderRadius:999,border:'1px solid var(--lime)',background:'var(--lime)',color:'#0b0d12',fontWeight:900,fontSize:12,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}><LogIn size={14}/> Sign in</button>
        )}
        <button onClick={toggleTheme} aria-label="Toggle theme" title={theme==='dark'?'Switch to light mode':'Switch to dark mode'} style={{width:36,height:36,borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.06)',color:'var(--foreground)',display:'grid',placeItems:'center',cursor:'pointer'}}>
          {theme==='dark' ? <Sun size={16}/> : <Moon size={16}/>}
        </button>
        {installable && <button onClick={doInstall} style={{padding:'7px 10px',borderRadius:999,border:'1px solid var(--lime)',background:'var(--lime)',color:'#0b0d12',fontWeight:900,fontSize:12,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}><Download size={14}/> Install</button>}
      </div>
    </header>
  )
}
