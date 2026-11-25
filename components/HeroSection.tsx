'use client'
/**
 * The hero: the headline, the three entry buttons, the stat strip and the
 * spotlight card.
 *
 * Lifted out of app/page.tsx for the same reason as the header — the page was
 * doing everything — but this block differs in one way that matters: it is the
 * first thing in the document and it carries the largest single chunk of markup
 * on the site. Keeping it here means a change to the headline or the spotlight
 * cannot accidentally touch catalogue state, and vice versa.
 *
 * A note on `spotlight`: the carousel index lives in the page and is advanced on
 * a timer there. This component only draws what it is given, which is what makes
 * it safe to render twice (the tests do).
 */
import { ArrowUpRight, Flame, Gift, Keyboard, Play, Shuffle, Sparkles } from 'lucide-react'
import type { Game } from '@/lib/games'
import { Reveal } from '@/components/Reveal'

export function HeroSection({
  gameCount,
  streak,
  spotlight,
  spotIdx,
  featuredCount,
  gameOfDay,
  onShuffle,
  onLaunch,
}: {
  gameCount: number
  streak: number
  spotlight: Game
  spotIdx: number
  featuredCount: number
  gameOfDay: Game
  onShuffle: () => void
  onLaunch: (game: Game) => void
}) {
  return (
    <section className="hero" id="top" style={{ position: 'relative', overflow: 'hidden', background: 'radial-gradient(600px 400px at 15% 10%, rgba(125,107,255,.14), transparent 60%), radial-gradient(700px 500px at 85% 15%, rgba(215,243,74,.12), transparent 60%), radial-gradient(500px 400px at 50% 90%, rgba(255,108,131,.08), transparent 60%), var(--background)' }}>
      <div className="hero-copy">
        <p className="eyebrow">
          <Sparkles size={14} /> THE INDEPENDENT ARCADE
        </p>
        <h1>
          Stay a while.
          <br />
          <em>Play forever.</em>
        </h1>
        <p className="hero-text">A handpicked, no-filler collection of browser games for the minutes between everything. <span style={{ opacity: .8 }}><Keyboard size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Every game lists its own controls — hover any card to see them.</span></p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <a className="hero-link" href="#games">
            Enter the lounge <ArrowUpRight size={15} />
          </a>
          <button onClick={onShuffle} className="btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }}>
            <Shuffle size={14} /> Surprise me
          </button>
          <button onClick={() => onLaunch(gameOfDay)} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'rgba(255,255,255,.06)', color: 'var(--foreground)', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <Gift size={14} /> Game of the Day: {gameOfDay.title}
          </button>
        </div>
        <div className="hero-stats" style={{ gap: 18, padding: '12px 16px', borderRadius: 999, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)', backdropFilter: 'blur(8px)', display: 'inline-flex', width: 'fit-content', marginTop: 22 }}>
          <span>
            <strong className="stat-pop">{gameCount}</strong> games
          </span>
          <span>
            <strong>∞</strong> replay value
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flame size={12} color={streak > 2 ? 'var(--lime)' : 'inherit'} /> <strong className="stat-pop">{streak}</strong> day streak</span>
          <span>
            <strong>01</strong> lounge
          </span>
        </div>
      </div>
      <Reveal className="spotlight" delay={90}>
        <div className="spotlight-top">
          <span>SPOTLIGHT / {(String(spotIdx + 1).padStart(2, '0'))}</span>
          <span className="spotlight-tag">FEATURED</span>
        </div>
        <div className="spotlight-art" onClick={() => onLaunch(spotlight)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onLaunch(spotlight)} style={{ cursor: 'pointer', overflow: 'hidden', borderRadius: 16, position: 'relative' }}>
          {spotlight.icon ? (
            <img src={spotlight.icon} alt={spotlight.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: .9 }} onError={(e) => (e.currentTarget.style.display = 'none')} />
          ) : null}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,.55) 100%)' }} />
          <div className="orbit orbit-a" style={{ opacity: .5 }} />
          <div className="orbit orbit-b" style={{ opacity: .4 }} />
          <span className="spotlight-mark" style={{ position: 'relative', zIndex: 1, textShadow: '0 4px 20px rgba(0,0,0,.45)' }}>{spotlight.mark}</span>
          <span className="spotlight-caption" style={{ zIndex: 1, background: 'rgba(0,0,0,.32)', padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' }}>
            {spotlight.tone.toUpperCase()}<br />{spotlight.genre.toUpperCase()}
          </span>
        </div>
        <div className="spotlight-bottom">
          <div>
            <p className="card-kicker">{spotlight.genre} · {spotlight.tone}</p>
            <h2>{spotlight.title}</h2>
            <p>{spotlight.subtitle}</p>
          </div>
          <button className="circle-play" onClick={() => onLaunch(spotlight)} aria-label={`Play ${spotlight.title}`}>
            <Play size={18} fill="currentColor" />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10 }}>
          {Array.from({ length: featuredCount }, (_, i) => <span key={i} style={{ width: i === spotIdx ? 22 : 8, height: 6, borderRadius: 99, background: i === spotIdx ? 'var(--lime)' : 'rgba(255,255,255,.22)', transition: 'all .3s', display: 'block' }} />)}
        </div>
      </Reveal>
    </section>
  )
}
