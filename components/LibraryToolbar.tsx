'use client'
import { Search, X, ListFilter, LayoutGrid, Rows3, Shuffle, Filter, Star, Keyboard } from 'lucide-react'
import { pluralize } from '@/lib/site-kit'

export function LibraryToolbar({
  query, setQuery, allGames,
  sortBy, setSortBy,
  view, setView,
  hideLow, setHideLow,
  showStaffOnly, setShowStaffOnly,
  shufflePick, resultCount = 0
}: any){
  return (
    <div className="toolbar">
      <div className="search-wrap" style={{position:'relative'}}>
        <Search size={17} />
        <input
          id="main-search"
          type="search"
          value={query}
          onChange={(e)=> setQuery(e.target.value)}
          placeholder={`Search ${allGames.length} titles, genres, moods`}
          aria-label="Search games"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          style={{flex:1}}
        />
        {query && <button onClick={()=> setQuery('')} aria-label="Clear search" style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',width:22,height:22,borderRadius:999,border:'1px solid var(--line)',background:'var(--panel)',display:'grid',placeItems:'center',cursor:'pointer',color:'var(--muted)'}}><X size={12}/></button>}
      </div>
      {/* The count speaks politely, so a screen-reader user hears the result set
          change as they type without the whole toolbar being re-announced. */}
      <p className="toolbar-count" role="status" aria-live="polite">
        {query.trim() ? pluralize(resultCount, 'match', 'matches') : `${pluralize(allGames.length, 'title')} in the catalogue`}
      </p>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6,alignItems:'center',padding:'4px 6px',borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.04)'}}>
          <ListFilter size={12}/><span style={{fontSize:11,fontWeight:800}}>Sort</span>
          <select value={sortBy} onChange={e=> setSortBy(e.target.value)} aria-label="Sort games" style={{background:'transparent',color:'var(--foreground)',border:0,fontSize:12,fontWeight:700,outline:'none'}}>
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
        {/* Arrow keys move between cards; this says so, because a keyboard
            feature nobody knows about is a keyboard feature nobody uses. */}
        <span className="grid-key-hint" title="Tab to the grid, then use the arrow keys">
          <Keyboard size={12}/> Arrows move
        </span>
        <button onClick={()=> setHideLow((v:boolean)=>!v)} aria-pressed={hideLow} title="Hide low quality duplicates" style={{padding:'6px 10px',borderRadius:999,border: hideLow?'1px solid var(--lime)':'1px solid var(--line)',background: hideLow?'var(--lime)':'rgba(255,255,255,.06)',color: hideLow?'#0b0d12':'var(--foreground)',fontWeight:800,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}><Filter size={12}/>{hideLow?'Filtered':'Filter duplicates'}</button>
        <button onClick={()=> setShowStaffOnly((v:boolean)=>!v)} aria-pressed={showStaffOnly} title="Staff picks only" style={{padding:'6px 10px',borderRadius:999,border: showStaffOnly?'1px solid var(--lime)':'1px solid var(--line)',background: showStaffOnly?'var(--lime)':'rgba(255,255,255,.06)',color: showStaffOnly?'#0b0d12':'var(--foreground)',fontWeight:800,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}><Star size={12} fill={showStaffOnly?'currentColor':'none'}/>{showStaffOnly?'Staff only':'All'}</button>
      </div>
    </div>
  )
}
