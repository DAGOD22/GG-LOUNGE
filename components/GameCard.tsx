'use client'
import { useState } from 'react'
import { Heart, Play, Keyboard } from 'lucide-react'
import type { Game } from '@/lib/games'
import { CONTROLS_LEGEND } from '@/lib/games'

function Highlight({ text, query }: { text:string; query:string }){
  if(!query) return <>{text}</>
  const q=query.trim(); if(!q) return <>{text}</>
  const li=text.toLowerCase().indexOf(q.toLowerCase())
  if(li===-1) return <>{text}</>
  return <>{text.slice(0,li)}<mark className="hl">{text.slice(li, li+q.length)}</mark>{text.slice(li+q.length)}</>
}

export function GameCard({
  game,
  index,
  isFavorite,
  onToggle,
  onLaunch,
  variant = 'grid',
  query = '',
  priority = false,
}: {
  game: Game
  index: number
  isFavorite: boolean
  onToggle: (id: string) => void
  onLaunch: (g: Game) => void
  variant?: 'grid' | 'shelf'
  query?: string
  priority?: boolean
}) {
  const [imgSrc, setImgSrc] = useState(game.icon || '')
  const [imgError, setImgError] = useState(false)
  const showIcon = !!imgSrc && !imgError
  const controls = (CONTROLS_LEGEND as any)[game.genre] || CONTROLS_LEGEND.default

  return (
    <article className={`game-card ${game.color}`} style={{ contentVisibility: 'auto' as any }}>
      <button
        className="favorite-button"
        onClick={() => onToggle(game.id)}
        aria-label={`${isFavorite ? 'Remove' : 'Add'} ${game.title}`}
      >
        <Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div
        className="game-art game-art--full"
        onClick={() => onLaunch(game)}
        role="button"
        tabIndex={0}
        aria-label={`Play ${game.title}`}
        onKeyDown={(e) => e.key === 'Enter' && onLaunch(game)}
        style={{ cursor: 'pointer' }}
      >
        {showIcon ? (
          <img
            className="game-icon game-icon--cover"
            src={imgSrc}
            alt={`${game.title} icon`}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto' as any}
            onError={() => {
              if (imgSrc.endsWith('.webp')) setImgSrc(imgSrc.replace('.webp', '.png'))
              else setImgError(true)
            }}
          />
        ) : (
          <div className="game-cover-fallback" aria-hidden="true">
            <span className="game-mark game-mark--huge">{game.mark}</span>
            <span className="game-cover-title">{game.title}</span>
          </div>
        )}
        <div className="game-art-overlay" aria-hidden="true">
          <small>{String(index + 1).padStart(2, '0')}</small>
          <span className="art-play"><Play size={14} fill="currentColor" /></span>
        </div>
        <div className="game-hover-controls" aria-hidden="true" style={{position:'absolute', bottom:8, left:8, right:8, background:'rgba(11,13,18,.88)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,.14)', borderRadius:10, padding:'7px 8px', display:'flex', alignItems:'center', gap:6, opacity:0, transform:'translateY(4px)', transition:'all .18s', pointerEvents:'none'}}>
          <Keyboard size={12} color="var(--lime)" style={{flexShrink:0}} /><span style={{fontSize:10, fontWeight:700, color:'#fff', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{controls}</span>
        </div>
      </div>
      <div className="game-info">
        <div>
          <p className="card-kicker">
            {game.genre} · {game.tone}
          </p>
          <h3><Highlight text={game.title} query={query} /></h3>
          <p><Highlight text={game.description} query={query} /></p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="play-button" onClick={() => onLaunch(game)}>
            <Play size={13} fill="currentColor" /> Launch
          </button>
          {isFavorite && (
            <span style={{ alignSelf: 'center', fontSize: 11, color: 'var(--coral)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Heart size={12} fill="currentColor" /> Saved
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

export function ShelfCard({
  game,
  index,
  isFavorite,
  onToggle,
  onLaunch,
  query = '',
  priority = false,
}: {
  game: Game
  index: number
  isFavorite: boolean
  onToggle: (id: string) => void
  onLaunch: (g: Game) => void
  query?: string
  priority?: boolean
}) {
  const [imgSrc, setImgSrc] = useState(game.icon || '')
  const [imgError, setImgError] = useState(false)
  const showIcon = !!imgSrc && !imgError
  const controls = (CONTROLS_LEGEND as any)[game.genre] || CONTROLS_LEGEND.default
  return (
    <article className={`shelf-card-art ${game.color}`} style={{ contentVisibility: 'auto' as any }}>
      <button className="favorite-button" onClick={() => onToggle(game.id)} aria-label={`${isFavorite ? 'Remove' : 'Add'} ${game.title}`}>
        <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div
        className="shelf-art shelf-art--full"
        onClick={() => onLaunch(game)}
        role="button"
        tabIndex={0}
        aria-label={`Play ${game.title}`}
        onKeyDown={(e) => e.key === 'Enter' && onLaunch(game)}
      >
        {showIcon ? (
          <img
            className="game-icon game-icon--cover"
            src={imgSrc}
            alt={`${game.title} icon`}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto' as any}
            onError={() => {
              if (imgSrc.endsWith('.webp')) setImgSrc(imgSrc.replace('.webp', '.png'))
              else setImgError(true)
            }}
          />
        ) : (
          <div className="game-cover-fallback" aria-hidden="true">
            <span className="game-mark game-mark--huge" style={{ fontSize: 42 }}>{game.mark}</span>
            <span className="game-cover-title" style={{fontSize:10}}>{game.title}</span>
          </div>
        )}
        <div className="game-art-overlay" aria-hidden="true">
          <small>{String(index + 1).padStart(2, '0')}</small>
          <span className="art-play"><Play size={12} fill="currentColor" /></span>
        </div>
        <div className="game-hover-controls" aria-hidden="true" style={{position:'absolute', bottom:6, left:6, right:6, background:'rgba(11,13,18,.88)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,.14)', borderRadius:9, padding:'6px 7px', display:'flex', alignItems:'center', gap:5, opacity:0, transform:'translateY(4px)', transition:'all .18s', pointerEvents:'none'}}>
          <Keyboard size={11} color="var(--lime)" style={{flexShrink:0}} /><span style={{fontSize:9, fontWeight:700, color:'#fff', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{controls}</span>
        </div>
      </div>
      <div className="shelf-info">
        <p className="card-kicker" style={{ fontSize: 9 }}>
          {game.genre} · {game.tone}
        </p>
        <h4 onClick={() => onLaunch(game)} style={{ cursor: 'pointer' }}>
          <Highlight text={game.title} query={query} />
        </h4>
        <p><Highlight text={game.description} query={query} /></p>
        <button className="play-button" onClick={() => onLaunch(game)} aria-label={`Play ${game.title}`}>
          <Play size={12} fill="currentColor" /> Play
        </button>
      </div>
    </article>
  )
}
