'use client'
import { useState } from 'react'
import { Check, LockKeyhole, Trophy } from 'lucide-react'
import { achievements, gameNames } from '@/lib/achievements'

export function AchievementGallery({ slugs }: { slugs: string[] }) {
  const [filter, setFilter] = useState('all')
  const unlocked = achievements.filter((a) => slugs.includes(a.slug))
  const xp = unlocked.reduce((total, a) => total + a.xp, 0)
  return (
    <div className="achievement-gallery">
      <div className="trophy-summary">
        <Trophy size={32} />
        <div>
          <strong>
            {unlocked.length}
            <span> / {achievements.length}</span>
          </strong>
          <small>earned, never timed</small>
        </div>
        <b>{xp.toLocaleString()} XP</b>
      </div>
      <div
        className="trophy-progress"
        role="progressbar"
        aria-label="Achievements unlocked"
        aria-valuenow={unlocked.length}
        aria-valuemin={0}
        aria-valuemax={achievements.length}
      >
        <i
          style={{ width: `${(unlocked.length / achievements.length) * 100}%` }}
        />
      </div>
      <div className="trophy-filters" aria-label="Filter achievements">
        {[['all', 'All'], ...Object.entries(gameNames)].map(([id, title]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {title}
          </button>
        ))}
      </div>
      <div className="trophy-grid">
        {achievements
          .filter((a) => filter === 'all' || filter === a.game)
          .map((a) => {
            const earned = slugs.includes(a.slug)
            return (
              <article
                className={`trophy-card ${earned ? 'is-earned' : ''}`}
                key={a.slug}
              >
                <div className="trophy-icon">
                  {earned ? <Check size={20} /> : <LockKeyhole size={18} />}
                </div>
                <div>
                  <small>
                    {gameNames[a.game]} · {a.xp} XP
                  </small>
                  <h3>{a.title}</h3>
                  <p>{a.description}</p>
                  <span>{earned ? 'UNLOCKED' : 'LOCKED'}</span>
                </div>
              </article>
            )
          })}
      </div>
      <p className="trophy-footnote">
        Milestones come directly from supported game logic. Existing game saves
        count when you next perform the relevant action. Other games don’t
        report outcomes yet.
      </p>
    </div>
  )
}
