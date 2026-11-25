'use client'
/**
 * "Next up" — a short recommendation rail under the catalogue.
 *
 * The catalogue is 250 cards deep, which means most of it is never seen. This
 * rail shows six, chosen by `recommendGames` from what the visitor has actually
 * played, so it is a second door into the same room rather than more of the same
 * wall.
 *
 * Kept separate from the catalogue grid because it has a different job: the grid
 * is for searching, this is for deciding.
 */
import { useMemo, useState } from 'react'
import { ArrowUpRight, Dices, RotateCcw } from 'lucide-react'

import { recommendGames, similarGames, whyThisGame, type CatalogEntry } from '@/lib/site-extras'

export type RailGame = CatalogEntry & { id: string; title: string; icon?: string }

export function NextUpRail({
  games,
  playCounts,
  recentlyPlayed,
  onLaunch,
}: {
  games: RailGame[]
  playCounts: Record<string, number>
  recentlyPlayed: string[]
  onLaunch: (game: RailGame) => void
}) {
  // Seeded from the most recent game so the rail is stable while a person is
  // looking at it, and changes when they play something else.
  const recent = recentlyPlayed[0]
  const [skipped, setSkipped] = useState<string[]>([])
  const [seed, setSeed] = useState(0)

  const picks = useMemo(() => {
    const anchor = games.find(game => game.id === recent)
    const pool = anchor ? [...similarGames(games, anchor, 8), ...recommendGames(games, playCounts, 12)] : recommendGames(games, playCounts, 12)
    const seen = new Set<string>()
    const unique: RailGame[] = []
    for (const game of pool) {
      if (seen.has(game.id) || game.id === recent || skipped.includes(game.id)) continue
      seen.add(game.id)
      unique.push(game as RailGame)
    }
    // `seed` rotates the window so "show me others" is not the same six again.
    return unique.slice(seed % Math.max(1, unique.length - 5), (seed % Math.max(1, unique.length - 5)) + 6);
  }, [games, playCounts, recent, skipped, seed])

  if (!picks.length) return null

  return (
    <section className="nextup" aria-labelledby="nextup-title">
      <header className="nextup-head">
        <div>
          <p className="eyebrow">IF YOU LIKED THAT</p>
          <h2 id="nextup-title">Next up<span>.</span></h2>
        </div>
        <div className="nextup-actions">
          <button type="button" onClick={() => setSeed(value => value + 1)}><Dices size={13} /> Show me others</button>
          <button type="button" onClick={() => { setSkipped([]); setSeed(0) }}><RotateCcw size={13} /> Reset</button>
        </div>
      </header>
      <div className="nextup-grid">
        {picks.map(game => (
          <article key={game.id} className="nextup-card">
            <h3>{game.title}</h3>
            {game.genre ? <span className="nextup-genre">{game.genre}</span> : null}
            <p>{whyThisGame(game, { playCount: playCounts[game.id] })}</p>
            <div className="nextup-buttons">
              <button type="button" className="nextup-play" onClick={() => onLaunch(game)}>
                Play <ArrowUpRight size={12} />
              </button>
              <button type="button" className="nextup-skip" onClick={() => setSkipped(list => [...list, game.id])} aria-label={`Never suggest ${game.title}`}>
                Not this
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="nextup-note">
        Suggestions come from what you have played and what is featured — not from a profile of you, because
        there is no profile of you. “Not this” hides a title for the rest of the visit.
      </p>
    </section>
  )
}
