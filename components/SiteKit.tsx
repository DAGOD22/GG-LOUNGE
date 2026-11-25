'use client'
/**
 * The rest of the small site furniture.
 *
 * `SiteTools.tsx` holds the interaction helpers (scratchpad, grid navigation,
 * status line); this file holds the surfaces that read storage or scroll and
 * therefore need a browser: the storage panel, the back-to-top control, the
 * greeting and the recently-used tool strip.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUp, ChevronRight, Eye, Trash2, X } from 'lucide-react'

import {
  greetingFor,
  isOurKey,
  pluralize,
  scrollFraction,
  truncateMiddle,
  storageLabel,
  storageSummary,
  type StorageEntry,
} from '@/lib/site-kit'

/* ---------------- what this browser remembers ---------------- */

/**
 * The panel is honest by construction: it enumerates localStorage rather than a
 * hard-coded list, so a key the site forgets to document still shows up. Only
 * the delete button is limited to `ggl_` keys, because wiping another
 * script's data would be a rude thing for a games site to do.
 */
export function StoragePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<StorageEntry[]>([])
  const [wiped, setWiped] = useState(false)

  const read = useCallback(() => {
    const found: StorageEntry[] = []
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index)
        if (!key) continue
        const value = window.localStorage.getItem(key) ?? ''
        found.push({ key, bytes: (key.length + value.length) * 2 })
      }
    } catch {
      // Storage disabled (private mode, blocked cookies): an empty list is the
      // truthful answer, not an error the visitor can do anything about.
    }
    setEntries(found.sort((a, b) => b.bytes - a.bytes))
  }, [])

  useEffect(() => {
    if (!open) return
    setWiped(false)
    read()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, read, onClose])

  const wipe = useCallback(() => {
    try {
      for (const entry of entries) {
        if (isOurKey(entry.key)) window.localStorage.removeItem(entry.key)
      }
    } catch { /* ignore */ }
    setWiped(true)
    read()
  }, [entries, read])

  if (!open) return null
  const summary = storageSummary(entries)

  return (
    <div className="storage-overlay" role="dialog" aria-modal="true" aria-label="What this browser stores" onClick={onClose}>
      <div className="storage-panel" onClick={event => event.stopPropagation()}>
        <header className="storage-head">
          <div>
            <h2>What this browser remembers</h2>
            <p>
              {entries.length === 0
                ? 'Nothing yet.'
                : `${pluralize(summary.count, 'item')} · ${summary.human} total`}
              {summary.largest ? ` · biggest is “${storageLabel(summary.largest.key)}”` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </header>

        <ul className="storage-list">
          {entries.length === 0 ? (
            <li className="storage-empty">This browser is not holding anything for the site right now.</li>
          ) : (
            entries.map(entry => (
              <li key={entry.key}>
                <span className="storage-name">{storageLabel(entry.key)}</span>
                <span className="storage-key">{entry.key}</span>
                <span className="storage-size">{(entry.bytes / 1024).toFixed(1)} kB</span>
              </li>
            ))
          )}
        </ul>

        <footer className="storage-foot">
          <span>
            {wiped ? 'Cleared. Your favourites and history are gone from this browser.' : 'Nothing here is sent to a server.'}
          </span>
          <button type="button" className="storage-wipe" onClick={wipe} disabled={entries.every(entry => !isOurKey(entry.key))}>
            <Trash2 size={13} /> Clear my data
          </button>
        </footer>
      </div>
    </div>
  )
}

/* ---------------- back to top ---------------- */

/**
 * A scroll-position control that doubles as a progress bar.
 *
 * The bar is the honest part: on a page with 250 cards, "how far through am I"
 * is more useful than a button, and the button is only there once someone has
 * scrolled far enough that going back up is a chore.
 */
export function BackToTop() {
  const [fraction, setFraction] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      setFraction(scrollFraction(window.scrollY, doc.scrollHeight, window.innerHeight))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  if (fraction <= 0.06) return null

  return (
    <button
      type="button"
      className="back-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label={`Back to the top — ${Math.round(fraction * 100)}% of the way down`}
      title="Back to the top"
    >
      <span className="back-to-top-ring" style={{ ['--progress' as string]: `${Math.round(fraction * 100)}%` }} />
      <ArrowUp size={16} />
    </button>
  )
}

/* ---------------- greeting ---------------- */

/** Reads the clock once on mount; the server never renders a time-dependent string. */
export function Greeting({ name }: { name?: string | null }) {
  const [hour, setHour] = useState<number | null>(null)
  useEffect(() => setHour(new Date().getHours()), [])
  if (hour === null) return null
  return <span className="greeting">{greetingFor(hour)}{name ? `, ${name}` : ''}</span>
}

/* ---------------- recently used tools ---------------- */

export const TOOL_RECENT_KEY = 'ggl_tools_recent'

export function readRecentTools(): string[] {
  try {
    const raw = window.localStorage.getItem(TOOL_RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

export function rememberTool(id: string): void {
  try {
    const next = [id, ...readRecentTools().filter(item => item !== id)].slice(0, 6)
    window.localStorage.setItem(TOOL_RECENT_KEY, JSON.stringify(next))
  } catch { /* a blocked store is not worth interrupting anyone over */ }
}

export function RecentTools({ labels }: { labels: Record<string, string> }) {
  const [recent, setRecent] = useState<string[]>([])
  // Read after mount so the server markup and the first client render agree.
  useEffect(() => setRecent(readRecentTools()), [])
  const usable = recent.filter(id => labels[id])
  if (usable.length === 0) return null

  return (
    <div className="recent-tools" aria-label="Recently used tools">
      <span className="recent-tools-label">Recent</span>
      {usable.map(id => (
        <Link key={id} href={`/tools#${id}`} className="recent-tools-chip">
          {truncateMiddle(labels[id], 18)} <ChevronRight size={10} />
        </Link>
      ))}
    </div>
  )
}

export function PrivacyChip() {
  return (
    <span className="privacy-chip" title="Everything you type stays in this tab">
      <Eye size={11} /> Nothing leaves this tab
    </span>
  )
}
