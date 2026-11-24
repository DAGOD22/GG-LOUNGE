'use client'
/**
 * The strip of small features under the hero.
 *
 * A daily pick, a share row, a tip, and the genre breakdown. Each of these is a
 * real feature rather than decoration: the daily pick gives people a reason to
 * come back, the share row is how a link actually travels, and the genre counts
 * double as the answer to "what is even in here".
 *
 * Everything is computed from props on the client, so the strip costs no extra
 * request and cannot disagree with the catalogue above it.
 */
import { useCallback, useMemo, useState } from 'react'
import { CalendarDays, Check, Copy, Share2, Sparkles, TrendingUp } from 'lucide-react'

import {
  dailyPicks, dayProgress, estimatedSessionMinutes, genreCounts, localDayKey,
  SITE_TIPS, shareTargets, tipOfTheDay, whyThisGame, type CatalogEntry,
} from '@/lib/site-extras'

export type DailyGame = CatalogEntry & { id: string; title: string }

/* ---------------- daily pick ---------------- */

export function DailyPick({
  games,
  genres,
  onLaunch,
  playCounts,
}: {
  games: DailyGame[]
  genres: string[]
  onLaunch: (game: DailyGame) => void
  playCounts: Record<string, number>
}) {
  const [now] = useState(() => new Date())
  const picks = useMemo(() => dailyPicks(games, genres, now), [games, genres, now])
  const progress = dayProgress(now)
  const hoursLeft = Math.max(0, 24 - Math.floor(progress * 24))

  if (!picks.game) return null

  const reason = whyThisGame(picks.game, { playCount: playCounts[picks.game.id], sameGenre: games.filter(game => game.genre === picks.game!.genre).length })
  const session = estimatedSessionMinutes(picks.game.genre)

  return (
    <section className="extras-card extras-daily" aria-labelledby="daily-pick-title">
      <header className="extras-head">
        <span className="extras-eyebrow"><CalendarDays size={12} /> Daily pick</span>
        <span className="extras-meta">changes in {hoursLeft}h</span>
      </header>
      <h3 id="daily-pick-title">{picks.game.title}</h3>
      <p className="extras-copy">{reason}</p>
      <div className="extras-chips">
        {picks.game.genre ? <span className="extras-chip">{picks.game.genre}</span> : null}
        <span className="extras-chip">about {session} min</span>
        {picks.genre ? <span className="extras-chip">genre of the day: {picks.genre}</span> : null}
      </div>
      <div className="extras-progress" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></div>
      <button type="button" className="extras-play" onClick={() => onLaunch(picks.game!)}>
        Play {picks.game.title} →
      </button>
    </section>
  )
}

/* ---------------- share row ---------------- */

export function ShareRow({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window === 'undefined' ? path : `${window.location.origin}${path}`

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
      // Let the achievement tracker know a share happened, without coupling the
      // component to it.
      window.dispatchEvent(new CustomEvent('ggl:share', { detail: { path } }))
    } catch {
      // A blocked clipboard is not worth an error message here: the link is
      // visible in the input below and can be selected by hand.
    }
  }, [url, path])

  const targets = useMemo(() => shareTargets(title, url), [title, url])

  return (
    <section className="extras-card" aria-labelledby="share-title">
      <header className="extras-head">
        <span className="extras-eyebrow"><Share2 size={12} /> Share</span>
        <span className="extras-meta">{dayProgress() > 0.5 ? 'send it to one person' : 'the hardest part of sharing'}</span>
      </header>
      <h3 id="share-title">Send this to someone</h3>
      <div className="extras-share">
        <input className="extras-share-input" value={url} readOnly aria-label="Share link" onFocus={event => event.target.select()} />
        <button type="button" className="extras-copybtn" onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="extras-share-targets">
        {targets.map(target => (
          <a
            key={target.id}
            href={target.url}
            target="_blank"
            rel="noopener noreferrer"
            className="extras-chip"
            onClick={() => window.dispatchEvent(new CustomEvent('ggl:share', { detail: { path, target: target.id } }))}
          >
            {target.label}
          </a>
        ))}
      </div>
    </section>
  )
}

/* ---------------- the rest of the strip ---------------- */

export function GenreBreakdown({ games }: { games: { genre?: string }[] }) {
  const counts = useMemo(() => genreCounts(games), [games])
  const total = games.length || 1
  return (
    <section className="extras-card" aria-labelledby="genres-title">
      <header className="extras-head">
        <span className="extras-eyebrow"><TrendingUp size={12} /> By category</span>
        <span className="extras-meta">{counts.length} genres</span>
      </header>
      <h3 id="genres-title">What is in here</h3>
      <div className="extras-bars">
        {counts.slice(0, 6).map(entry => (
          <div key={entry.genre} className="extras-bar-row">
            <span className="extras-bar-label">{entry.genre}</span>
            <span className="extras-bar-track"><span className="extras-bar-fill" style={{ width: `${(entry.count / total) * 100}%` }} /></span>
            <span className="extras-bar-count">{entry.count}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function TipOfTheDay() {
  const [tip] = useState(() => tipOfTheDay())
  const [index, setIndex] = useState(0)
  // A tiny rotation on click, because a tip you cannot change is a tip you read
  // once and then resent.
  const next = useCallback(() => setIndex(value => value + 1), [])
  const shown = index === 0 ? tip : SITE_TIPS[(index - 1) % SITE_TIPS.length]
  return (
    <section className="extras-card" aria-labelledby="tip-title">
      <header className="extras-head">
        <span className="extras-eyebrow"><Sparkles size={12} /> Did you know</span>
        <button type="button" className="extras-meta extras-link" onClick={next}>another</button>
      </header>
      <h3 id="tip-title" className="extras-tip">{shown}</h3>
      <p className="extras-copy">Everything here works with a keyboard, and nothing needs an account except saving progress.</p>
    </section>
  )
}

export function SiteExtras({
  games,
  genres,
  onLaunch,
  playCounts,
  shareTitle,
  sharePath,
}: {
  games: DailyGame[]
  genres: string[]
  onLaunch: (game: DailyGame) => void
  playCounts: Record<string, number>
  shareTitle: string
  sharePath: string
}) {
  const key = localDayKey()
  return (
    <section className="extras-strip" aria-label="Today at GG Lounge" data-day={key}>
      <DailyPick games={games} genres={genres} onLaunch={onLaunch} playCounts={playCounts} />
      <ShareRow title={shareTitle} path={sharePath} />
      <GenreBreakdown games={games} />
      <TipOfTheDay />
    </section>
  )
}
