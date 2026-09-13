'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { ArrowUpRight, Gamepad2, Heart, Maximize2, Play, Search, ShieldCheck, Sparkles, Trophy, X, Zap, LayoutGrid, Rows3, Shuffle, ExternalLink, Copy, AlertCircle, Loader2, ChevronLeft, ChevronRight, Sun, Moon, Download, Flag, Flame, Crown, Gift, Monitor, Keyboard, Bug, ThumbsUp, Globe, MessageSquare, Star, Timer, WifiOff, Wifi, Filter, ArrowUpDown, Eye, EyeOff, ShieldAlert, ListFilter, Users, LogIn, LogOut, User, Cloud, CloudOff, Save, Menu } from 'lucide-react'
import dynamic from 'next/dynamic'
import { games, filters, pubColors, FEATURED_IDS, STAFF_PICKS, LOW_QUALITY_HINTS, CONTROLS_LEGEND, hashDay, gameOfDayIndex, PROXY_TILES, isNearDuplicate, normalizeTitle } from '@/lib/games'
import type { Game } from '@/lib/games'
import { GameCard, ShelfCard } from '@/components/GameCard'
import { LibraryToolbar } from '@/components/LibraryToolbar'
import { CatalogGrid } from '@/components/CatalogGrid'
import { RequestPanel } from '@/components/RequestPanel'
const HomeDashboard = dynamic(() => import('@/components/HomeDashboard').then(m => m.HomeDashboard), { ssr: false, loading: () => null })
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AuthDialog } from '@/components/AuthDialog'
const GameModal = dynamic(() => import('@/components/GameModal').then(m => m.GameModal), { ssr: false, loading: () => null })
const AchievementsHub = dynamic(() => import('@/components/AchievementsHub').then(m => m.AchievementsHub), { ssr: false, loading: () => null })

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
  const [hideLow, setHideLow] = useState(true)
  const [showStaffOnly, setShowStaffOnly] = useState(false)
  const [showAchievementsHub, setShowAchievementsHub] = useState(false)
  const [achSummary, setAchSummary] = useState<{total:number, unlocked:number, points:number} | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [dbMode, setDbMode] = useState<'postgres'|'local'|null>(null)
  const [streak, setStreak] = useState(1)
  const [showDashboard, setShowDashboard] = useState(false)

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
  // streak: consecutive days visited (retention)
  useEffect(()=>{
    try{
      const today = new Date().toISOString().slice(0,10)
      const last = localStorage.getItem('ggl_last_visit')
      let s = parseInt(localStorage.getItem('ggl_streak')||'0',10)
      if(last !== today){
        const yest = new Date(Date.now()-86400000).toISOString().slice(0,10)
        s = last===yest ? (s||1)+1 : (s||0)+1
        if(s>1 || !last) s = Math.max(1,s)
        localStorage.setItem('ggl_streak', String(s))
        localStorage.setItem('ggl_last_visit', today)
      }
      setStreak(s||1)
    }catch{}
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

    // instant search — debounce removed for immediate feedback, keep tiny 80ms to avoid jank but visible is instant
  useEffect(()=>{
    const id=setTimeout(()=> setDebouncedQuery(query), 120)
    return ()=> clearTimeout(id)
  },[query])
  useEffect(()=>{ setVisibleCount(36) },[query, filter, sortBy, hideLow, showStaffOnly])
  // fetch requests for upvote list
  useEffect(()=>{
    fetch('/api/game-requests').then(r=> r.ok? r.json(): null).then((d:any)=>{
      if(d?.requests) setRequests(d.requests.map((x:any)=> ({ id:String(x.id), title:x.title||x.game||x.name||'Unknown', votes: Number(x.votes||x.upvotes||0), status: x.status||'pending'})))
    }).catch(()=>{})
  },[])

  const allGames = useMemo(() => [...games, ...published], [published])
  // PROD: handle ?play= id from /g/[id] SEO landing (auto-open modal)
  useEffect(()=>{
    try{
      const sp = new URLSearchParams(window.location.search)
      const pid = sp.get('play')
      if(pid){
        const g = allGames.find(x=> x.id===pid)
        if(g) launch(g)
        const url = new URL(window.location.href); url.searchParams.delete('play'); history.replaceState(null,'', url.toString())
      }
    }catch{}
  }, [allGames])
  // Fix 1: precomputed search index to avoid re-concatting strings on every keystroke
  const searchIndex = useMemo(() => new Map(allGames.map((g) => [g.id, `${g.title} ${g.genre} ${g.tone} ${g.description}`.toLowerCase()] as const)), [allGames])
  const fuse = useMemo(() => new Fuse(allGames, { keys: [{ name: 'title', weight: 0.5 }, { name: 'genre', weight: 0.2 }, { name: 'tone', weight: 0.15 }, { name: 'description', weight: 0.15 }], threshold: 0.3, distance: 100, ignoreLocation: true, minMatchCharLength: 2, includeScore: true }), [allGames])
  const visibleGames = useMemo(
    () => {
      const q = query.trim().toLowerCase()
      let base: Game[] = []
      if(q){
        // PROD honest: always use Fuse ranking (typo tolerant), not just fallback — users feel search is smart
        const results = fuse.search(query.trim(), { limit: 80 })
        const ranked = results.map(r=> r.item)
        // also include exact substring matches that Fuse might miss (boost them to top)
        const exact = allGames.filter(g=> (searchIndex.get(g.id)||'').includes(q))
        const seen = new Set(ranked.map(g=> g.id))
        base = [...exact.filter(g=> !seen.has(g.id)), ...ranked]
        base = base.filter(g=>{
          if(filter === 'All games') return true
          if(filter === 'Favorites') return favorites.includes(g.id)
          return g.genre === filter
        })
      } else {
        base = allGames.filter((game) => {
          if(filter === 'All games') return true
          if(filter === 'Favorites') return favorites.includes(game.id)
          return game.genre === filter
        })
      }
      if (hideLow) {
        base = base.filter(g=> !LOW_QUALITY_HINTS.has(g.id))
        // PROD dedupe: exact + Levenshtein near-duplicate (honest: catches "Slope" vs "Slope Ball", "Paper.io 2" vs "Paper io 2")
        const kept: Game[] = []
        for(const g of base){
          const dup = kept.some(k=> isNearDuplicate(k.title, g.title))
          if(!dup) kept.push(g)
        }
        base = kept
      }
      if (showStaffOnly) base = base.filter(g=> STAFF_PICKS.includes(g.id))
      // sorting
      if (sortBy==='popular') base = [...base].sort((a,b)=> (playCounts[b.id]||0) - (playCounts[a.id]||0))
      else if (sortBy==='az') base = [...base].sort((a,b)=> a.title.localeCompare(b.title))
      else if (sortBy==='newest') base = [...base].reverse()
      // featured first when default
      else base = [...base].sort((a,b)=> (b.featured?1:0) - (a.featured?1:0))
      return base
    },
    [allGames, favorites, filter, query, playCounts, sortBy, hideLow, showStaffOnly, searchIndex, fuse],
  )
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const paginatedGames = useMemo(()=> visibleGames.slice(0, visibleCount), [visibleGames, visibleCount])
  useEffect(()=>{
    if (!loadMoreRef.current) return
    const el = loadMoreRef.current
    const obs = new IntersectionObserver((entries)=>{
      if (entries[0]?.isIntersecting && paginatedGames.length < visibleGames.length) setVisibleCount(c=> Math.min(c+36, visibleGames.length))
    }, { rootMargin:'600px' })
    obs.observe(el)
    return ()=> obs.disconnect()
  }, [paginatedGames.length, visibleGames.length])

  // Fix 6: shelves grouping only when actually showing shelves (avoid wasted 192 scan in grid/search)
  const grouped = useMemo(()=>{
    if (view !== 'shelves' || filter !== 'All games' || query.trim()) return [] as [string, Game[]][]
    const map: Record<string, Game[]> = {}
    for(const g of visibleGames){
      const k = g.genre
      if(!map[k]) map[k]=[]
      map[k].push(g)
    }
    return Object.entries(map).sort((a,b)=> b[1].length - a[1].length)
  }, [visibleGames, view, filter, query])
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
    const fetchLB=()=> fetch('/api/leaderboard?limit=5').then(r=> r.ok? r.json(): null).then((d:any)=>{ if(!alive) return; if(d?.leaderboard && Array.isArray(d.leaderboard)) setServerLeaderboard(d.leaderboard) }).catch(()=>{})
    fetchLB()
    const id=setInterval(()=>{ if(document.visibilityState!=='hidden') fetchLB() }, 30000)
    return ()=> { alive=false; clearInterval(id)}
  }, [playCounts]) // PROD: guests + signed-in both poll, no authUser dep
  const leaderboard = useMemo(()=>{
    if(serverLeaderboard.length>0){
      const map = new Map(allGames.map(g=> [g.id, g] as const))
      const rows = serverLeaderboard.map(r=> {
        const g = map.get(r.gameId)
        return g ? { game:g, count:r.count } : null
      }).filter(Boolean) as {game:typeof allGames[number], count:number}[]
      if(rows.length>0) return rows.slice(0,5)
    }
    // PROD honest global: never fake with local playCounts
    if(serverLeaderboard.length===0) return featuredGames.slice(0,5).map((g,i)=> ({ game:g, count: 0}))
    return featuredGames.slice(0,5).map((g,i)=> ({ game:g, count: 0}))
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
    numberOfItems: allGames.length,
    itemListElement: allGames.slice(0,24).map((g,i)=> ({
      '@type':'ListItem',
      position:i+1,
      item: {
        '@type':'VideoGame',
        name:g.title,
        description:g.description,
        url: (typeof window!=='undefined' ? window.location.origin : 'https://gg-lounge.vercel.app') + g.path,
        image: (typeof window!=='undefined' ? window.location.origin : 'https://gg-lounge.vercel.app') + (g.icon || ''),
        genre: g.genre,
        applicationCategory: 'Game',
        operatingSystem: 'Web Browser',
        offers: { '@type':'Offer', price:'0', priceCurrency:'USD', availability:'https://schema.org/InStock' },
        author: { '@type':'Organization', name:'GG-Lounge Studios' }
      }
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
  const [installHint, setInstallHint] = useState<string|null>(null)
  async function doInstall(){
    const dp:any = installPrompt || (window as any).__gglDeferredPrompt
    if(dp && dp.prompt){ try{ dp.prompt(); const r= await dp.userChoice; if(r) { setInstallable(false); setInstallPrompt(null); (window as any).__gglDeferredPrompt=null } }catch{} return }
    // honest iOS: show inline hint, not alert
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if(isIOS) setInstallHint('On iPhone: tap Share → Add to Home Screen')
    else setInstallHint('In browser menu: Install app / Add to Home Screen')
    setTimeout(()=> setInstallHint(null), 4000)
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
    // 30s per-upvote cooldown to blunt spam even if localStorage cleared (#19)
    try{
      const key='ggl_upvote_'+id
      const last=parseInt(localStorage.getItem(key)||'0',10)
      if(Date.now()-last < 30000) return
      localStorage.setItem(key, String(Date.now()))
    }catch{}
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
      {!online && <div role="status" aria-live="polite" style={{margin:'10px 18px 0',padding:'10px 14px',borderRadius:12,background:'rgba(255,92,92,.12)',border:'1px solid rgba(255,92,92,.3)',display:'flex',alignItems:'center',gap:8,color:'var(--foreground)',fontSize:13}}><WifiOff size={16}/> You’re offline — browsing is limited. A few cached games may still work, but most need internet.</div>}
      {dbMode==='local' && !authUser && <div role="note" style={{margin:'10px 18px 0',padding:'10px 14px',borderRadius:12,background:'rgba(255,190,70,.14)',border:'1px solid rgba(255,190,70,.3)',display:'flex',alignItems:'center',gap:8,color:'var(--foreground)',fontSize:12}}><AlertCircle size={14}/> Guest mode: progress saves locally. <button onClick={()=> setShowAuth('register')} style={{marginLeft:4, textDecoration:'underline', background:'none', border:0, color:'var(--foreground)', fontWeight:800, cursor:'pointer'}}>Sign in to keep it forever</button> — survives deploys.</div>}
      {installable && <div style={{margin:'12px 18px 0',padding:'12px 14px',borderRadius:14,background:'linear-gradient(135deg, rgba(204,255,0,.18), rgba(0,242,234,.14))',border:'1px solid rgba(204,255,0,.35)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <span style={{display:'flex',alignItems:'center',gap:10,fontWeight:800,fontSize:13}}><span style={{width:32,height:32,borderRadius:999,background:'var(--lime)',display:'grid',placeItems:'center',color:'#0b0d12'}}><Download size={16}/></span> Install GG Lounge — play offline & launch like an app</span>
        <span style={{display:'flex',gap:8}}><button onClick={doInstall} style={{padding:'8px 14px',borderRadius:999,background:'#0b0d12',color:'#fff',border:'1px solid rgba(255,255,255,.15)',fontWeight:800,cursor:'pointer'}}>Install</button><button onClick={()=> setInstallable(false)} style={{padding:'8px 10px',borderRadius:999,background:'transparent',border:'1px solid var(--line)',color:'var(--foreground)',cursor:'pointer'}}>Dismiss</button></span>
      </div>}
      {installHint && <div role="status" style={{margin:'10px 18px 0', padding:'10px 14px', borderRadius:12, background:'rgba(255,255,255,.06)', border:'1px solid var(--line)', fontSize:13, textAlign:'center'}}>{installHint}</div>}
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
          <p className="hero-text">A handpicked, no-filler collection of browser games for the minutes between everything. <span style={{opacity:.8}}><Keyboard size={12} style={{display:'inline',verticalAlign:'-2px'}}/> {CONTROLS_LEGEND.default} — hover any card to see its controls.</span></p>
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
            <span style={{display:'flex',alignItems:'center',gap:6}}><Flame size={12} color={streak>2?'var(--lime)':'inherit'}/> <strong>{streak}</strong> day streak</span>
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
                <LibraryToolbar query={query} setQuery={setQuery} allGames={allGames} sortBy={sortBy} setSortBy={setSortBy} view={view} setView={setView} hideLow={hideLow} setHideLow={setHideLow} showStaffOnly={showStaffOnly} setShowStaffOnly={setShowStaffOnly} shufflePick={shufflePick} />
        {favorites.length>0 && filter!=='Favorites' && (
          <div style={{marginBottom:12, padding:'10px 14px', borderRadius:12, background:'linear-gradient(135deg, rgba(215,243,74,.14), rgba(125,107,255,.08))', border:'1px solid rgba(215,243,74,.28)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
            <span style={{fontSize:13, fontWeight:800, display:'flex', alignItems:'center', gap:8}}><Heart size={14} fill="var(--coral)" color="var(--coral)"/> You have {favorites.length} favorite{favorites.length>1?'s':''}</span>
            <button onClick={()=> setFilter('Favorites')} style={{padding:'7px 12px', borderRadius:999, background:'var(--lime)', color:'#0b0d12', border:0, fontWeight:900, fontSize:12, cursor:'pointer'}}>View favorites →</button>
          </div>
        )}
        <div className="filter-tabs" role="tablist" aria-label="Filter games">
          {filters.filter(f=> f==='All games' || f==='Favorites' || (filterCounts[f]??0)>0).map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>
              {item} <span style={{opacity:.7,fontWeight:700,marginLeft:4,fontSize:11}}>({filterCounts[item]??0})</span>
            </button>
          ))}
        </div>

        <CatalogGrid view={view} filter={filter} query={query} visibleGames={visibleGames} paginatedGames={paginatedGames} grouped={grouped} staffGames={staffGames} allGames={allGames} favorites={favorites} toggleFavorite={toggleFavorite} launch={launch} loadMoreRef={loadMoreRef} visibleCount={visibleCount} setVisibleCount={setVisibleCount} setQuery={setQuery} setFilter={setFilter} setHideLow={setHideLow} setShowStaffOnly={setShowStaffOnly} shufflePick={shufflePick} />
            <HomeDashboard
        gameOfDay={gameOfDay} allGames={allGames} leaderboard={leaderboard}
        favorites={favorites} recentlyPlayed={recentlyPlayed}
        authUser={authUser} achSummary={achSummary}
        showDashboard={showDashboard} setShowDashboard={setShowDashboard}
        leaderTab={leaderTab} setLeaderTab={setLeaderTab}
        launch={launch} openProxyTile={openProxyTile}
        setShowAchievementsHub={setShowAchievementsHub} setRecentlyPlayed={setRecentlyPlayed}
      />

      {/* Requests + Upvotes */}
                <RequestPanel requests={requests} requestVotes={requestVotes} newReqTitle={newReqTitle} setNewReqTitle={setNewReqTitle} submitRequest={submitRequest} upvoteRequest={upvoteRequest} />
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
          <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><a href="/privacy" style={{ textDecoration: 'underline', color: 'inherit' }}>Privacy</a> <a href="/terms" style={{ textDecoration: 'underline', color: 'inherit' }}>Terms</a> <a href="/api/health" style={{ textDecoration: 'underline', color: 'inherit' }}>Health</a></span>
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