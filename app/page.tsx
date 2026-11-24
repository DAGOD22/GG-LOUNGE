'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameUrl } from '@/lib/use-game-url'
import { mergeGuestPlays } from '@/lib/guest-progress'
import { useCustomization } from '@/components/customization/CustomizationProvider'
import { WelcomeTour } from '@/components/live/WelcomeTour'
import { THEMES } from '@/lib/customization/settings'
import { dedupeGames } from '@/lib/game-identity'
import { unavailableGames, getGameAssetIssues } from '@/lib/games'
import Fuse from 'fuse.js'
import { Gamepad2, Heart, ShieldCheck, Trophy, X, AlertCircle, Download, Cloud, WifiOff } from 'lucide-react'
import dynamic from 'next/dynamic'
import { games, filters, pubColors, FEATURED_IDS, STAFF_PICKS, LOW_QUALITY_HINTS, gameOfDayIndex, isNearDuplicate, curatedRank } from '@/lib/games'
import type { Game } from '@/lib/games'
import {  } from '@/components/GameCard'
import { LibraryToolbar } from '@/components/LibraryToolbar'
import { CatalogGrid } from '@/components/CatalogGrid'
import { RequestPanel } from '@/components/RequestPanel'
const HomeDashboard = dynamic(() => import('@/components/HomeDashboard').then(m => m.HomeDashboard), { ssr: false, loading: () => null })
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Reveal } from '@/components/Reveal'
import { AuthDialog } from '@/components/AuthDialog'
import { AnnouncementBanner } from '@/components/AnnouncementBanner'
import { SiteHeader } from '@/components/SiteHeader'
import { HeroSection } from '@/components/HeroSection'
const GameModal = dynamic(() => import('@/components/GameModal').then(m => m.GameModal), { ssr: false, loading: () => null })
const AchievementsHub = dynamic(() => import('@/components/AchievementsHub').then(m => m.AchievementsHub), { ssr: false, loading: () => null })

