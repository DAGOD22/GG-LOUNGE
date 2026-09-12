'use client'
import { useState } from 'react'
import { Heart, Play } from 'lucide-react'
import type { Game } from '@/lib/games'

export function GameCard({
  game,
  index,
  isFavorite,
  onToggle,
  onLaunch,
  variant = 'grid',
}: {
  game: Game
  index: number
  isFavorite: boolean
  onToggle: (id: string) => void
  onLaunch: (g: Game) => void
  variant?: 'grid' | 'shelf'
}) {
  const [imgError, setImgError] = useState(false)
  const showIcon = !!game.icon && !imgError

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
        className="game-art"
        onClick={() => onLaunch(game)}
        role="button"
        tabIndex={0}
        aria-label={`Play ${game.title}`}
        onKeyDown={(e) => e.key === 'Enter' && onLaunch(game)}
        style={{ cursor: 'pointer' }}
      >
        {showIcon ? (
          <img
            className="game-icon"
            src={game.icon}
            alt={`${game.title} icon`}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, background: 'rgba(255,255,255,.08)', padding: 6 }}
          />
        ) : (
          <span className="game-mark" aria-hidden="true">
            {game.mark}
          </span>
        )}
        <small aria-hidden="true">{String(index + 1).padStart(2, '0')}</small>
      </div>
      <div className="game-info">
        <div>
          <p className="card-kicker">
            {game.genre} · {game.tone}
          </p>
          <h3>{game.title}</h3>
          <p>{game.description}</p>
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
}: {
  game: Game
  index: number
  isFavorite: boolean
  onToggle: (id: string) => void
  onLaunch: (g: Game) => void
}) {
  const [imgError, setImgError] = useState(false)
  const showIcon = !!game.icon && !imgError
  return (
    <article className={`shelf-card-art ${game.color}`} style={{ contentVisibility: 'auto' as any }}>
      <button className="favorite-button" onClick={() => onToggle(game.id)} aria-label={`${isFavorite ? 'Remove' : 'Add'} ${game.title}`}>
        <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div
        className="shelf-art"
        onClick={() => onLaunch(game)}
        role="button"
        tabIndex={0}
        aria-label={`Play ${game.title}`}
        onKeyDown={(e) => e.key === 'Enter' && onLaunch(game)}
      >
        {showIcon ? (
          <img
            className="game-icon"
            src={game.icon}
            alt={`${game.title} icon`}
            loading="lazy"
            style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, background: 'rgba(255,255,255,.08)', padding: 6 }}
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="game-mark" style={{ fontSize: 32 }} aria-hidden="true">
            {game.mark}
          </span>
        )}
        <small aria-hidden="true">{String(index + 1).padStart(2, '0')}</small>
      </div>
      <div className="shelf-info">
        <p className="card-kicker" style={{ fontSize: 9 }}>
          {game.genre} · {game.tone}
        </p>
        <h4 onClick={() => onLaunch(game)} style={{ cursor: 'pointer' }}>
          {game.title}
        </h4>
        <p>{game.description}</p>
        <button className="play-button" onClick={() => onLaunch(game)} aria-label={`Play ${game.title}`}>
          <Play size={12} fill="currentColor" /> Play
        </button>
      </div>
    </article>
  )
}
