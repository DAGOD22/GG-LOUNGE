'use client'

/**
 * First-run welcome.
 *
 * Every feature this site is proud of is hidden behind a button that a new
 * visitor has no reason to press: custom cursors, the tab cloaker, the panic
 * key, co-op rooms. A person lands, plays Slope once, and leaves without ever
 * knowing any of it existed.
 *
 * So this runs exactly once, on the first visit, and points at three things with
 * a single sentence each — no carousel, no modal stack, no email capture. It
 * remembers that it was dismissed, and honours "don't show me this again"
 * properly: the flag is written only when the person closes it.
 *
 * It is deliberately not a full-screen overlay. It is a card in the corner that
 * can be ignored while the library stays usable behind it.
 */

import { useEffect, useState } from 'react'
import { Sparkles, Keyboard, Users, X } from 'lucide-react'
import { useCustomization } from '@/components/customization/CustomizationProvider'

const SEEN_KEY = 'ggl_welcomed_v1'

const POINTS = [
  {
    icon: Sparkles,
    title: 'Make it yours',
    body: 'Themes, wallpapers and 31 animated cursors — the GG button in the header.',
  },
  {
    icon: Keyboard,
    title: 'One key to disappear',
    body: 'Set a panic shortcut that swaps the tab for a neutral page instantly.',
  },
  {
    icon: Users,
    title: 'Play with a friend',
    body: 'Open a co-op room, read out the six-character code, and you are in the same game.',
  },
]

export function WelcomeTour() {
  const { openSettings, ready } = useCustomization()
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!ready) return
    try {
      if (localStorage.getItem(SEEN_KEY)) return
    } catch {
      // No storage: showing the tour every time would be worse than never.
      return
    }
    // Let the library paint first. A card that appears before the games looks
    // like a gate; a card that appears after looks like a hint.
    const timer = window.setTimeout(() => setVisible(true), 1400)
    return () => window.clearTimeout(timer)
  }, [ready])

  const dismiss = () => {
    setLeaving(true)
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()))
    } catch {
      /* nothing to persist to */
    }
    window.setTimeout(() => setVisible(false), 180)
  }

  if (!visible) return null

  return (
    <aside className={`gg-welcome${leaving ? ' is-leaving' : ''}`} aria-label="New here?">
      <header>
        <p className="gg-overline">FIRST TIME HERE</p>
        <button type="button" onClick={dismiss} aria-label="Dismiss the welcome card">
          <X size={15} />
        </button>
      </header>
      <ul>
        {POINTS.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <span className="gg-welcome-icon" aria-hidden="true"><Icon size={15} /></span>
            <span>
              <strong>{title}</strong>
              <small>{body}</small>
            </span>
          </li>
        ))}
      </ul>
      <div className="gg-welcome-actions">
        <button
          type="button"
          className="gg-primary"
          onClick={() => {
            dismiss()
            openSettings()
          }}
        >
          Open settings
        </button>
        <button type="button" className="gg-secondary" onClick={dismiss}>Got it</button>
      </div>
    </aside>
  )
}
