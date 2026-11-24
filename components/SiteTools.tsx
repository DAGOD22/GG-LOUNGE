'use client'
/**
 * Five small site-wide conveniences that all live in one place.
 *
 * They are grouped here because they share a question: "what would a visitor
 * want that the page does not already give them?" The answers were a scratchpad
 * that survives a reload, a reading-time estimate for descriptions, a
 * keyboard-driven grid navigator, a status line that says what is happening, and
 * a quick filter for what is new.
 *
 * Every one of them is small on purpose. Nothing here is a modal that takes over
 * the screen, because the page already has three of those.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Save, Trash2 } from 'lucide-react'

/* ---------------- 1. a scratchpad that survives a reload ---------------- */

export const SCRATCH_KEY = 'ggl_scratchpad';

/**
 * The scratchpad is plain text in localStorage with a manual save.
 *
 * Auto-save was the obvious design and the wrong one: people paste a password
 * or a half-written message into something like this, and a box that writes to
 * disk on every keystroke is a box that keeps things they did not mean to keep.
 * The save is explicit, the clear is explicit, and the text is never sent
 * anywhere.
 */
export function Scratchpad({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    try {
      const stored = window.localStorage.getItem(SCRATCH_KEY)
      if (stored) { setText(stored); setSaved(stored) }
    } catch { /* a blocked store just means an empty pad */ }
    const id = setTimeout(() => areaRef.current?.focus(), 30)
    return () => clearTimeout(id)
  }, [open])

  const save = useCallback(() => {
    try {
      window.localStorage.setItem(SCRATCH_KEY, text)
      setSaved(text)
      setDirty(false)
    } catch { /* nothing sensible to do; the text is still on screen */ }
  }, [text])

  const clear = useCallback(() => {
    setText('')
    setDirty(false)
    setSaved('')
    try { window.localStorage.removeItem(SCRATCH_KEY) } catch { /* ignore */ }
  }, [])

  if (!open) return null

  return (
    <div className="scratch-overlay" role="dialog" aria-modal="true" aria-label="Scratchpad" onClick={onClose}>
      <div className="scratch" onClick={event => event.stopPropagation()}>
        <header className="scratch-head">
          <div>
            <h2>Scratchpad</h2>
            <p>Saved to this browser only, and only when you press save.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close scratchpad">Close</button>
        </header>
        <textarea
          ref={areaRef}
          className="scratch-area"
          value={text}
          rows={12}
          spellCheck={false}
          aria-label="Scratchpad contents"
          placeholder="Notes, a code, something you want to keep for a minute…"
          onChange={event => { setText(event.target.value); setDirty(true) }}
        />
        <footer className="scratch-foot">
          <span className="scratch-meta">
            {[...text].length} characters · {text.trim() ? text.trim().split(/\s+/).length : 0} words
            {dirty ? ' · unsaved' : saved !== null && saved === text ? ' · saved' : ''}
          </span>
          <span className="scratch-buttons">
            <button type="button" className="scratch-clear" onClick={clear}><Trash2 size={13} /> Clear</button>
            <button type="button" className="scratch-save" onClick={save} disabled={!dirty}><Save size={13} /> Save</button>
          </span>
        </footer>
      </div>
    </div>
  )
}

/* ---------------- 2. reading time ---------------- */

/** Words per minute for a description; 200 is the usual adult silent rate. */
export function readingSeconds(text: string, wordsPerMinute = 200): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return Math.round((words / wordsPerMinute) * 60)
}

export function ReadingTime({ text }: { text: string }) {
  const seconds = readingSeconds(text)
  if (seconds < 5) return null
  return <span className="reading-time">{seconds < 60 ? `${seconds}s read` : `${Math.round(seconds / 60)} min read`}</span>
}

/* ---------------- 3. grid keyboard navigation ---------------- */

/**
 * Arrow-key movement across a CSS grid.
 *
 * The catalogue renders as a grid of cards, and a grid is the one layout where
 * Tab is genuinely the wrong tool: tabbing through 250 cards to reach the
 * request panel is not navigation, it is a punishment. This adds arrows-as-
 * movement on top of Tab, without taking Tab away.
 *
 * It works out the column count from the rendered positions rather than being
 * told, so it keeps working when the grid reflows at a different width.
 */
