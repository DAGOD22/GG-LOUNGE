'use client'
import { Crown, Globe, Flame, ShieldCheck, Star, Heart, Timer, Trophy, Sparkles, Play, ArrowUpRight } from 'lucide-react'
import type { Game } from '@/lib/games'
import { PROXY_TILES } from '@/lib/games'

export function HomeDashboard({
  gameOfDay, allGames, leaderboard, favorites, recentlyPlayed,
  authUser, achSummary, showDashboard, setShowDashboard,
  leaderTab, setLeaderTab, launch, openProxyTile, setShowAchievementsHub, setRecentlyPlayed
}: any) {
  return (
    <section className="catalog" style={{paddingTop:12, paddingBottom:8}}>
      <button onClick={()=> setShowDashboard((v:boolean)=>!v)} style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderRadius:14, border:'1px solid var(--line)', background: showDashboard ? 'rgba(215,243,74,.10)' : 'var(--panel)', cursor:'pointer'}}>
        <span style={{display:'flex', alignItems:'center', gap:10, fontWeight:900, fontSize:13}}><Sparkles size={14} color="var(--lime)"/> Lounge dashboard <span style={{fontSize:11, fontWeight:700, color:'var(--muted)'}}>Game of Day • Leaderboard • Your Lounge • Achievements</span></span>
        <span style={{display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:800, color: showDashboard ? '#0b0d12' : 'var(--foreground)', background: showDashboard ? 'var(--lime)' : 'rgba(255,255,255,.08)', padding:'6px 12px', borderRadius:999}}>{showDashboard ? 'Hide' : 'Show'} ▾</span>
      </button>
      {showDashboard && (
        <div style={{display:'grid', gap:14, marginTop:14}}>
          <section className="catalog" style={{paddingTop:14,paddingBottom:6, paddingInline:0, maxWidth:'none', margin:0}}>
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
                  {PROXY_TILES.map((tile:any)=> (
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

          <section className="catalog" style={{paddingTop:8,paddingBottom:6, paddingInline:0, maxWidth:'none', margin:0}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))',gap:14}}>
              <div style={{border:'1px solid var(--line)',borderRadius:16,background:'var(--panel)',padding:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <p className="eyebrow" style={{margin:0,display:'flex',alignItems:'center',gap:6}}><Flame size={12}/> LEADERBOARD — most played</p>
                  <span style={{display:'flex',gap:6}}>
                    <button onClick={()=> setLeaderTab('today')} style={{padding:'5px 9px',borderRadius:999,border: leaderTab==='today'?'1px solid var(--lime)':'1px solid var(--line)',background: leaderTab==='today'?'var(--lime)':'transparent',color: leaderTab==='today'?'#0b0d12':'var(--foreground)',fontWeight:800,fontSize:11,cursor:'pointer'}}>Today</button>
                    <button onClick={()=> setLeaderTab('week')} style={{padding:'5px 9px',borderRadius:999,border: leaderTab==='week'?'1px solid var(--lime)':'1px solid var(--line)',background: leaderTab==='week'?'var(--lime)':'transparent',color: leaderTab==='week'?'#0b0d12':'var(--foreground)',fontWeight:800,fontSize:11,cursor:'pointer'}}>Week</button>
                  </span>
                </div>
                {!authUser && <div style={{padding:'8px 12px', borderRadius:10, background:'rgba(255,255,255,.04)', border:'1px solid var(--line)', fontSize:11, display:'flex',alignItems:'center',gap:6, marginBottom:8}}>🌍 Global plays — sign in to have yours counted</div>}
                <div style={{display:'grid',gap:8}}>
                  {leaderboard.map((e:any,i:number)=> (
                    <button key={e.game.id} onClick={()=> launch(e.game)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 10px',borderRadius:12,border:'1px solid var(--line)',background:'rgba(255,255,255,.03)',cursor:'pointer',textAlign:'left'}}>
                      <span style={{width:28,height:28,borderRadius:999,background: i===0?'var(--lime)': i===1?'#cbd5e1': i===2?'#fdba74':'rgba(255,255,255,.08)',color: i<3?'#0b0d12':'var(--foreground)',display:'grid',placeItems:'center',fontWeight:900,fontSize:12}}>{i+1}</span>
                      {e.game.icon ? <img src={e.game.icon} alt="" style={{width:36,height:36,borderRadius:10,objectFit:'cover', flexShrink:0, border:'1px solid rgba(255,255,255,.12)'}} onError={(ev:any)=> (ev.currentTarget.style.display='none')} /> : <span style={{width:36,height:36,borderRadius:10,background:'var(--line)',display:'grid',placeItems:'center',fontWeight:900,fontSize:12,flexShrink:0}}>{e.game.mark}</span>}
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
                  <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:8}}>
                    {allGames.filter((g:any)=> favorites.includes(g.id)).map((g:any)=> (
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
                  <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>
                    {allGames.filter((g:any)=> recentlyPlayed.includes(g.id)).slice(0,8).map((g:any)=> (
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

          <section className="catalog" style={{paddingTop:8,paddingBottom:10, paddingInline:0, maxWidth:'none', margin:0}}>
            <div style={{border:'1px solid var(--line)', borderRadius:18, overflow:'hidden', background:'linear-gradient(135deg, rgba(125,107,255,.12), rgba(215,243,74,.10)), var(--panel)', padding:0}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'14px 16px',flexWrap:'wrap',borderBottom:'1px solid var(--line)'}}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <span style={{width:40,height:40,borderRadius:12,display:'grid',placeItems:'center',background:'linear-gradient(135deg, var(--lime), #7dd3ff)',color:'#0b0d12'}}><Trophy size={18}/></span>
                  <div>
                    <div style={{fontSize:14,fontWeight:950,display:'flex',alignItems:'center',gap:8}}>Achievements <span style={{fontSize:10,padding:'3px 7px',borderRadius:999,background:'var(--lime)',color:'#0b0d12',fontWeight:900}}>{authUser ? `${achSummary?.unlocked||0} UNLOCKED` : '180+ TROPHIES'}</span></div>
                    <div style={{fontSize:11,color:'var(--muted)',fontWeight:700}}>{authUser ? `${achSummary?.points||0} points` : 'Sign in to save progress'}</div>
                  </div>
                </div>
                <button onClick={()=> setShowAchievementsHub(true)} style={{padding:'9px 14px',borderRadius:999,background:'#0b0d12',color:'#fff',border:'1px solid rgba(255,255,255,.12)',fontWeight:900,fontSize:12,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}><Sparkles size={14}/> View all <ArrowUpRight size={14}/></button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:10,padding:14}}>
                {[
                  { id:'cookie-clicker', title:'Cookie Clicker', desc:'Bake 100k cookies', icon:'🍪', color:'linear-gradient(135deg, #ffb86a, #ff6c83)' },
                  { id:'ragdoll-archers', title:'Ragdoll Archers', desc:'25 headshots', icon:'🏹', color:'linear-gradient(135deg, #7dd3ff, #7d6bff)' },
                ].map(card=> (
                  <button key={card.id} onClick={()=> { const g=allGames.find((x:any)=> x.id===card.id); if(g) launch(g); }} style={{textAlign:'left',padding:14,borderRadius:14,border:'1px solid var(--line)',background:'rgba(255,255,255,.03)',cursor:'pointer',display:'flex',gap:12,alignItems:'center'}}>
                    <span style={{width:44,height:44,borderRadius:12,background:card.color,display:'grid',placeItems:'center',fontSize:18,flexShrink:0}}>{card.icon}</span>
                    <span style={{flex:1,minWidth:0}}><strong style={{display:'block',fontSize:12}}>{card.title}</strong><span style={{fontSize:11,color:'var(--muted)'}}>{card.desc}</span></span>
                    <Play size={14} fill="currentColor" />
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
