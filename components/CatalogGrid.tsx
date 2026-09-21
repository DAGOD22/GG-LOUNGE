'use client'
import { GameCard, ShelfCard } from '@/components/GameCard'
import { Shuffle, Zap, Rows3 } from 'lucide-react'
import type { Game } from '@/lib/games'

export function CatalogGrid({
  view, filter, query, visibleGames, paginatedGames, grouped, staffGames, allGames,
  favorites, toggleFavorite, launch, loadMoreRef, visibleCount, setVisibleCount,
  setQuery, setFilter, setHideLow, setShowStaffOnly, shufflePick
}: any){
  if(view==='shelves' && filter==='All games' && !query.trim()){
    return (
      <div className="shelves">
        <div className="shelf">
          <div className="shelf-head">
            <h3>Staff Picks <span>{staffGames.length}</span></h3>
            <div className="shelf-actions"><span style={{fontSize:11,color:'var(--muted)',fontWeight:700}}>Hand-curated • no filler</span></div>
          </div>
          <div className="shelf-track" style={{contentVisibility:'auto'}}>
            {staffGames.map((g:Game,i:number)=> <ShelfCard key={`staff-${g.id}`} game={g} index={i} isFavorite={favorites.includes(g.id)} onToggle={toggleFavorite} onLaunch={launch} query={query} priority={i<2} />)}
          </div>
        </div>
        {grouped.map(([genre, list]:[string, Game[]])=> (
          <div key={genre} className="shelf">
            <div className="shelf-head">
              <h3>{genre} <span>{list.length}</span></h3>
              <div className="shelf-actions">
                <button className="shelf-nav" aria-label={`Scroll ${genre} left`} onClick={e=>{ const tr = (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement); if(tr) tr.scrollBy({left:-380,behavior:'smooth'})}}>&lt;</button>
                <button className="shelf-nav" aria-label={`Scroll ${genre} right`} onClick={e=>{ const tr = (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement); if(tr) tr.scrollBy({left:380,behavior:'smooth'})}}>&gt;</button>
                <button className="btn-mini" onClick={()=> setFilter(genre)}>View all</button>
              </div>
            </div>
            <div className="shelf-track" style={{contentVisibility:'auto'}}>
              {list.slice(0,14).map((g:Game,i:number)=> <ShelfCard key={g.id} game={g} index={i} isFavorite={favorites.includes(g.id)} onToggle={toggleFavorite} onLaunch={launch} query={query} />)}
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <>
      <div className="game-grid" style={{contentVisibility:'auto',containIntrinsicSize:'0 600px'}}>
        {paginatedGames.map((g:Game,i:number)=> <GameCard key={g.id} game={g} index={i} isFavorite={favorites.includes(g.id)} onToggle={toggleFavorite} onLaunch={launch} query={query} priority={i<4} />)}
      </div>
      {visibleGames.length===0 && (
        <div className="empty-state" role="status" aria-live="polite">
          <Zap size={22} />
          <h3>No games found for “{query || filter}”</h3>
          <p>Try a different search or clear the filter.</p>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',marginTop:12}}>
            <button onClick={()=> { setQuery(''); setFilter('All games'); setHideLow(false); setShowStaffOnly(false) }} style={{padding:'8px 14px',borderRadius:999,border:'1px solid var(--lime)',background:'var(--lime)',color:'#0b0d12',fontWeight:800,cursor:'pointer'}}>Clear all filters</button>
            <button onClick={shufflePick} style={{padding:'8px 14px',borderRadius:999,border:'1px solid var(--line)',background:'var(--panel)',color:'var(--foreground)',fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}><Shuffle size={12}/> Surprise me</button>
            {staffGames.slice(0,4).map((g:Game)=> <button key={g.id} onClick={()=> launch(g)} style={{padding:'8px 12px',borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.06)',color:'var(--foreground)',fontWeight:700,cursor:'pointer'}}>{g.title}</button>)}
          </div>
        </div>
      )}
      {visibleGames.length > paginatedGames.length && (
        <>
          <div ref={loadMoreRef} style={{height:1}} aria-hidden="true" />
          <div style={{display:'flex',justifyContent:'center',marginTop:18}}>
            <button onClick={()=> setVisibleCount((c:number)=> c+36)} style={{padding:'10px 18px',borderRadius:999,border:'1px solid var(--line)',background:'var(--panel)',color:'var(--foreground)',fontWeight:800,cursor:'pointer'}}>Load more — {visibleGames.length - paginatedGames.length} remaining</button>
          </div>
        </>
      )}
      <p style={{textAlign:'center',marginTop:10,fontSize:11,color:'var(--muted)'}} aria-live="polite">Showing {paginatedGames.length} of {visibleGames.length} • {allGames.length} total</p>
    </>
  )
}
