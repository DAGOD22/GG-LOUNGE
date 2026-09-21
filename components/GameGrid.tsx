'use client'
import { GameCard, ShelfCard } from '@/components/GameCard'
import type { Game } from '@/lib/games'

export function GameGrid({ games, favorites, onToggle, onLaunch, query }: { games: Game[], favorites: string[], onToggle: (id:string)=>void, onLaunch: (g:Game)=>void, query: string }){
  return (
    <div className="game-grid" style={{contentVisibility:'auto', containIntrinsicSize:'0 600px'}}>
      {games.map((game, i)=> <GameCard key={game.id} game={game} index={i} isFavorite={favorites.includes(game.id)} onToggle={onToggle} onLaunch={onLaunch} query={query} />)}
    </div>
  )
}
export function ShelfGrid({ groups, favorites, onToggle, onLaunch, query }: { groups: [string, Game[]][], favorites: string[], onToggle:any, onLaunch:any, query:string }){
  return (
    <>
      {groups.map(([genre, list])=> (
        <div key={genre} style={{marginBottom: 18}}>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}><h3 style={{margin:0, fontSize:16, fontWeight:900}}>{genre}</h3><span style={{padding:'2px 8px', borderRadius:999, background:'rgba(255,255,255,.08)', fontSize:11}}>{list.length}</span></div>
          <div style={{display:'flex', gap:12, overflowX:'auto', paddingBottom:8}}>
            {list.slice(0,8).map((g,i)=> <ShelfCard key={g.id} game={g} index={i} isFavorite={favorites.includes(g.id)} onToggle={onToggle} onLaunch={onLaunch} query={query} />)}
          </div>
        </div>
      ))}
    </>
  )
}
