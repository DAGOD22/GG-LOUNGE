'use client'
import { useEffect, useState, useMemo } from 'react'
import { Trophy, X, Star, Lock, Medal, Crown, Gamepad2, Search, Filter, Sparkles, Target, Zap } from 'lucide-react'
import { ACHIEVEMENTS, RARITY_COLOR, getAchievementsForGame, GAMES_WITH_ACHIEVEMENTS } from '@/lib/achievements'
import { games } from '@/lib/games'

export function AchievementsHub({ open, onClose, authUser, onPlayGame }: { open: boolean; onClose: () => void; authUser: {id:string, username:string}|null; onPlayGame?: (id:string)=>void }){
  const [achievements, setAchievements] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [filter, setFilter] = useState<'all'|'unlocked'|'locked'>('all')
  const [rarity, setRarity] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [gameFilter, setGameFilter] = useState<string>('all')

  useEffect(()=>{
    if(!open) return
    fetch('/api/achievements').then(r=> r.json()).then((d:any)=>{
      if(d?.achievements) setAchievements(d.achievements)
      if(d?.stats) setStats(d.stats)
    }).catch(()=>{})
    // also refresh stats
    fetch('/api/achievements/stats').then(r=> r.ok? r.json():null).then((d:any)=> { if(d?.signedIn) setStats(d) }).catch(()=>{})
  }, [open])

  const filtered = useMemo(()=>{
    let list = achievements.length ? achievements : ACHIEVEMENTS.map(a=> ({...a, progress:0, unlocked:false}))
    if(gameFilter!=='all') list = list.filter((a:any)=> a.gameId===gameFilter)
    if(filter==='unlocked') list = list.filter((a:any)=> a.unlocked)
    if(filter==='locked') list = list.filter((a:any)=> !a.unlocked)
    if(rarity!=='all') list = list.filter((a:any)=> a.rarity===rarity)
    if(search) {
      const q = search.toLowerCase()
      list = list.filter((a:any)=> a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.gameId.includes(q))
    }
    return list
  }, [achievements, filter, rarity, search, gameFilter])

  if(!open) return null

  const total = ACHIEVEMENTS.length
  const unlocked = achievements.filter((a:any)=> a.unlocked).length || stats?.totalUnlocked || 0
  const points = stats?.totalPoints || achievements.filter((a:any)=> a.unlocked).reduce((acc:number,a:any)=> acc+(a.points||0),0)
  const pct = total? Math.round((unlocked/total)*100):0
  const nextToUnlock = filtered.filter((a:any)=> !a.unlocked).slice(0,3)

  return (
    <div style={{ position:'fixed', inset:0, zIndex:80, display:'flex', flexDirection:'column', background:'rgba(7,9,14,.72)', backdropFilter:'blur(10px)' }} onClick={(e)=> { if(e.target===e.currentTarget) onClose() }}>
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', margin:'18px', borderRadius:18, border:'1px solid var(--line)', background:'var(--panel)', boxShadow:'0 24px 80px rgba(0,0,0,.55)', maxWidth:1100, width:'calc(100% - 36px)', alignSelf:'center' }}>
        {/* header */}
        <div style={{ padding:'18px 18px 14px', borderBottom:'1px solid var(--line)', background:'linear-gradient(135deg, rgba(125,107,255,.14), rgba(215,243,74,.10), transparent)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ width:44, height:44, borderRadius:14, display:'grid', placeItems:'center', background:'linear-gradient(135deg, var(--lime), #7dd3ff)', color:'#0b0d12', boxShadow:'0 8px 20px rgba(215,243,74,.35)' }}><Trophy size={18}/></span>
              <div>
                <div style={{ fontSize:18, fontWeight:950, letterSpacing:'-.02em', display:'flex', alignItems:'center', gap:8 }}>Achievements <span style={{ fontSize:11, padding:'4px 8px', borderRadius:999, background: authUser? 'rgba(34,197,94,.14)':'rgba(255,92,92,.12)', border:'1px solid var(--line)', color: authUser?'#22c55e':'var(--muted)' }}>{authUser ? 'CLOUD SYNCED' : 'SIGN IN TO SAVE'}</span></div>
                <div style={{ fontSize:12, color:'var(--muted)', fontWeight:700, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span>{unlocked} / {total} unlocked</span>
                  <span style={{width:4,height:4,borderRadius:999, background:'var(--line)'}}/>
                  <span style={{ display:'flex',alignItems:'center',gap:4}}><Star size={12} fill="var(--lime)" color="var(--lime)"/> {points} points</span>
                  <span style={{width:4,height:4,borderRadius:999, background:'var(--line)'}}/>
                  <span style={{ display:'flex',alignItems:'center',gap:4}}><Crown size={12}/> {GAMES_WITH_ACHIEVEMENTS.length} games</span>
                </div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {!authUser && <button onClick={()=> { onClose(); document.dispatchEvent(new CustomEvent('ggl:open-auth')) }} style={{ padding:'8px 12px', borderRadius:999, border:'1px solid var(--lime)', background:'var(--lime)', color:'#0b0d12', fontWeight:900, fontSize:12, cursor:'pointer' }}>Sign in</button>}
              <button onClick={onClose} style={{ width:38, height:38, borderRadius:999, border:'1px solid var(--line)', background:'rgba(255,255,255,.06)', color:'var(--foreground)', display:'grid', placeItems:'center', cursor:'pointer' }}><X size={18}/></button>
            </div>
          </div>

          {/* progress bar + streak */}
          <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'center' }}>
            <div style={{ height:10, borderRadius:999, background:'rgba(255,255,255,.08)', overflow:'hidden', border:'1px solid var(--line)' }}>
              <div style={{ width:`${pct}%`, height:'100%', background:'linear-gradient(90deg, var(--lime), #7dd3ff, #7d6bff)', transition:'width 600ms cubic-bezier(.2,.8,.2,1)' }} />
            </div>
            <span style={{ fontSize:12, fontWeight:900, padding:'4px 8px', borderRadius:999, background:'var(--foreground)', color:'var(--background)' }}>{pct}%</span>
          </div>
          <div style={{ marginTop:8, fontSize:11, color:'var(--muted)', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <Sparkles size={12}/> Complete sets per game to earn bonus points. Play any of the 50 featured games to progress — works guest or signed-in, syncs across devices when signed in.
          </div>
        </div>

        {/* controls */}
        <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--line)', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', background:'rgba(255,255,255,.02)' }}>
          <div style={{ position:'relative', flex:'1 1 220px' }}>
            <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
            <input value={search} onChange={e=> setSearch(e.target.value)} placeholder="Search achievements, games…" style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:999, border:'1px solid var(--line)', background:'rgba(255,255,255,.06)', color:'var(--foreground)', outline:'none', fontSize:13 }} />
          </div>
          <select value={gameFilter} onChange={e=> setGameFilter(e.target.value)} style={{ padding:'8px 10px', borderRadius:999, border:'1px solid var(--line)', background:'rgba(255,255,255,.06)', color:'var(--foreground)', fontWeight:800, fontSize:12 }}>
            <option value="all">All games ({total})</option>
            {GAMES_WITH_ACHIEVEMENTS.map(g=> {
              const gi = games.find(x=> x.id===g)
              return <option key={g} value={g}>{gi?.title || g}</option>
            })}
          </select>
          <select value={filter} onChange={e=> setFilter(e.target.value as any)} style={{ padding:'8px 10px', borderRadius:999, border:'1px solid var(--line)', background:'rgba(255,255,255,.06)', color:'var(--foreground)', fontWeight:800, fontSize:12 }}>
            <option value="all">All</option>
            <option value="unlocked">Unlocked ({unlocked})</option>
            <option value="locked">Locked ({total-unlocked})</option>
          </select>
          <select value={rarity} onChange={e=> setRarity(e.target.value)} style={{ padding:'8px 10px', borderRadius:999, border:'1px solid var(--line)', background:'rgba(255,255,255,.06)', color:'var(--foreground)', fontWeight:800, fontSize:12 }}>
            <option value="all">All rarities</option>
            <option value="common">Common</option>
            <option value="rare">Rare</option>
            <option value="epic">Epic</option>
            <option value="legendary">Legendary</option>
          </select>
        </div>

        {/* body */}
        <div style={{ flex:1, overflowY:'auto', padding:14, display:'flex', flexDirection:'column', gap:12, background:'radial-gradient(600px 300px at 15% 0%, rgba(125,107,255,.06), transparent 60%), radial-gradient(600px 300px at 85% 10%, rgba(215,243,74,.06), transparent 60%)' }}>
          {!authUser && (
            <div style={{ padding:'12px 14px', borderRadius:14, border:'1px solid rgba(215,243,74,.28)', background:'linear-gradient(135deg, rgba(215,243,74,.12), rgba(125,107,255,.08))', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, fontWeight:800, display:'flex', alignItems:'center', gap:8 }}><Lock size={14}/> Guest preview — your progress will save locally, sign in to keep it forever across devices.</span>
              <span style={{ fontSize:11, color:'var(--muted)' }}>Username-only sign in • favourite-food security question • no email needed</span>
            </div>
          )}

          {/* featured next */}
          {nextToUnlock.length>0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:10 }}>
              {nextToUnlock.map((a:any)=>{
                const gi = games.find(g=> g.id===a.gameId)
                const pctN = Math.round(((a.progress||0)/(a.target||1))*100)
                return (
                  <div key={'next-'+a.id} style={{ padding:12, borderRadius:14, border:'1px solid var(--line)', background:'rgba(255,255,255,.04)', display:'flex', gap:10 }}>
                    <span style={{ width:40, height:40, borderRadius:12, background:'rgba(125,107,255,.14)', border:'1px solid var(--line)', display:'grid', placeItems:'center', fontSize:18 }}>{a.icon}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:900, letterSpacing:'.06em', color:'var(--muted)' }}>UP NEXT → {gi?.title || a.gameId}</div>
                      <div style={{ fontSize:12, fontWeight:900 }}>{a.title}</div>
                      <div style={{ height:6, borderRadius:999, background:'rgba(255,255,255,.08)', overflow:'hidden', marginTop:6 }}><div style={{ width:`${pctN}%`, height:'100%', background:'linear-gradient(90deg, #7d6bff, #d7f34a)' }} /></div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{a.progress||0}/{a.target} {a.unit||''} • {a.points} pts</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:10 }}>
            {filtered.map((a:any)=>{
              const gi = games.find(g=> g.id===a.gameId)
              const pct = Math.min(100, Math.round(((a.progress||0)/(a.target||1))*100))
              const tierColor = RARITY_COLOR[a.rarity] || '#888'
              const unlockedOne = !!a.unlocked
              return (
                <div key={a.id} style={{ display:'flex', gap:12, padding:12, borderRadius:14, border: unlockedOne ? '1px solid rgba(215,243,74,.32)' : '1px solid var(--line)', background: unlockedOne ? 'linear-gradient(135deg, rgba(215,243,74,.13), rgba(125,107,255,.07))' : 'rgba(255,255,255,.03)', position:'relative', overflow:'hidden' }}>
                  {unlockedOne && <span style={{ position:'absolute', top:10, right:10, width:22, height:22, borderRadius:999, background:'var(--lime)', color:'#0b0d12', display:'grid', placeItems:'center' }}><Star size={12} fill="#0b0d12"/></span>}
                  <div style={{ width:44, height:44, borderRadius:12, background: unlockedOne? 'rgba(215,243,74,.18)' : 'rgba(255,255,255,.06)', border:'1px solid var(--line)', display:'grid', placeItems:'center', fontSize:18, flexShrink:0 }}>{a.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span style={{ fontSize:12, fontWeight:900 }}>{a.title}</span>
                      <span style={{ fontSize:9, fontWeight:900, letterSpacing:'.06em', padding:'2px 6px', borderRadius:999, background:tierColor, color: a.rarity==='legendary'?'#fff':'#0b0d12' }}>{a.rarity.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.35, marginTop:2 }}>{a.description}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6, flexWrap:'wrap' }}>
                      <span style={{ fontSize:10, fontWeight:800, padding:'3px 7px', borderRadius:999, border:'1px solid var(--line)', background:'rgba(255,255,255,.06)', display:'flex', alignItems:'center', gap:6 }}><Gamepad2 size={11}/> {gi?.title || a.gameId}</span>
                      <span style={{ fontSize:10, fontWeight:900, padding:'3px 7px', borderRadius:999, background: unlockedOne?'var(--lime)':'rgba(255,255,255,.08)', color: unlockedOne?'#0b0d12':'var(--muted)' }}>{a.points} pts</span>
                      {onPlayGame && <button onClick={()=> onPlayGame(a.gameId)} style={{ fontSize:10, fontWeight:900, padding:'4px 8px', borderRadius:999, border:'1px solid var(--line)', background:'#fff', color:'#0b0d12', cursor:'pointer' }}>Play →</button>}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
                      <div style={{ flex:1, height:6, borderRadius:999, background:'rgba(255,255,255,.09)', overflow:'hidden' }}>
                        <div style={{ width:`${pct}%`, height:'100%', background: unlockedOne ? 'linear-gradient(90deg, var(--lime), #7dd3ff)' : 'linear-gradient(90deg, #7d6bff, #d7f34a)', transition:'width 400ms ease' }} />
                      </div>
                      <span style={{ fontSize:11, fontWeight:900, color: unlockedOne?'#22c55e':'var(--foreground)' }}>{a.progress||0}/{a.target} {a.unit||''}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {filtered.length===0 && <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}><Target size={24} style={{ margin:'0 auto 10px', display:'block' }}/> No achievements match that filter.</div>}
        </div>

        {/* footer */}
        <div style={{ padding:'12px 14px', borderTop:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap', background:'rgba(255,255,255,.02)' }}>
          <span style={{ fontSize:11, color:'var(--muted)', display:'flex', alignItems:'center', gap:6 }}><Medal size={12}/> Earn {total} trophies across 30 games • {points} points so far</span>
          <button onClick={onClose} style={{ padding:'10px 16px', borderRadius:999, background:'#0b0d12', color:'#fff', border:'1px solid rgba(255,255,255,.12)', fontWeight:900, cursor:'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  )
}