type PublishedListing = { id: string; title: string; icon: string | null }
type RequestItem = { id: string; title: string; votes: number; status: string }
export default function Page() {
  const [query, setQuery] = useState('')
  // The first render must not rewrite the URL — it would erase a deep link
  // before the launcher had a chance to read it.
  const historyReady = useRef(false)
  const [filter, setFilter] = useState('All games')
  const [favorites, setFavorites] = useState<string[]>([])
  const [activeGame, setActiveGame] = useState<Game | null>(null)
  const [published, setPublished] = useState<Game[]>([])
  const [spotIdx, setSpotIdx] = useState(0)
  const [view, setView] = useState<'shelves'|'grid'>('shelves')
  const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>([])
  // 10 features state
  const customization = useCustomization()
  const theme = customization.settings.theme.mode
  const [online, setOnline] = useState(true)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [installable, setInstallable] = useState(false)
  const [playCounts, setPlayCounts] = useState<Record<string,number>>({})
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [requestVotes, setRequestVotes] = useState<string[]>([])
  const [newReqTitle, setNewReqTitle] = useState('')
  const [leaderTab, setLeaderTab] = useState<'today'|'week'>('today')
  const [authUser, setAuthUser] = useState<{id:string; username:string}|null>(null)
  const [guestMergeNote, setGuestMergeNote] = useState('')
  const [showAuth, setShowAuth] = useState<null|'login'|'register'|'reset'>(null)
  const [authForm, setAuthForm] = useState({ username:'', password:'', favoriteFood:'', newPassword:'' })
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  // Kept for the search input's debounce pipeline; the rendered list reads query.
  const [, setDebouncedQuery] = useState('')
  const [sortBy, setSortBy] = useState<'featured'|'popular'|'newest'|'az'>('featured')
  const [visibleCount, setVisibleCount] = useState(36)
  const [hideLow, setHideLow] = useState(true)
  const [showStaffOnly, setShowStaffOnly] = useState(false)
  const [showAchievementsHub, setShowAchievementsHub] = useState(false)
  const [achSummary, setAchSummary] = useState<{total:number, unlocked:number, points:number} | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [dbMode, setDbMode] = useState<'postgres'|'local'|null>(null)
  const [streak, setStreak] = useState(1)
  // Open on first paint: the leaderboard, game of the day and Your Lounge are
  // the reason to visit, and a collapsed panel nobody opens is a feature nobody
  // has. The chevron closes it, and the choice is remembered.
  const [showDashboard, setShowDashboardRaw] = useState(true)
  // Remember a deliberate collapse across visits, but always start expanded for
  // a first-time visitor — that is the whole point of surfacing the board.
  const setShowDashboard = useCallback((next: boolean | ((v: boolean) => boolean)) => {
    setShowDashboardRaw(prev => {
      const value = typeof next === 'function' ? next(prev) : next
      try { localStorage.setItem('ggl_dashboard_collapsed', value ? '0' : '1') } catch {}
      return value
    })
  }, [])
  useEffect(() => {
    try { if (localStorage.getItem('ggl_dashboard_collapsed') === '1') setShowDashboardRaw(false) } catch {}
  }, [])

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
  const [guestToken, setGuestToken] = useState('')
  useEffect(()=>{
    try{
      let id = localStorage.getItem('ggl_anon_id')
      if(!id){ id='anon_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36); localStorage.setItem('ggl_anon_id', id) }
      // A guest's row is reachable only with a token the server signed for that
      // id; a bare id would let anyone read anyone else's history.
      const cached = localStorage.getItem('ggl_guest_token')
      if(cached && cached.startsWith(id + '.')) setGuestToken(cached)
      else fetch('/api/user-state/token', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ anonId: id }) })
        .then(r=> r.ok? r.json(): null)
        .then((d:any)=>{ if(d?.token){ localStorage.setItem('ggl_guest_token', d.token); setGuestToken(d.token) } })
        .catch(()=>{})
    }catch{}
  },[])
  useEffect(()=>{
    if(!guestToken) return
    try{
      // load cloud state and merge (cloud wins if newer) — anon
      fetch('/api/user-state', { headers:{ 'x-gg-guest': guestToken } }).then(r=> r.ok? r.json():null).then((d:any)=>{
        if(d?.state){
          const s=d.state
          if(Array.isArray(s.favorites) && s.favorites.length> favorites.length) setFavorites(s.favorites)
          if(s.playCounts && Object.keys(s.playCounts).length> Object.keys(playCounts).length) setPlayCounts(s.playCounts)
          if(Array.isArray(s.recentlyPlayed) && s.recentlyPlayed.length> recentlyPlayed.length) setRecentlyPlayed(s.recentlyPlayed.slice(0,12))
        }
      }).catch(()=>{})
    }catch{}
  },[guestToken])
  // when signed in, also load/merge username cloud state (this is what saves progress across devices with username)
  useEffect(()=>{
    if(!authUser?.id) return
    fetch('/api/user-state').then(r=> r.ok? r.json():null).then((d:any)=>{
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
    // Signed in: the cookie identifies the row. Guest: the signed token does.
    if(!authUser && !guestToken) return
    const headers: Record<string,string> = { 'content-type':'application/json' }
    if(!authUser) headers['x-gg-guest'] = guestToken
    const h = setTimeout(()=>{
      fetch('/api/user-state', { method:'POST', headers, body: JSON.stringify({ favorites, playCounts, recentlyPlayed })}).catch(()=>{})
    }, 1200)
    return ()=> clearTimeout(h)
  },[favorites, playCounts, recentlyPlayed, authUser, guestToken])

  // The Escape handler lives above the URL hook for historical reasons, so it
  // reaches the push function through a ref rather than a stale closure.
  const pushHomeRef = useRef<() => void>(() => {})

  // keyboard shortcut: '/' focuses search, Esc closes modal (a11y)
  useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{
      const tag = (e.target as HTMLElement)?.tagName
      if(tag==='INPUT' || tag==='TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if(e.key==='/' && !e.ctrlKey && !e.metaKey){ e.preventDefault(); const el=document.getElementById('main-search'); el?.focus() }
      if(e.key==='Escape'){ setActiveGame(null); pushHomeRef.current(); setShowAuth(null); setShowAchievementsHub(false); setMobileNavOpen(false) }
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

  /**
   * `?q=<term>` is a real entry point, not decoration.
   *
   * The site's JSON-LD advertises `/?q={search_term_string}` as its SearchAction,
   * which tells Google that a search box exists at that URL. It did not: the page
   * never read `q`, so a visitor arriving from a search result landed on the
   * unfiltered library. Read it on first paint so the promise is kept, and keep
   * the address bar in step afterwards so a filtered view stays shareable.
   */
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('q')
    if(wanted && wanted.trim()) setQuery(wanted.trim().slice(0, 80))
    // The installed app's jump-list shortcuts are real entry points too. They
    // arrive as query params because a manifest shortcut cannot dispatch an
    // event, so each one has to be honoured here or the shortcut is a lie.
    if(params.get('customize') === '1'){ customization.openSettings(); }
    if(params.get('coop') === '1'){ window.dispatchEvent(new CustomEvent('ggl:open-coop')); }
  },[])
  useEffect(()=>{
    // Only touch history once the page is interactive, and only for the `q`
    // param — the game launcher owns the rest of the query string.
    if (!historyReady.current) { historyReady.current = true; return }
    try{
      const url = new URL(window.location.href)
      if(query.trim()) url.searchParams.set('q', query.trim())
      else url.searchParams.delete('q')
      if(url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
    }catch{}
  },[query])
  // fetch requests for upvote list
  useEffect(()=>{
    fetch('/api/game-requests').then(r=> r.ok? r.json(): null).then((d:any)=>{
      if(d?.requests) setRequests(d.requests.map((x:any)=> ({ id:String(x.id), title:x.title||x.game||x.name||'Unknown', votes: Number(x.votes||x.upvotes||0), status: x.status||'pending'})))
    }).catch(()=>{})
  },[])

  const allGames = useMemo(() => dedupeGames([...games, ...published]), [published])
  // Open a game without any history side effects. Deep links, Back and the
  // initial restore all replay through here so they never stack extra entries.
  const openGameById = useCallback((id: string) => {
    const g = allGames.find(x => x.id === id)
    if (!g) return
    setActiveGame(g)
    setRecentlyPlayed(prev => [g.id, ...prev.filter(x => x !== g.id)].slice(0, 12))
  }, [allGames])

  const closeGame = useCallback(() => setActiveGame(null), [])

  const isProxyGame = useCallback((id: string) => Boolean(allGames.find(g => g.id === id)?.proxy), [allGames])
  const knowsGame = useCallback((id: string) => allGames.some(g => g.id === id), [allGames])

  /* URL ⇄ game. A launch is a page view, so each one pushes its own history
     entry: analytics sees N launches, Back closes the game, and the address
     bar becomes a shareable link. */
  const { pushGame, pushHome } = useGameUrl({
    openGameId: activeGame?.id ?? null,
    openGame: openGameById,
    closeGame,
    ready: allGames.length > 0,
    known: knowsGame,
    isProxy: isProxyGame,
  })
  useEffect(() => { pushHomeRef.current = pushHome }, [pushHome])
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
      // default order is the hand-ranked best-of list, then featured tiles
      else base = [...base].sort((a,b)=>
        curatedRank(a.id) - curatedRank(b.id) || (b.featured?1:0) - (a.featured?1:0)
      )
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
  const staffGames = useMemo(()=> STAFF_PICKS.map(id=> allGames.find(g=> g.id===id)).filter((g): g is Game => Boolean(g)), [allGames])

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
    if(serverLeaderboard.length===0) return featuredGames.slice(0,5).map((g)=> ({ game:g, count: 0}))
    return featuredGames.slice(0,5).map((g)=> ({ game:g, count: 0}))
  }, [allGames, playCounts, serverLeaderboard, authUser, featuredGames])
  // JSON-LD for SEO - top games as ItemList
  const jsonLd = useMemo(()=> ({
    '@context':'https://schema.org',
    '@type':'ItemList',
    name:'GG-Lounge Games',
    numberOfItems: allGames.length,
    itemListElement: allGames.slice(0,24).map((g, i)=> ({
      '@type':'ListItem',
      position:i+1,
      item: {
        '@type':'VideoGame',
        name:g.title,
        description:g.description,
        url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://gg-lounge.vercel.app') + g.path,
        image: (process.env.NEXT_PUBLIC_SITE_URL || 'https://gg-lounge.vercel.app') + (g.icon || ''),
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
    pushGame(game)
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
  function toggleTheme(){ const id=theme==='dark'?'arctic':'lounge'; const preset=THEMES[id]; customization.update(s=>({...s,theme:{preset:id,mode:preset.mode,colors:{...preset.colors}}})) }
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
  async function refreshRequests() {
    const response = await fetch('/api/game-requests', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load requests.');
    const data = await response.json();
    if (Array.isArray(data.requests)) setRequests(data.requests);
  }
  async function submitRequest() {
    const title = newReqTitle.trim();
    if (!title) return;
    try {
      const response = await fetch('/api/game-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed.');
      setNewReqTitle('');
      await refreshRequests();
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Request failed. Try again.'); }
  }
  async function upvoteRequest(id: string) {
    if (requestVotes.includes(id)) return;
    try {
      const response = await fetch('/api/game-requests/' + encodeURIComponent(id) + '/upvote', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Vote failed.');
      setRequestVotes(previous => [...previous, id]);
      await refreshRequests();
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Vote failed. Try again.'); }
  }
  function openProxyTile(url:string){ window.location.assign('/proxy?url='+encodeURIComponent(url)) }
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
      // Plays made while signed out live in localStorage; hand them to the
      // account now, or they are lost the first time the browser clears up.
      const carried = await mergeGuestPlays()
      if(carried > 0) setGuestMergeNote(`${carried} play${carried === 1 ? '' : 's'} from before you signed in were added to your account.`)
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
      {/* Above the dashboard and the header: the nav must never sit under it. */}
      <AnnouncementBanner />
      <SiteHeader
        mobileNavOpen={mobileNavOpen}
        setMobileNavOpen={setMobileNavOpen}
        authUser={authUser}
        achUnlocked={achSummary?.unlocked}
        achTotal={achSummary?.total}
        online={online}
        gameCount={allGames.length}
        theme={theme}
        installable={installable}
        onOpenAchievements={() => setShowAchievementsHub(true)}
        onSignIn={() => setShowAuth('login')}
        onLogOut={doLogout}
        onToggleTheme={toggleTheme}
        onInstall={doInstall}
      />
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
      {guestMergeNote && <div role="status" aria-live="polite" style={{margin:'10px 18px 0',padding:'10px 14px',borderRadius:12,background:'rgba(204,255,0,.12)',border:'1px solid rgba(204,255,0,.32)',display:'flex',alignItems:'center',gap:8,color:'var(--foreground)',fontSize:13}}><Cloud size={15}/> {guestMergeNote} <button onClick={()=> setGuestMergeNote('')} style={{marginLeft:'auto',background:'none',border:0,color:'var(--foreground)',cursor:'pointer',display:'flex'}} aria-label="Dismiss"><X size={14}/></button></div>}
      {dbMode==='local' && !authUser && <div role="note" style={{margin:'10px 18px 0',padding:'10px 14px',borderRadius:12,background:'rgba(255,190,70,.14)',border:'1px solid rgba(255,190,70,.3)',display:'flex',alignItems:'center',gap:8,color:'var(--foreground)',fontSize:12}}><AlertCircle size={14}/> Guest mode: progress saves locally. <button onClick={()=> setShowAuth('register')} style={{marginLeft:4, textDecoration:'underline', background:'none', border:0, color:'var(--foreground)', fontWeight:800, cursor:'pointer'}}>Sign in to keep it forever</button> — survives deploys.</div>}
      {installable && <div style={{margin:'12px 18px 0',padding:'12px 14px',borderRadius:14,background:'linear-gradient(135deg, rgba(204,255,0,.18), rgba(0,242,234,.14))',border:'1px solid rgba(204,255,0,.35)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <span style={{display:'flex',alignItems:'center',gap:10,fontWeight:800,fontSize:13}}><span style={{width:32,height:32,borderRadius:999,background:'var(--lime)',display:'grid',placeItems:'center',color:'#0b0d12'}}><Download size={16}/></span> Install GG Lounge — play offline & launch like an app</span>
        <span style={{display:'flex',gap:8}}><button onClick={doInstall} style={{padding:'8px 14px',borderRadius:999,background:'#0b0d12',color:'#fff',border:'1px solid rgba(255,255,255,.15)',fontWeight:800,cursor:'pointer'}}>Install</button><button onClick={()=> setInstallable(false)} style={{padding:'8px 10px',borderRadius:999,background:'transparent',border:'1px solid var(--line)',color:'var(--foreground)',cursor:'pointer'}}>Dismiss</button></span>
      </div>}
      {installHint && <div role="status" style={{margin:'10px 18px 0', padding:'10px 14px', borderRadius:12, background:'rgba(255,255,255,.06)', border:'1px solid var(--line)', fontSize:13, textAlign:'center'}}>{installHint}</div>}
      <HeroSection
        gameCount={allGames.length}
        streak={streak}
        spotlight={spotlight}
        spotIdx={spotIdx}
        featuredCount={featuredGames.length}
        gameOfDay={gameOfDay}
        onShuffle={shufflePick}
        onLaunch={launch}
      />

      <section className="catalog" id="games">
        <Reveal className="section-heading">
          <div>
            <p className="eyebrow">THE ARCADE FLOOR</p>
            <h2>Pick your poison<span>.</span></h2>
          </div>
          <div className="collection-note">
            <Trophy size={16} />
            <span><strong>{visibleGames.length.toString().padStart(2, '0')}</strong> available now</span>
          </div>
        </Reveal>
        <HomeDashboard
          gameOfDay={gameOfDay} allGames={allGames} leaderboard={leaderboard}
          favorites={favorites} recentlyPlayed={recentlyPlayed}
          authUser={authUser} achSummary={achSummary}
          showDashboard={showDashboard} setShowDashboard={setShowDashboard}
          leaderTab={leaderTab} setLeaderTab={setLeaderTab}
          launch={launch} openProxyTile={openProxyTile}
          setShowAchievementsHub={setShowAchievementsHub} setRecentlyPlayed={setRecentlyPlayed}
        />
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

        {unavailableGames.length > 0 && <details style={{ margin: '16px 0', padding: 14, border: '1px solid var(--line)', borderRadius: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>{unavailableGames.length} titles need local files — not listed as playable</summary>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>A loader, external embed or missing directory is not a working local game. These entries remain recorded until their authorized browser files are installed.</p>
          <ul style={{ maxHeight: 220, overflowY: 'auto', fontSize: 12 }}>{unavailableGames.map(game => <li key={game.id}><strong>{game.title}</strong> — {getGameAssetIssues(game.id).join('; ')}</li>)}</ul>
          <a href="/request-game" style={{ fontSize: 12, color: 'var(--lime)' }}>View game requests</a>
        </details>}
        <CatalogGrid view={view} filter={filter} query={query} visibleGames={visibleGames} paginatedGames={paginatedGames} grouped={grouped} staffGames={staffGames} allGames={allGames} favorites={favorites} toggleFavorite={toggleFavorite} launch={launch} loadMoreRef={loadMoreRef} visibleCount={visibleCount} setVisibleCount={setVisibleCount} setQuery={setQuery} setFilter={setFilter} setHideLow={setHideLow} setShowStaffOnly={setShowStaffOnly} shufflePick={shufflePick} />
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
          <p>Made by <strong>DAGOD22</strong></p>
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
      <WelcomeTour />
      {showAchievementsHub && <AchievementsHub open={showAchievementsHub} onClose={()=> setShowAchievementsHub(false)} authUser={authUser} onPlayGame={(id)=> { const g=allGames.find(x=> x.id===id); if(g){ setShowAchievementsHub(false); launch(g) } }} />}
      {activeGame && (
        <ErrorBoundary resetKey={activeGame.id}>
        <GameModal
          game={activeGame}
          isFavorite={favorites.includes(activeGame.id)}
          onToggleFavorite={toggleFavorite}
          onClose={() => { closeGame(); pushHome(); if(authUser) fetch('/api/achievements/stats').then(r=> r.ok? r.json():null).then((d:any)=>{ if(d?.signedIn) setAchSummary({ total:d.total||0, unlocked:d.totalUnlocked||0, points:d.totalPoints||0 }) }).catch(()=>{}) }}
          authUser={authUser}
        />
        </ErrorBoundary>
      )}
          </ErrorBoundary>
</main>
  )
}