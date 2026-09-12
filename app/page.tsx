'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Gamepad2, Heart, Maximize2, Play, Search, ShieldCheck, Sparkles, Trophy, X, Zap, LayoutGrid, Rows3, Shuffle, ExternalLink, Copy, AlertCircle, Loader2, ChevronLeft, ChevronRight, Sun, Moon, Download, Flag, Flame, Crown, Gift, Monitor, Keyboard, Bug, ThumbsUp, Globe, MessageSquare, Star, Timer, WifiOff, Wifi, Filter, ArrowUpDown, Eye, EyeOff, ShieldAlert, ListFilter, Users, LogIn, LogOut, User, Cloud, CloudOff, Save, Menu } from 'lucide-react'
import { games, filters, pubColors, FEATURED_IDS, STAFF_PICKS, LOW_QUALITY_HINTS, CONTROLS_LEGEND, hashDay, gameOfDayIndex, PROXY_TILES } from '@/lib/games'
import type { Game } from '@/lib/games'
import { GameCard, ShelfCard } from '@/components/GameCard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { GameModal } from '@/components/GameModal'
import { AuthDialog } from '@/components/AuthDialog'
import { AchievementsHub } from '@/components/AchievementsHub'

type PublishedListing = { id: string; title: string; icon: string | null }
type RequestItem = { id: string; title: string; votes: number; status: string }
export default function Page() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All games')
  const [favorites, setFavorites] = useState<string[]>([])
  const [activeGame, setActiveGame] = useState<Game | null>(null)
  const [published, setPublished] = useState<Game[]>([])
  const [spotIdx, setSpotIdx] = useState(0)
  const [view, setView] = useState<'shelves'|'grid'>('shelves')
  const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>([])
  // 10 features state
  const [theme, setTheme] = useState<'dark'|'light'>('dark')
  const [online, setOnline] = useState(true)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [installable, setInstallable] = useState(false)
  const [playCounts, setPlayCounts] = useState<Record<string,number>>({})
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [requestVotes, setRequestVotes] = useState<string[]>([])
  const [newReqTitle, setNewReqTitle] = useState('')
  const [leaderTab, setLeaderTab] = useState<'today'|'week'>('today')
  const [authUser, setAuthUser] = useState<{id:string; username:string}|null>(null)
  const [showAuth, setShowAuth] = useState<null|'login'|'register'|'reset'>(null)
  const [authForm, setAuthForm] = useState({ username:'', password:'', favoriteFood:'', newPassword:'' })
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sortBy, setSortBy] = useState<'featured'|'popular'|'newest'|'az'>('featured')
  const [visibleCount, setVisibleCount] = useState(36)
  const [hideLow, setHideLow] = useState(false)
  const [showStaffOnly, setShowStaffOnly] = useState(false)
  const [showAchievementsHub, setShowAchievementsHub] = useState(false)
  const [achSummary, setAchSummary] = useState<{total:number, unlocked:number, points:number} | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [dbMode, setDbMode] = useState<'postgres'|'local'|null>(null)

  const featuredGames = useMemo(()=> games.filter(g=> FEATURED_IDS.includes(g.id)), [])

  useEffect(() => {
    const id = setInterval(()=> setSpotIdx(i=> (i+1)%featuredGames.length), 5000)
    return ()=> clearInterval(id)
  }, [featuredGames.length])

  useEffect(() => {
    fetch('/api/games')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { games?: PublishedListing[] } | null) => {
        if (!d?.games) return
        setPublished(
          d.games.map((g, i) => ({
            id: 'pub-' + g.id,
            title: g.title,
            subtitle: 'Community upload.',
            description: 'Published by the lounge community.',
            genre: 'Community',
            tone: 'Fresh',
            mark: g.title.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'GG',
            color: pubColors[i % pubColors.length],
            path: '/games/' + g.id,
            icon: g.icon || undefined,
          })),
        )
      })
      .catch(() => {})
  }, [])

  // Load favorites from localStorage + theme + playCounts + requests votes
  useEffect(()=>{
    try{
      const f = JSON.parse(localStorage.getItem('ggl_fav')||'[]')
      if(Array.isArray(f)) setFavorites(f)
      const r = JSON.parse(localStorage.getItem('ggl_recent')||'[]')
      if(Array.isArray(r)) setRecentlyPlayed(r)
      const th = localStorage.getItem('ggl_theme') as 'dark'|'light'|null
      if(th) setTheme(th)
      const pc = JSON.parse(localStorage.getItem('ggl_playcounts')||'{}')
      if(pc && typeof pc==='object') setPlayCounts(pc)
      const rv = JSON.parse(localStorage.getItem('ggl_req_votes')||'[]')
      if(Array.isArray(rv)) setRequestVotes(rv)
    }catch{}
    setOnline(typeof navigator!=='undefined' ? navigator.onLine : true)
    const onOnline=()=> setOnline(true)
    const onOffline=()=> setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const onInstallable = ()=> setInstallable(true)
    window.addEventListener('ggl:installable', onInstallable as any)
    const dp = (window as any).__gglDeferredPrompt
    if(dp) { setInstallPrompt(dp); setInstallable(true) }
    const handler = (e:any)=>{ e.preventDefault(); setInstallPrompt(e); setInstallable(true) }
    window.addEventListener('beforeinstallprompt', handler as any)
    return ()=> { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.removeEventListener('ggl:installable', onInstallable as any); window.removeEventListener('beforeinstallprompt', handler as any) }
  },[])
  useEffect(()=>{ try{localStorage.setItem('ggl_fav', JSON.stringify(favorites))}catch{} },[favorites])
  useEffect(()=>{ try{localStorage.setItem('ggl_recent', JSON.stringify(recentlyPlayed.slice(0,12)))}catch{} },[recentlyPlayed])
  useEffect(()=>{ try{ localStorage.setItem('ggl_playcounts', JSON.stringify(playCounts))}catch{}},[playCounts])
  useEffect(()=>{ try{ localStorage.setItem('ggl_req_votes', JSON.stringify(requestVotes))}catch{}},[requestVotes])
  useEffect(()=>{ try{ localStorage.setItem('ggl_theme', theme); document.documentElement.setAttribute('data-theme', theme); }catch{}},[theme])
  // auth: fetch me
  useEffect(()=>{
    fetch('/api/auth/me').then(r=> r.ok? r.json():null).then((d:any)=> { if(d?.user) setAuthUser(d.user) }).catch(()=>{})
  },[])
  // achievements summary (CrazyGames-style)
  useEffect(()=>{
    if(!authUser){ setAchSummary(null); return }
    fetch('/api/achievements/stats').then(r=> r.ok? r.json():null).then((d:any)=>{
      if(d?.signedIn) setAchSummary({ total: d.total||0, unlocked: d.totalUnlocked||0, points: d.totalPoints||0 })
    }).catch(()=>{})
  }, [authUser])
  useEffect(()=>{
    const h=()=> setShowAuth('login')
    window.addEventListener('ggl:open-auth' as any, h as any)
    return ()=> window.removeEventListener('ggl:open-auth' as any, h as any)
  }, [])
  // detect DB mode for warning (if local JSON, guest data is ephemeral)
  useEffect(()=>{
    fetch('/api/achievements').then(r=> {
      const mode = r.headers.get('x-db-mode') as any
      if(mode) setDbMode(mode)
      return r.json()
    }).catch(()=>{})
    fetch('/api/gate').then(r=> {
      const m = r.headers.get('x-db-mode')
      if(m) setDbMode(m as any)
    }).catch(()=>{})
  },[])

  // anonymous id for cloud sync + username-linked cloud (favorites sync across devices)
  const anonIdRef = useRef<string>('')
  useEffect(()=>{
    try{
      let id = localStorage.getItem('ggl_anon_id')
      if(!id){ id='anon_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36); localStorage.setItem('ggl_anon_id', id) }
      anonIdRef.current=id
      // load cloud state and merge (cloud wins if newer) — anon
      fetch('/api/user-state?id='+encodeURIComponent(id)).then(r=> r.ok? r.json():null).then((d:any)=>{
        if(d?.state){
          const s=d.state
          if(Array.isArray(s.favorites) && s.favorites.length> favorites.length) setFavorites(s.favorites)
          if(s.playCounts && Object.keys(s.playCounts).length> Object.keys(playCounts).length) setPlayCounts(s.playCounts)
          if(Array.isArray(s.recentlyPlayed) && s.recentlyPlayed.length> recentlyPlayed.length) setRecentlyPlayed(s.recentlyPlayed.slice(0,12))
        }
      }).catch(()=>{})
    }catch{}
  },[])
  // when signed in, also load/merge username cloud state (this is what saves progress across devices with username)
  useEffect(()=>{
    if(!authUser?.id) return
    fetch('/api/user-state?id='+encodeURIComponent(authUser.id)).then(r=> r.ok? r.json():null).then((d:any)=>{
      if(d?.state){
        const s=d.state
        // merge: union favorites, max playCounts, union recentlyPlayed
        if(Array.isArray(s.favorites) && s.favorites.length){
          setFavorites(prev=> Array.from(new Set([...prev, ...s.favorites])))
        }
        if(s.playCounts && Object.keys(s.playCounts).length){
          setPlayCounts(prev=> { const m={...prev}; for(const k of Object.keys(s.playCounts)){ m[k]=Math.max(m[k]||0, s.playCounts[k]||0) }; return m })
        }
        if(Array.isArray(s.recentlyPlayed) && s.recentlyPlayed.length){
          setRecentlyPlayed(prev=> Array.from(new Set([...s.recentlyPlayed, ...prev])).slice(0,12))
        }
      }
    }).catch(()=>{})
  },[authUser?.id])
  // sync to cloud debounced — anon + signed-in user (progress saves across devices via username)
  useEffect(()=>{
    const anon = anonIdRef.current || (typeof localStorage!=='undefined' ? localStorage.getItem('ggl_anon_id') : '')
    const ids = [anon, authUser?.id].filter(Boolean) as string[]
    if(ids.length===0) return
    const h = setTimeout(()=>{
      for(const id of ids) fetch('/api/user-state', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id, favorites, playCounts, recentlyPlayed })}).catch(()=>{})
    }, 1200)
    return ()=> clearTimeout(h)
  },[favorites, playCounts, recentlyPlayed, authUser])

  // keyboard shortcut: '/' focuses search, Esc closes modal (a11y)
  useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{
      const tag = (e.target as HTMLElement)?.tagName
      if(tag==='INPUT' || tag==='TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if(e.key==='/' && !e.ctrlKey && !e.metaKey){ e.preventDefault(); const el=document.getElementById('main-search'); el?.focus() }
      if(e.key==='Escape'){ setActiveGame(null); setShowAuth(null); setShowAchievementsHub(false); setMobileNavOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[])

    // debounce search 300ms
  useEffect(()=>{
    const id=setTimeout(()=> setDebouncedQuery(query), 280)
    return ()=> clearTimeout(id)
  },[query])
  useEffect(()=>{ setVisibleCount(36) },[debouncedQuery, filter, sortBy, hideLow, showStaffOnly])
  // fetch requests for upvote list
  useEffect(()=>{
    fetch('/api/game-requests').then(r=> r.ok? r.json(): null).then((d:any)=>{
      if(d?.requests) setRequests(d.requests.map((x:any)=> ({ id:String(x.id), title:x.title||x.game||x.name||'Unknown', votes: Number(x.votes||x.upvotes||0), status: x.status||'pending'})))
    }).catch(()=>{})
  },[])

  const allGames = useMemo(() => [...games, ...published], [published])
  // Fix 1: precomputed search index to avoid re-concatting strings on every keystroke
  const searchIndex = useMemo(() => new Map(allGames.map((g) => [g.id, `${g.title} ${g.genre} ${g.tone} ${g.description}`.toLowerCase()] as const)), [allGames])
  const visibleGames = useMemo(
    () => {
      const q = debouncedQuery.toLowerCase()
      let base = allGames.filter((game) => {
        const hay = searchIndex.get(game.id) || ''
        return hay.includes(q) && (filter === 'All games' || game.genre === filter || (filter === 'Favorites' && favorites.includes(game.id)))
      })
      if (hideLow) base = base.filter(g=> !LOW_QUALITY_HINTS.has(g.id))
      if (showStaffOnly) base = base.filter(g=> STAFF_PICKS.includes(g.id))
      // sorting
      if (sortBy==='popular') base = [...base].sort((a,b)=> (playCounts[b.id]||0) - (playCounts[a.id]||0))
      else if (sortBy==='az') base = [...base].sort((a,b)=> a.title.localeCompare(b.title))
      else if (sortBy==='newest') base = [...base].reverse()
      // featured first when default
      else base = [...base].sort((a,b)=> (b.featured?1:0) - (a.featured?1:0))
      return base
    },
    [allGames, favorites, filter, debouncedQuery, playCounts, sortBy, hideLow, showStaffOnly],
  )
  const paginatedGames = useMemo(()=> visibleGames.slice(0, visibleCount), [visibleGames, visibleCount])

  // Fix 6: shelves grouping only when actually showing shelves (avoid wasted 192 scan in grid/search)
  const grouped = useMemo(()=>{
    if (view !== 'shelves' || filter !== 'All games' || debouncedQuery) return [] as [string, Game[]][]
    const map: Record<string, Game[]> = {}
    for(const g of visibleGames){
      const k = g.genre
      if(!map[k]) map[k]=[]
      map[k].push(g)
    }
    return Object.entries(map).sort((a,b)=> b[1].length - a[1].length)
  }, [visibleGames, view, filter, debouncedQuery])
  const staffGames = useMemo(()=> allGames.filter(g=> STAFF_PICKS.includes(g.id)), [allGames])

  const spotlight = featuredGames[spotIdx] || games[0]
  const gameOfDay = useMemo(()=> {
    const idx = gameOfDayIndex(allGames.length)
    return allGames[idx] || games[0]
  }, [allGames])
  const filterCounts = useMemo(()=>{
    const q = query.toLowerCase()
    const m: Record<string,number>={}
    for(const f of filters){
      if(f==='All games') m[f]= allGames.filter(g=> (searchIndex.get(g.id)||'').includes(q)).length
      else if(f==='Favorites') m[f]= allGames.filter(g=> favorites.includes(g.id) && (searchIndex.get(g.id)||'').includes(q)).length
      else m[f]= allGames.filter(g=> g.genre===f && (searchIndex.get(g.id)||'').includes(q)).length
    }
    return m
  }, [allGames, favorites, query, searchIndex])
  // Leaderboard: server-side, only signed-in users count (per user request)
  const [serverLeaderboard, setServerLeaderboard] = useState<{gameId:string,count:number}[]>([])
  useEffect(()=>{
    let alive=true
    fetch('/api/leaderboard?limit=5').then(r=> r.ok? r.json(): null).then((d:any)=>{
      if(!alive) return
      if(d?.leaderboard && Array.isArray(d.leaderboard)) setServerLeaderboard(d.leaderboard)
    }).catch(()=>{})
    const id=setInterval(()=>{
      fetch('/api/leaderboard?limit=5').then(r=> r.ok? r.json(): null).then((d:any)=>{
        if(!alive) return
        if(d?.leaderboard) setServerLeaderboard(d.leaderboard)
      }).catch(()=>{})
    }, 30000)
    return ()=> { alive=false; clearInterval(id)}
  }, [playCounts, authUser]) // refresh when you play or auth changes
  const leaderboard = useMemo(()=>{
    if(serverLeaderboard.length>0){
      const map = new Map(allGames.map(g=> [g.id, g] as const))
      const rows = serverLeaderboard.map(r=> {
        const g = map.get(r.gameId)
        return g ? { game:g, count:r.count } : null
      }).filter(Boolean) as {game:typeof allGames[number], count:number}[]
      if(rows.length>0) return rows.slice(0,5)
    }
    // Fallback to local playCounts until server has data, but only show if you are signed in — guests see featured
    if(!authUser) return featuredGames.slice(0,5).map((g,i)=> ({ game:g, count: 0}))
    const entries = allGames.map(g=> ({ game:g, count: playCounts[g.id]||0})).sort((a,b)=> b.count - a.count).slice(0,5)
    if(entries.every(e=> e.count===0)) return featuredGames.slice(0,5).map((g,i)=> ({ game:g, count: 0}))
    return entries
  }, [allGames, playCounts, serverLeaderboard, authUser, featuredGames])
  // JSON-LD for SEO - top games as ItemList
  function highlight(text:string, q:string){
    if(!q) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if(idx===-1) return text
    const before = text.slice(0, idx)
    const match = text.slice(idx, idx+q.length)
    const after = text.slice(idx+q.length)
    // return JSX fragments via split render in caller — this helper returns parts
    return ({ before, match, after } as any)
  }
  function Highlighted({ text, query }: { text:string; query:string }){
    if(!query) return <>{text}</>
    const lower=text.toLowerCase(), q=query.toLowerCase()
    const i=lower.indexOf(q)
    if(i===-1) return <>{text}</>
    return <>{text.slice(0,i)}<mark className="hl">{text.slice(i,i+q.length)}</mark>{text.slice(i+q.length)}</>
  }

  const jsonLd = useMemo(()=> ({
    '@context':'https://schema.org',
    '@type':'ItemList',
    name:'GG-Lounge Games',
    itemListElement: allGames.slice(0,20).map((g,i)=> ({
      '@type':'ListItem',
      position:i+1,
      name:g.title,
      description:g.description,
      url: typeof window!=='undefined' ? window.location.origin + '/#'+g.id : '/#'+g.id,
    }))
  }), [allGames])

  function launch(game: Game) {
    setActiveGame(game)
    setRecentlyPlayed(prev=> [game.id, ...prev.filter(x=> x!==game.id)].slice(0,12))
    setPlayCounts(prev=> ({ ...prev, [game.id]: (prev[game.id]||0)+1 }))
    try{ fetch('/api/visit', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ gameId: game.id }) }).catch(()=>{}) }catch{}
  }
        function toggleFavorite(id: string) {
    setFavorites((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }
  function shufflePick(){
    const pool = visibleGames.length? visibleGames: allGames
    const pick = pool[Math.floor(Math.random()*pool.length)]
    if(pick) launch(pick)
  }
  function toggleTheme(){ setTheme(t=> t==='dark'?'light':'dark') }
  async function doInstall(){
    const dp:any = installPrompt || (window as any).__gglDeferredPrompt
    if(dp && dp.prompt){ try{ dp.prompt(); const r= await dp.userChoice; if(r) { setInstallable(false); setInstallPrompt(null); (window as any).__gglDeferredPrompt=null } }catch{} return }
    // fallback: hint
    alert('To install: open browser menu → Install app / Add to Home Screen')
  }
    async function submitRequest(){
    const title = newReqTitle.trim()
    if(!title) return
    const optimistic = { id: 'local-'+Date.now(), title, votes:1, status:'pending'}
    setRequests(r=> [optimistic, ...r].slice(0,20))
    setRequestVotes(v=> [...v, optimistic.id])
    setNewReqTitle('')
    try{
      const res = await fetch('/api/game-requests', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ title })})
      if(res.ok){ const d= await res.json(); if(d?.request) setRequests(r=> r.map(x=> x.id===optimistic.id ? { id:String(d.request.id), title:d.request.title, votes: Number(d.request.votes||1), status:d.request.status||'pending'}: x)) }
    }catch{}
  }
  async function upvoteRequest(id:string){
    if(requestVotes.includes(id)) return
    setRequestVotes(v=> [...v, id])
    setRequests(rs=> rs.map(r=> r.id===id? {...r, votes:r.votes+1}: r))
    try{ await fetch('/api/game-requests/'+id+'/upvote', { method:'POST' }).catch(()=> fetch('/api/game-requests', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ upvoteId:id })})) }catch{}
    // fallback local
    try{ await fetch('/api/report', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ upvoteRequestId:id })}) }catch{}
  }
  function openProxyTile(url:string){ window.location.href = '/proxy?url='+encodeURIComponent(url) }
  function copyGameLink(path:string){ try{ navigator.clipboard.writeText(location.origin+path); }catch{} }
  // autosave now handled inside GameModal (Fix 3+5)
  async function doAuth(mode:'login'|'register'|'reset'){
    setAuthError(''); setAuthLoading(true)
    try{
      let url='', body:any={}
      if(mode==='login'){ url='/api/auth/login'; body={ username: authForm.username, password: authForm.password } }
      else if(mode==='register'){ url='/api/auth/register'; body={ username: authForm.username, password: authForm.password, favoriteFood: authForm.favoriteFood } }
      else { url='/api/auth/reset'; body={ username: authForm.username, favoriteFood: authForm.favoriteFood, newPassword: authForm.newPassword } }
      const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
      const d = await r.json().catch(()=> ({}))
      if(!r.ok) throw new Error(d.error || 'Failed')
      if(mode==='reset'){ setShowAuth('login'); setAuthError('Password reset — now log in.'); return }
      // fetch me
      const me = await fetch('/api/auth/me').then(x=> x.json()).catch(()=>null)
      if(me?.user) setAuthUser(me.user)
      setShowAuth(null); setAuthForm({ username:'', password:'', favoriteFood:'', newPassword:'' })
    }catch(e:any){ setAuthError(e.message || 'Error') } finally{ setAuthLoading(false) }
  }
  async function doLogout(){
    await fetch('/api/auth/logout', { method:'POST' }).catch(()=>{})
    setAuthUser(null)
  }


  return (
    <main className="lounge-shell">
      <ErrorBoundary>
      <a href="#games" className="sr-only focus:not-sr-only" style={{position:'absolute',left:12,top:12,zIndex:50,padding:'8px 12px',background:'var(--lime)',color:'#0b0d12',borderRadius:999,fontWeight:900}}>Skip to games</a>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}} />
      <div className="noise" aria-hidden="true" />
      <header className="site-header">
        <a href="#top" className="brand" aria-label="GG-Lounge home">
          <span className="brand-mark">
            <Gamepad2 size={19} />
          </span>
          <span>
            GG-LOUNGE<span className="tm">™</span>
          </span>
        </a>
        <button className="mobile-toggle" aria-label="Open menu" aria-expanded={mobileNavOpen} onClick={()=> setMobileNavOpen(v=>!v)}>{mobileNavOpen ? <X size={16}/> : <Menu size={16}/>}</button>
        <nav className={`header-nav ${mobileNavOpen?'mobile-open':''}`} aria-label="Primary navigation">
          <a href="#games" onClick={()=> setMobileNavOpen(false)}>Library</a>
          <a href="/apps" onClick={()=> setMobileNavOpen(false)}>Apps</a>
          <a href="/proxy" onClick={()=> setMobileNavOpen(false)}>Proxy</a>
          <button onClick={()=> { setShowAchievementsHub(true); setMobileNavOpen(false) }} style={{background:'none',border:0,cursor:'pointer',font: 'inherit',color:'inherit',display:'flex',alignItems:'center',gap:6,fontWeight:800}}><Trophy size={12}/> Achievements</button>
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
      {showAuth && (
        <AuthDialog
          mode={showAuth}
          form={authForm}
          setForm={setAuthForm}
          error={authError}
          loading={authLoading}
          onAction={() => doAuth(showAuth === 'register' ? 'register' : showAuth === 'reset' ? 'reset' : 'login')}
          onClose={() => setShowAuth(null)}
          onSwitch={setShowAuth}
        />
      )}
      {!online && <div role="status" aria-live="polite" style={{margin:'10px 18px 0',padding:'10px 14px',borderRadius:12,background:'rgba(255,92,92,.12)',border:'1px solid rgba(255,92,92,.3)',display:'flex',alignItems:'center',gap:8,color:'var(--foreground)',fontSize:13}}><WifiOff size={16}/> You’re offline — your games still work, browsing will resume when you’re back online.</div>}
      {dbMode==='local' && !authUser && <div role="note" style={{margin:'10px 18px 0',padding:'10px 14px',borderRadius:12,background:'rgba(255,190,70,.14)',border:'1px solid rgba(255,190,70,.3)',display:'flex',alignItems:'center',gap:8,color:'var(--foreground)',fontSize:12}}><AlertCircle size={14}/> Guest mode: progress saves locally. <button onClick={()=> setShowAuth('register')} style={{marginLeft:4, textDecoration:'underline', background:'none', border:0, color:'var(--foreground)', fontWeight:800, cursor:'pointer'}}>Sign in to keep it forever</button> — survives deploys.</div>}
      {installable && <div style={{margin:'12px 18px 0',padding:'12px 14px',borderRadius:14,background:'linear-gradient(135deg, rgba(204,255,0,.18), rgba(0,242,234,.14))',border:'1px solid rgba(204,255,0,.35)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <span style={{display:'flex',alignItems:'center',gap:10,fontWeight:800,fontSize:13}}><span style={{width:32,height:32,borderRadius:999,background:'var(--lime)',display:'grid',placeItems:'center',color:'#0b0d12'}}><Download size={16}/></span> Install GG Lounge — play offline & launch like an app</span>
        <span style={{display:'flex',gap:8}}><button onClick={doInstall} style={{padding:'8px 14px',borderRadius:999,background:'#0b0d12',color:'#fff',border:'1px solid rgba(255,255,255,.15)',fontWeight:800,cursor:'pointer'}}>Install</button><button onClick={()=> setInstallable(false)} style={{padding:'8px 10px',borderRadius:999,background:'transparent',border:'1px solid var(--line)',color:'var(--foreground)',cursor:'pointer'}}>Dismiss</button></span>
      </div>}
      <section className="hero" id="top" style={{position:"relative", overflow:"hidden", background:"radial-gradient(600px 400px at 15% 10%, rgba(125,107,255,.14), transparent 60%), radial-gradient(700px 500px at 85% 15%, rgba(215,243,74,.12), transparent 60%), radial-gradient(500px 400px at 50% 90%, rgba(255,108,131,.08), transparent 60%), var(--background)"}}>
        <div className="hero-copy">
          <p className="eyebrow">
            <Sparkles size={14} /> THE INDEPENDENT ARCADE
          </p>
          <h1>
            Stay a while.
            <br />
            <em>Play forever.</em>
          </h1>
          <p className="hero-text">A handpicked, no-filler collection of browser games for the minutes between everything.</p>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}>
            <a className="hero-link" href="#games">
              Enter the lounge <ArrowUpRight size={15} />
            </a>
            <button onClick={shufflePick} className="btn-ghost" style={{padding:'8px 14px',fontSize:13}}>
              <Shuffle size={14}/> Surprise me
            </button>
            <button onClick={()=> launch(gameOfDay)} style={{padding:'8px 12px',borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.06)',color:'var(--foreground)',fontWeight:800,fontSize:12,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
              <Gift size={14}/> Game of the Day: {gameOfDay.title}
            </button>
          </div>
          <div className="hero-stats" style={{gap:18, padding:'12px 16px', borderRadius:999, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.06)', backdropFilter:'blur(8px)', display:'inline-flex', width:'fit-content', marginTop:22}}>
            <span>
              <strong>{allGames.length}</strong> games
            </span>
            <span>
              <strong>∞</strong> replay value
            </span>
            <span>
              <strong>01</strong> lounge
            </span>
          </div>
        </div>
        <div className="spotlight">
          <div className="spotlight-top">
            <span>SPOTLIGHT / {(String(spotIdx+1).padStart(2,'0'))}</span>
            <span className="spotlight-tag">FEATURED</span>
          </div>
          <div className="spotlight-art" onClick={()=> launch(spotlight)} role="button" tabIndex={0} onKeyDown={e=> e.key==='Enter'&&launch(spotlight)} style={{cursor:'pointer', overflow:'hidden', borderRadius:16, position:'relative'}}>
            {spotlight.icon ? (
              <img src={spotlight.icon} alt={spotlight.title} style={{position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:.9}} onError={(e)=> (e.currentTarget.style.display='none')} />
            ) : null}
            <div style={{position:'absolute', inset:0, background:'linear-gradient(180deg, transparent 30%, rgba(0,0,0,.55) 100%)'}}/>
            <div className="orbit orbit-a" style={{opacity:.5}} />
            <div className="orbit orbit-b" style={{opacity:.4}} />
            <span className="spotlight-mark" style={{position:'relative', zIndex:1, textShadow:'0 4px 20px rgba(0,0,0,.45)'}}>{spotlight.mark}</span>
            <span className="spotlight-caption" style={{zIndex:1, background:'rgba(0,0,0,.32)', padding:'6px 10px', borderRadius:999, border:'1px solid rgba(255,255,255,.14)', backdropFilter:'blur(6px)'}}>
              {spotlight.tone.toUpperCase()}<br/>{spotlight.genre.toUpperCase()}
            </span>
          </div>
          <div className="spotlight-bottom">
            <div>
              <p className="card-kicker">{spotlight.genre} · {spotlight.tone}</p>
              <h2>{spotlight.title}</h2>
              <p>{spotlight.subtitle}</p>
            </div>
            <button className="circle-play" onClick={() => launch(spotlight)} aria-label={`Play ${spotlight.title}`}>
              <Play size={18} fill="currentColor" />
            </button>
          </div>
          <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:10}}>
            {featuredGames.map((_,i)=> <span key={i} style={{width: i===spotIdx?22:8,height:6,borderRadius:99,background: i===spotIdx?'var(--lime)':'rgba(255,255,255,.22)',transition:'all .3s',display:'block'}}/>)}
          </div>
        </div>
      </section>

      {/* Game of the Day + Proxy Quick Bar */}
      <section className="catalog" style={{paddingTop:14,paddingBottom:6}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',gap:14}}>
          <div style={{border:'1px solid var(--line)',borderRadius:16,overflow:'hidden',background:'linear-gradient(135deg, rgba(204,255,0,.14), rgba(126,91,255,.14))',padding:14,display:'flex',gap:14,alignItems:'center'}}>
            <div style={{width:64,height:64,borderRadius:14,background:'var(--panel)',border:'1px solid var(--line)',display:'grid',placeItems:'center',fontWeight:900,fontSize:22,flexShrink:0}}>{gameOfDay.mark}</div>
            <div style={{minWidth:0,flex:1}}>
              <p className="eyebrow" style={{margin:0,fontSize:10,letterSpacing:'.14em',display:'flex',alignItems:'center',gap:6}}><Crown size={12}/> GAME OF THE DAY — {new Date().toLocaleDateString('en-AU',{month:'short',day:'numeric'})}</p>
              <h3 style={{margin:'4px 0 2px',fontSize:18,letterSpacing:'-0.03em'}}>{gameOfDay.title}</h3>
              <p style={{margin:0,color:'var(--muted)',fontSize:13,lineHeight:1.4}}>{gameOfDay.subtitle} · {gameOfDay.genre} · {gameOfDay.tone}</p>
            </div>
            <button onClick={()=> launch(gameOfDay)} style={{padding:'10px 16px',borderRadius:999,background:'var(--lime)',color:'#0b0d12',border:'1px solid var(--lime)',fontWeight:900,cursor:'pointer',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}><Play size={14} fill="currentColor"/> Play now</button>
          </div>
          <div style={{border:'1px solid var(--line)',borderRadius:16,overflow:'hidden',background:'var(--panel)',padding:12}}>
            <p className="eyebrow" style={{margin:'0 0 10px',fontSize:10,display:'flex',alignItems:'center',gap:6}}><Globe size={12}/> PROXY QUICK-BAR — open anywhere</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
              {PROXY_TILES.map(tile=> (
                <button key={tile.id} onClick={()=> openProxyTile(tile.url)} style={{border:'1px solid var(--line)',borderRadius:12,padding:'12px 8px',background:'rgba(255,255,255,.04)',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:6, textAlign:'center'}}>
                  <span style={{width:36,height:36,borderRadius:999,background: tile.color, color:'#fff', display:'grid',placeItems:'center',fontWeight:900,fontSize:16}}>{tile.icon}</span>
                  <strong style={{fontSize:12,lineHeight:1}}>{tile.label}</strong>
                  <span style={{fontSize:10,color:'var(--muted)'}}>{tile.sub}</span>
                </button>
              ))}
            </div>
            <a href="/proxy" style={{display:'inline-flex',alignItems:'center',gap:6,marginTop:10,fontSize:12,fontWeight:700,color:'var(--foreground)',textDecoration:'none'}}>Open Proxy <ArrowUpRight size={12}/></a>
          </div>
        </div>
      </section>

      {/* Leaderboard + Your Lounge */}
      <section className="catalog" style={{paddingTop:8,paddingBottom:6}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))',gap:14}}>
          <div style={{border:'1px solid var(--line)',borderRadius:16,background:'var(--panel)',padding:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <p className="eyebrow" style={{margin:0,display:'flex',alignItems:'center',gap:6}}><Flame size={12}/> LEADERBOARD — most played <span style={{fontSize:9, padding:'3px 7px', borderRadius:999, background: authUser? 'rgba(34,197,94,.14)':'rgba(255,92,92,.12)', border: authUser? '1px solid rgba(34,197,94,.25)':'1px solid rgba(255,92,92,.22)', color: authUser? '#22c55e':'#ff8f8f', letterSpacing:'.06em'}}>{authUser? 'SIGNED-IN ONLY' : 'SIGN IN TO COUNT'}</span></p>
              <span style={{display:'flex',gap:6}}>
                <button onClick={()=> setLeaderTab('today')} style={{padding:'5px 9px',borderRadius:999,border: leaderTab==='today'?'1px solid var(--lime)':'1px solid var(--line)',background: leaderTab==='today'?'var(--lime)':'transparent',color: leaderTab==='today'?'#0b0d12':'var(--foreground)',fontWeight:800,fontSize:11,cursor:'pointer'}}>Today</button>
                <button onClick={()=> setLeaderTab('week')} style={{padding:'5px 9px',borderRadius:999,border: leaderTab==='week'?'1px solid var(--lime)':'1px solid var(--line)',background: leaderTab==='week'?'var(--lime)':'transparent',color: leaderTab==='week'?'#0b0d12':'var(--foreground)',fontWeight:800,fontSize:11,cursor:'pointer'}}>Week</button>
              </span>
            </div>
            {!authUser && <div style={{padding:'8px 12px', borderRadius:10, background:'rgba(255,92,92,.08)', border:'1px solid rgba(255,92,92,.15)', fontSize:11, display:'flex',alignItems:'center',gap:6, marginBottom:8}}><ShieldCheck size={12} color="#ff8f8f"/> Sign in to have your plays count on the global leaderboard — guest plays are not ranked.</div>}
            <div style={{display:'grid',gap:8}}>
              {leaderboard.map((e,i)=> (
                <button key={e.game.id} onClick={()=> launch(e.game)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 10px',borderRadius:12,border:'1px solid var(--line)',background:'rgba(255,255,255,.03)',cursor:'pointer',textAlign:'left', transition:'transform .2s, border-color .2s'}}>
                  <span style={{width:28,height:28,borderRadius:999,background: i===0?'var(--lime)': i===1?'#cbd5e1': i===2?'#fdba74':'rgba(255,255,255,.08)',color: i<3?'#0b0d12':'var(--foreground)',display:'grid',placeItems:'center',fontWeight:900,fontSize:12, boxShadow: i===0? '0 4px 14px rgba(215,243,74,.35)':''}}>{i+1}</span>
                  {e.game.icon ? <img src={e.game.icon} alt="" style={{width:36,height:36,borderRadius:10,objectFit:'cover', flexShrink:0, border:'1px solid rgba(255,255,255,.12)'}} onError={(ev)=> (ev.currentTarget.style.display='none')} /> : <span style={{width:36,height:36,borderRadius:10,background:'var(--line)',display:'grid',placeItems:'center',fontWeight:900,fontSize:12,flexShrink:0}}>{e.game.mark}</span>}
                  <span style={{flex:1,minWidth:0}}><strong style={{display:'block',fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.game.title}</strong><span style={{fontSize:11,color:'var(--muted)'}}>{e.game.genre} · {e.count} plays</span></span>
                  <Play size={14} fill="currentColor"/>
                </button>
              ))}
            </div>
          </div>
          <div style={{border:'1px solid var(--line)',borderRadius:16,background:'var(--panel)',padding:14}}>
            <p className="eyebrow" style={{margin:'0 0 10px',display:'flex',alignItems:'center',gap:6}}><Star size={12}/> YOUR LOUNGE — favorites & history</p>
            {favorites.length===0 && recentlyPlayed.length===0 && <p style={{color:'var(--muted)',fontSize:13}}>Favorite games with ♥ and they’ll live here. Played games appear in history automatically.</p>}
            {favorites.length>0 && <>
              <p style={{fontSize:12,fontWeight:800,margin:'0 0 8px',display:'flex',alignItems:'center',gap:6}}><Heart size={12} fill="var(--coral)" color="var(--coral)"/> Favorites ({favorites.length})</p>
              <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:8,scrollbarWidth:'none'}}>
                {allGames.filter(g=> favorites.includes(g.id)).map(g=> (
                  <button key={g.id} onClick={()=> launch(g)} style={{minWidth:120,border:'1px solid var(--line)',borderRadius:12,padding:10,background:'rgba(255,255,255,.04)',cursor:'pointer',textAlign:'left',flexShrink:0}}>
                    <span style={{width:28,height:28,borderRadius:8,background:'var(--lime)',color:'#0b0d12',display:'grid',placeItems:'center',fontWeight:900,fontSize:12}}>{g.mark}</span>
                    <strong style={{display:'block',marginTop:6,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.title}</strong>
                    <span style={{fontSize:10,color:'var(--muted)'}}>{g.genre}</span>
                  </button>
                ))}
              </div>
            </>}
            {recentlyPlayed.length>0 && <>
              <p style={{fontSize:12,fontWeight:800,margin:'10px 0 8px',display:'flex',alignItems:'center',gap:6}}><Timer size={12}/> Recent ({recentlyPlayed.length})</p>
              <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4,scrollbarWidth:'none'}}>
                {allGames.filter(g=> recentlyPlayed.includes(g.id)).slice(0,8).map(g=> (
                  <button key={g.id} onClick={()=> launch(g)} style={{minWidth:120,border:'1px solid var(--line)',borderRadius:12,padding:10,background:'rgba(255,255,255,.04)',cursor:'pointer',textAlign:'left',flexShrink:0}}>
                    <span style={{width:28,height:28,borderRadius:8,background:'var(--line)',display:'grid',placeItems:'center',fontWeight:900,fontSize:12}}>{g.mark}</span>
                    <strong style={{display:'block',marginTop:6,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.title}</strong>
                    <span style={{fontSize:10,color:'var(--muted)'}}>{g.genre}</span>
                  </button>
                ))}
              </div>
              <button onClick={()=> setRecentlyPlayed([])} style={{marginTop:8,fontSize:11,background:'none',border:0,color:'var(--muted)',textDecoration:'underline',cursor:'pointer'}}>Clear history</button>
            </>}
          </div>
        </div>
      </section>


      {/* Achievements Teaser — insane UI */}
      <section className="catalog" style={{paddingTop:8,paddingBottom:10}}>
        <div style={{border:'1px solid var(--line)', borderRadius:18, overflow:'hidden', background:'linear-gradient(135deg, rgba(125,107,255,.12), rgba(215,243,74,.10), rgba(255,108,131,.06)), var(--panel)', padding:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'14px 16px',flexWrap:'wrap',borderBottom:'1px solid var(--line)'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <span style={{width:40,height:40,borderRadius:12,display:'grid',placeItems:'center',background:'linear-gradient(135deg, var(--lime), #7dd3ff)',color:'#0b0d12'}}><Trophy size={18}/></span>
              <div>
                <div style={{fontSize:14,fontWeight:950,letterSpacing:'-.01em',display:'flex',alignItems:'center',gap:8}}>Achievements <span style={{fontSize:10,padding:'3px 7px',borderRadius:999,background:'var(--lime)',color:'#0b0d12',fontWeight:900}}>{authUser ? `${achSummary?.unlocked||0} UNLOCKED` : '30 GAMES • 180+ TROPHIES'}</span></div>
                <div style={{fontSize:11,color:'var(--muted)',fontWeight:700}}>{authUser ? `${achSummary?.points||0} points • synced to your username across devices` : 'Sign in to save progress like CrazyGames — guest can still see & earn preview.'}</div>
              </div>
            </div>
            <button onClick={()=> setShowAchievementsHub(true)} style={{padding:'9px 14px',borderRadius:999,background:'#0b0d12',color:'#fff',border:'1px solid rgba(255,255,255,.12)',fontWeight:900,fontSize:12,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}><Sparkles size={14}/> View all achievements <ArrowUpRight size={14}/></button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:10,padding:14}}>
            {[
              { id:'cookie-clicker', title:'Cookie Clicker', desc:'Bake 100k cookies, buy upgrades, hit 10 cookies/sec', icon:'🍪', color:'linear-gradient(135deg, #ffb86a, #ff6c83)' },
              { id:'ragdoll-archers', title:'Ragdoll Archers', desc:'Arrows fired, kills & 25 headshots — bow mastery', icon:'🏹', color:'linear-gradient(135deg, #7dd3ff, #7d6bff)' },
              { id:'solar-smash', title:'Solar Smash', desc:'Destroy 50 planets with lasers & black holes', icon:'🪐', color:'linear-gradient(135deg, #1a1a2e, #7d6bff)' },
              { id:'survival-race', title:'Survival Race', desc:'Survive 1000m, 5 races & 30s without crash', icon:'🏁', color:'linear-gradient(135deg, #ff6b6b, #ffd93d)' },
            ].map(card=> (
              <button key={card.id} onClick={()=> { const g=allGames.find(x=> x.id===card.id); if(g) launch(g); }} style={{textAlign:'left',padding:14,borderRadius:14,border:'1px solid var(--line)',background:'rgba(255,255,255,.03)',cursor:'pointer',display:'flex',gap:12,alignItems:'center'}}>
                <span style={{width:44,height:44,borderRadius:12,background:card.color,display:'grid',placeItems:'center',fontSize:18,flexShrink:0}}>{card.icon}</span>
                <span style={{flex:1,minWidth:0}}><strong style={{display:'block',fontSize:12}}>{card.title}</strong><span style={{fontSize:11,color:'var(--muted)',lineHeight:1.35}}>{card.desc}</span></span>
                <Play size={14} fill="currentColor" />
              </button>
            ))}
          </div>
          <div style={{padding:'0 14px 14px',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            {['Drive Mad','Slope','Retro Bowl','Stack','Moto X3M'].map(t=> (
              <span key={t} style={{fontSize:11,fontWeight:800,padding:'6px 10px',borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.04)'}}>{t} → trophies</span>
            ))}
            <span style={{fontSize:11,color:'var(--muted)',fontWeight:700}}>+ 22 more titles with epic & legendary racks</span>
          </div>
        </div>
      </section>

      {/* Recently played */}
      {recentlyPlayed.length>0 && (
        <section className="catalog" style={{paddingTop:8,paddingBottom:10}}>
          <div className="section-heading" style={{marginBottom:14}}>
            <div><p className="eyebrow">CONTINUE PLAYING</p><h3 style={{margin:'6px 0 0',fontSize:20,letterSpacing:'-0.04em'}}>Pick up where you left off</h3></div>
            <button onClick={()=> setRecentlyPlayed([])} style={{fontSize:12,color:'rgba(255,255,255,.5)',background:'none',border:0,cursor:'pointer',textDecoration:'underline'}}>Clear</button>
          </div>
          <div className="shelf-track">
            {allGames.filter(g=> recentlyPlayed.includes(g.id)).slice(0,12).map(g=> (
              <button key={g.id} className={`shelf-card ${g.color}`} onClick={()=> launch(g)}>
                <span className="shelf-mark">{g.mark}</span>
                <span className="shelf-title">{g.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="catalog" id="games">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE ARCADE FLOOR</p>
            <h2>Pick your poison<span>.</span></h2>
          </div>
          <div className="collection-note">
            <Trophy size={16} />
            <span><strong>{visibleGames.length.toString().padStart(2, '0')}</strong> available now</span>
          </div>
        </div>
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, genres, moods" aria-label="Search games" />
            {query!==debouncedQuery && <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:10,color:'var(--muted)',background:'var(--panel)',padding:'2px 6px',borderRadius:999,border:'1px solid var(--line)'}}>…</span>}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{display:'flex',gap:6,alignItems:'center',padding:'4px 6px',borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.04)'}}>
              <ListFilter size={12}/><span style={{fontSize:11,fontWeight:800}}>Sort</span>
              <select value={sortBy} onChange={e=> setSortBy(e.target.value as any)} aria-label="Sort games" style={{background:'transparent',color:'var(--foreground)',border:0,fontSize:12,fontWeight:700,outline:'none'}}>
                <option value="featured">Featured</option>
                <option value="popular">Most played</option>
                <option value="newest">Newest</option>
                <option value="az">A-Z</option>
              </select>
            </div>
            <div className="view-toggle" role="group" aria-label="View toggle">
              <button className={view==='shelves'?'active':''} onClick={()=> setView('shelves')} aria-label="Shelves view"><Rows3 size={16}/> Shelves</button>
              <button className={view==='grid'?'active':''} onClick={()=> setView('grid')} aria-label="Grid view"><LayoutGrid size={16}/> Grid</button>
            </div>
            <button onClick={shufflePick} className="btn-mini" title="Random game"><Shuffle size={14}/> Shuffle</button>
            <button onClick={()=> setHideLow(v=>!v)} aria-pressed={hideLow} title="Hide low quality duplicates" style={{padding:'6px 10px',borderRadius:999,border: hideLow?'1px solid var(--lime)':'1px solid var(--line)',background: hideLow?'var(--lime)':'rgba(255,255,255,.06)',color: hideLow?'#0b0d12':'var(--foreground)',fontWeight:800,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}><Filter size={12}/>{hideLow?'Filtered':'Filter duplicates'}</button>
            <button onClick={()=> setShowStaffOnly(v=>!v)} aria-pressed={showStaffOnly} title="Staff picks only" style={{padding:'6px 10px',borderRadius:999,border: showStaffOnly?'1px solid var(--lime)':'1px solid var(--line)',background: showStaffOnly?'var(--lime)':'rgba(255,255,255,.06)',color: showStaffOnly?'#0b0d12':'var(--foreground)',fontWeight:800,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}><Star size={12} fill={showStaffOnly?'currentColor':'none'}/>{showStaffOnly?'Staff only':'All'}</button>
          </div>
        </div>
        <div className="filter-tabs" role="tablist" aria-label="Filter games">
          {filters.map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>
              {item} <span style={{opacity:.7,fontWeight:700,marginLeft:4,fontSize:11}}>({filterCounts[item]??0})</span>
            </button>
          ))}
        </div>

        {/* Content */}
        {view === 'shelves' && filter==='All games' && !debouncedQuery ? (
          <div className="shelves">
            <div className="shelf">
              <div className="shelf-head">
                <h3><Star size={14} fill="var(--lime)" color="var(--lime)"/> Staff Picks <span>{staffGames.length}</span></h3>
                <div className="shelf-actions"><span style={{fontSize:11,color:'var(--muted)',fontWeight:700}}>Hand-curated • no filler</span></div>
              </div>
                            <div className="shelf-track" style={{contentVisibility:'auto'}}>
                {staffGames.map((game,i)=> (
                  <ShelfCard key={`staff-${game.id}`} game={game} index={i} isFavorite={favorites.includes(game.id)} onToggle={toggleFavorite} onLaunch={launch} query={debouncedQuery} />
                ))}
              </div>
            </div>
            {grouped.map(([genre, list])=> (
              <div key={genre} className="shelf">
                <div className="shelf-head">
                  <h3>{genre} <span>{list.length}</span></h3>
                  <div className="shelf-actions">
                    <button className="shelf-nav" aria-label={`Scroll ${genre} left`} onClick={e=>{ const tr = (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement); if(tr) tr.scrollBy({left:-380,behavior:'smooth'})}}><ChevronLeft size={16}/></button>
                    <button className="shelf-nav" aria-label={`Scroll ${genre} right`} onClick={e=>{ const tr = (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement); if(tr) tr.scrollBy({left:380,behavior:'smooth'})}}><ChevronRight size={16}/></button>
                    <button className="btn-mini" onClick={()=> setFilter(genre)}>View all</button>
                  </div>
                </div>
                                <div className="shelf-track" style={{contentVisibility:'auto'}}>
                  {list.slice(0,14).map((game, index)=> (
                    <ShelfCard key={game.id} game={game} index={index} isFavorite={favorites.includes(game.id)} onToggle={toggleFavorite} onLaunch={launch} query={debouncedQuery} />
                  ))}
                </div>
              </div>
            ))}
            {grouped.length===0 && <div className="empty-state"><Zap size={22}/><h3>No games found</h3><p>Try a different search or clear the filter.</p></div>}
          </div>
        ) : (
          <>
                        {allGames.length===games.length && published.length===0 ? <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))",gap:16, marginBottom:16}}>{Array.from({length:4}).map((_,i)=><div key={i} className="skeleton" style={{height:220}}/> )}</div> : null}
            <div className="game-grid" style={{contentVisibility:'auto',containIntrinsicSize:'0 600px'}}>
              {paginatedGames.map((game, index) => (
                <GameCard key={game.id} game={game} index={index} isFavorite={favorites.includes(game.id)} onToggle={toggleFavorite} onLaunch={launch} query={debouncedQuery} />
              ))}
            </div>
            {visibleGames.length === 0 && (
              <div className="empty-state" role="status" aria-live="polite">
                <Zap size={22} />
                <h3>No games found</h3>
                <p>Try a different search or clear the filter.</p>
              </div>
            )}
            {visibleGames.length > paginatedGames.length && (
              <div style={{display:'flex',justifyContent:'center',marginTop:18}}>
                <button onClick={()=> setVisibleCount(c=> c+36)} style={{padding:'10px 18px',borderRadius:999,border:'1px solid var(--line)',background:'var(--panel)',color:'var(--foreground)',fontWeight:800,cursor:'pointer'}}>Load more — {visibleGames.length - paginatedGames.length} remaining</button>
              </div>
            )}
            <p style={{textAlign:'center',marginTop:10,fontSize:11,color:'var(--muted)'}} aria-live="polite">Showing {paginatedGames.length} of {visibleGames.length} • {allGames.length} total</p>
          </>
        )}
      {/* Requests + Upvotes */}
        <div style={{marginTop:18,border:'1px solid var(--line)',borderRadius:16,background:'var(--panel)',padding:14}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <p className="eyebrow" style={{margin:0,display:'flex',alignItems:'center',gap:6}}><MessageSquare size={12}/> REQUEST A GAME — upvote what you want</p>
            <a href="/request-game" style={{fontSize:12,fontWeight:800,display:'inline-flex',alignItems:'center',gap:6,color:'var(--foreground)',textDecoration:'none'}}>Full request page <ArrowUpRight size={12}/></a>
          </div>
          <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
            <input value={newReqTitle} onChange={e=> setNewReqTitle(e.target.value)} placeholder="Type a game you want…" style={{flex:1,minWidth:220,padding:'10px 12px',borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.06)',color:'var(--foreground)',outline:'none'}} onKeyDown={e=> e.key==='Enter'&&submitRequest()} />
            <button onClick={submitRequest} style={{padding:'10px 16px',borderRadius:999,background:'var(--lime)',color:'#0b0d12',border:'1px solid var(--lime)',fontWeight:900,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}><Sparkles size={14}/> Request</button>
          </div>
          {requests.length>0 ? (
            <div style={{display:'grid',gap:8,marginTop:14,maxHeight:260,overflowY:'auto',paddingRight:4}}>
              {requests.slice(0,8).map(r=> (
                <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,border:'1px solid var(--line)',background:'rgba(255,255,255,.03)'}}>
                  <span style={{flex:1,minWidth:0}}><strong style={{fontSize:13}}>{r.title}</strong> <span style={{fontSize:11,color:'var(--muted)',marginLeft:6}}>{r.status}</span></span>
                  <span style={{fontSize:12,fontWeight:800,display:'flex',alignItems:'center',gap:4}}><ThumbsUp size={12}/> {r.votes}</span>
                  <button disabled={requestVotes.includes(r.id)} onClick={()=> upvoteRequest(r.id)} style={{padding:'6px 10px',borderRadius:999,border: requestVotes.includes(r.id)?'1px solid var(--line)':'1px solid var(--lime)',background: requestVotes.includes(r.id)?'transparent':'var(--lime)',color: requestVotes.includes(r.id)?'var(--muted)':'#0b0d12',fontWeight:900,fontSize:11,cursor: requestVotes.includes(r.id)?'default':'pointer'}}>{requestVotes.includes(r.id)?'Voted':'Upvote'}</button>
                </div>
              ))}
            </div>
          ) : <p style={{marginTop:12,color:'var(--muted)',fontSize:13}}>No requests yet — be the first to ask for a game.</p>}
        </div>
      </section>
      <footer id="about">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="brand-mark">
              <Gamepad2 size={17} />
            </span>
            <strong>GG-LOUNGE<span className="tm">™</span></strong>
          </div>
          <span className="footer-rule" />
          <p>Made by <strong>Kai Chauhan</strong></p>
        </div>
        <div className="footer-bottom">
          <span>© 2026 GG-LOUNGE STUDIOS™. All rights reserved.</span>
          <span>A Production of GG-LOUNGE STUDIOS™</span>
          <span>Games remain property of their respective creators.</span>
        </div>
      </footer>
      <a className="admin-fab" href="/admin" aria-label="Open admin console">
        <ShieldCheck size={19} />
        <span>Admin</span>
      </a>
      {showAchievementsHub && <AchievementsHub open={showAchievementsHub} onClose={()=> setShowAchievementsHub(false)} authUser={authUser} onPlayGame={(id)=> { const g=allGames.find(x=> x.id===id); if(g){ setShowAchievementsHub(false); launch(g) } }} />}
      {activeGame && (
        <GameModal
          game={activeGame}
          isFavorite={favorites.includes(activeGame.id)}
          onToggleFavorite={toggleFavorite}
          onClose={() => { setActiveGame(null); if(authUser) fetch('/api/achievements/stats').then(r=> r.ok? r.json():null).then((d:any)=>{ if(d?.signedIn) setAchSummary({ total:d.total||0, unlocked:d.totalUnlocked||0, points:d.totalPoints||0 }) }).catch(()=>{}) }}
          authUser={authUser}
        />
      )}
          </ErrorBoundary>
</main>
  )
}