export function gridNavigationHandler(container: HTMLElement | null) {
  return (event: React.KeyboardEvent) => {
    if (!container) return
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const cards = [...container.querySelectorAll<HTMLElement>('[data-grid-item]')]
    if (!cards.length) return
    const target = event.target as HTMLElement
    const currentIndex = cards.indexOf(target.closest('[data-grid-item]') as HTMLElement)
    if (currentIndex === -1) return

    // Derive the number of columns from the first row's offsetTop, which is
    // robust across gap changes and fractional widths.
    const firstTop = cards[0].offsetTop
    let columns = 1
    while (columns < cards.length && cards[columns].offsetTop === firstTop) columns++

    let next = currentIndex
    if (event.key === 'ArrowRight') next = currentIndex + 1
    else if (event.key === 'ArrowLeft') next = currentIndex - 1
    else if (event.key === 'ArrowDown') next = currentIndex + columns
    else if (event.key === 'ArrowUp') next = currentIndex - columns
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = cards.length - 1

    if (next < 0 || next >= cards.length || next === currentIndex) return
    event.preventDefault()
    const node = cards[next]
    const focusable = node.querySelector<HTMLElement>('button, a, [tabindex]')
    ;(focusable ?? node).focus()
  }
}

/* ---------------- 4. a live status line ---------------- */

export type SiteStatus = 'idle' | 'loading' | 'saved' | 'error' | 'offline' | 'info'

/**
 * One polite live region for the whole page.
 *
 * Three separate `role="status"` banners already existed and each one announced
 * itself on mount, which meant a screen reader read the offline notice, the
 * guest notice and the install hint every time the page re-rendered. This is a
 * single region that only speaks when something actually changes.
 */
export function StatusLine({ status, message }: { status: SiteStatus; message: string }) {
  const [shown, setShown] = useState('')
  useEffect(() => {
    if (!message) { setShown(''); return }
    setShown(message)
    // Clear after a moment so the next identical message announces again.
    const id = setTimeout(() => setShown(''), 6000)
    return () => clearTimeout(id)
  }, [message])

  return (
    <div className="status-line" role="status" aria-live="polite" aria-atomic="true" data-status={status}>
      {shown}
    </div>
  )
}

/* ---------------- 5. what is new ---------------- */

/* The "New" flag itself lives in lib/site-kit (`newestIds`) and the badge is a
   class in globals.css, so there is exactly one definition of "new". */

/* ---------------- 6. copy-anything ---------------- */

/**
 * Copy a game's link from anywhere without a dialog.
 *
 * The toast is part of the status line rather than its own element: two live
 * regions competing to say "copied" is how a screen reader ends up reading it
 * twice.
 */
export function useCopyLink(onStatus: (status: SiteStatus, message: string) => void) {
  return useCallback(async (title: string, path: string) => {
    const url = `${window.location.origin}${path}`
    try {
      await navigator.clipboard.writeText(url)
      onStatus('saved', `Link to ${title} copied.`)
      window.dispatchEvent(new CustomEvent('ggl:share', { detail: { path } }))
    } catch {
      onStatus('error', 'The browser blocked the clipboard. The link is in the address bar.')
    }
  }, [onStatus])
}

/* ---------------- 7. relative time ---------------- */

/** "just now", "3 minutes ago", "yesterday" — friendlier than a timestamp. */
export function relativeTime(from: number, now = Date.now()): string {
  const seconds = Math.round((now - from) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 90) return 'a minute ago'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return weeks === 1 ? 'last week' : `${weeks} weeks ago`
  const months = Math.round(days / 30)
  if (months < 12) return months === 1 ? 'last month' : `${months} months ago`
  const years = Math.round(days / 365)
  return years === 1 ? 'last year' : `${years} years ago`
}

/* ---------------- 8. a compact "how many" summary ---------------- */

export function catalogSummary(count: number, genres: number, featured: number): string {
  const parts = [`${count} titles`]
  if (genres) parts.push(`${genres} categories`)
  if (featured) parts.push(`${featured} featured`)
  return parts.join(' · ')
}
