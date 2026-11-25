'use client'
/**
 * The command palette and the keyboard layer.
 *
 * Both live here rather than in app/page.tsx because that file is already the
 * longest in the repository and neither of these needs the catalogue's state —
 * they take callbacks and call them. That also makes the shortcut table testable
 * on its own: the interesting part is which combinations are claimed, and the
 * collisions between them, not the JSX.
 *
 * Two things this is careful about:
 *
 *   · It never fires while a person is typing. A shortcut that steals a
 *     keystroke from the search box is worse than no shortcut.
 *   · It ignores the browser's own modifier combinations. Ctrl/⌘ + a letter
 *     belongs to the browser (copy, reload, reopen a tab), so everything here
 *     uses Shift+Alt or a bare key with no modifier.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Command, Search, X } from 'lucide-react'
import { pushRecent } from '@/lib/site-kit'

export type Shortcut = {
  /** Human-readable combination, as `event.key` values joined by `+`. */
  combo: string
  label: string
  group: 'Navigate' | 'Play' | 'View' | 'Tools'
  run: () => void
}

/** Should a keystroke be ignored because it is going into a text field? */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  // Both checks: `isContentEditable` is the correct one in a real browser, and
  // the attribute covers environments (and older engines) that do not compute
  // the property.
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    || element.isContentEditable === true
    || element.getAttribute('contenteditable') === 'true'
}

/**
 * Normalise a keyboard event into the same shape a shortcut declares.
 *
 * Modifier order matters if this is ever compared as a string, so it is always
 * ctrl+alt+shift+meta+key.
 */
export function comboFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string {
  const parts: string[] = []
  if (event.ctrlKey) parts.push('ctrl')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')
  if (event.metaKey) parts.push('meta')
  parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key)
  return parts.join('+')
}

export type Command = {
  id: string
  label: string
  hint?: string
  group: 'Go' | 'Play' | 'Account' | 'View' | 'Tools' | 'Help'
  run: () => void
}

/**
 * A small fuzzy matcher: every character of the query must appear in the label
 * in order, which is what makes "ggpt" find "GG-GPT" and "qr" find "Tools".
 * Scoring prefers prefix matches and shorter labels so the best match floats up.
 */
export function scoreCommand(command: Command, query: string): number {
  const needle = query.trim().toLowerCase()
  if (!needle) return 1
  const haystack = `${command.label} ${command.hint ?? ''}`.toLowerCase()
  let position = 0
  let score = 0
  for (const char of needle) {
    const found = haystack.indexOf(char, position)
    if (found === -1) return 0
    // Adjacent characters score better than scattered ones.
    score += found === position ? 3 : 1
    position = found + 1
  }
  if (haystack.startsWith(needle)) score += 10
  if (command.label.toLowerCase().startsWith(needle)) score += 10
  return score + Math.max(0, 20 - command.label.length) / 20
}

export function searchCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands
  return commands
    .map(command => ({ command, score: scoreCommand(command, query) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.command)
}

/* ---------------- the shortcut table ---------------- */

export type ShortcutActions = {
  focusSearch: () => void
  openPalette: () => void
  openShortcuts: () => void
  openTools: () => void
  openAchievements: () => void
  openAuth: () => void
  toggleTheme: () => void
  toggleDashboard: () => void
  shuffle: () => void
  panic: () => void
  goHome: () => void
  goLibrary: () => void
  goApps: () => void
  goProxy: () => void
  goRequests: () => void
  goGames: () => void
  closeAll: () => void
}

export function buildShortcuts(actions: ShortcutActions): Shortcut[] {
  return [
    { combo: '/', label: 'Focus the search box', group: 'Navigate', run: actions.focusSearch },
    { combo: 'shift+alt+k', label: 'Open the command palette', group: 'Navigate', run: actions.openPalette },
    { combo: 'shift+?', label: 'Show this shortcut list', group: 'Navigate', run: actions.openShortcuts },
    { combo: 'shift+alt+h', label: 'Back to the lounge', group: 'Navigate', run: actions.goHome },
    { combo: 'shift+alt+l', label: 'Jump to the library', group: 'Navigate', run: actions.goLibrary },
    { combo: 'shift+alt+a', label: 'Jump to apps', group: 'Navigate', run: actions.goApps },
    { combo: 'shift+alt+p', label: 'Jump to the proxy', group: 'Navigate', run: actions.goProxy },
    { combo: 'shift+alt+r', label: 'Jump to game requests', group: 'Navigate', run: actions.goRequests },
    { combo: 'shift+alt+g', label: 'Jump to the game list', group: 'Navigate', run: actions.goGames },
    { combo: 'shift+alt+t', label: 'Open the tools page', group: 'Tools', run: actions.openTools },
    { combo: 'shift+alt+s', label: 'Shuffle to a random game', group: 'Play', run: actions.shuffle },
    { combo: 'shift+alt+v', label: 'Switch light and dark', group: 'View', run: actions.toggleTheme },
    { combo: 'shift+alt+d', label: 'Collapse or open the dashboard', group: 'View', run: actions.toggleDashboard },
    { combo: 'shift+alt+c', label: 'Show achievements', group: 'View', run: actions.openAchievements },
    { combo: 'shift+alt+i', label: 'Sign in', group: 'View', run: actions.openAuth },
    { combo: 'shift+alt+x', label: 'Panic — hide the site', group: 'View', run: actions.panic },
    { combo: 'Escape', label: 'Close whatever is open', group: 'View', run: actions.closeAll },
  ]
}

/**
 * A hook so a page can get shortcuts and have the listener attached and removed
 * in one place.
 *
 * The key handler reads the table through a ref, so changing the actions
 * between renders does not require re-binding the listener — and, more
 * importantly, cannot leave an old closure calling stale state.
 */
export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  const table = useRef(shortcuts)

  // Synced in an effect, not during render: writing a ref while rendering is
  // the one thing the React compiler is right to forbid, and the listener only
  // reads it after commit anyway.
  useEffect(() => { table.current = shortcuts }, [shortcuts])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      // Escape is allowed out of a text field, because that is how people
      // expect to leave a search box.
      const combo = comboFromEvent(event)
      if (isTypingTarget(event.target) && combo !== 'Escape') return
      const match = table.current.find(shortcut => shortcut.combo === combo)
      if (!match) return
      event.preventDefault()
      match.run()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

/* ---------------- the shortcut sheet ---------------- */

export function ShortcutSheet({ shortcuts, open, onClose }: { shortcuts: Shortcut[]; open: boolean; onClose: () => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, Shortcut[]>()
    for (const shortcut of shortcuts) {
      map.set(shortcut.group, [...(map.get(shortcut.group) ?? []), shortcut])
    }
    return [...map.entries()]
  }, [shortcuts])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="shortcut-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="shortcut-sheet" onClick={event => event.stopPropagation()}>
        <header className="shortcut-head">
          <h2>Keyboard shortcuts</h2>
          <button type="button" onClick={onClose} aria-label="Close shortcut list"><X size={16} /></button>
        </header>
        <p className="shortcut-note">
          Nothing here fights the browser: no shortcut takes Ctrl or ⌘, so copy, paste, reopen-tab and reload
          all still work. Combinations use Shift+Alt or a bare key.
        </p>
        <div className="shortcut-groups">
          {groups.map(([group, items]) => (
            <div key={group} className="shortcut-group">
              <h3>{group}</h3>
              {items.map(shortcut => (
                <div key={shortcut.combo} className="shortcut-row">
                  <span>{shortcut.label}</span>
                  <kbd>{prettyCombo(shortcut.combo)}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Render a combo the way a keyboard prints it. */
export function prettyCombo(combo: string): string {
  return combo
    .split('+')
    .map((part, index, all) => {
      if (index === all.length - 1) {
        if (part === '?') return '?'
        return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)
      }
      if (part === 'shift') return 'Shift'
      if (part === 'alt') return 'Alt'
      if (part === 'ctrl') return 'Ctrl'
      if (part === 'meta') return '⌘'
      return part
    })
    .join(' + ')
    .replace('Shift + ?', 'Shift + ?')
}

/* ---------------- the palette ---------------- */

/** Overlay dialogs that should be closed before a command runs. */
const PALETTE_RECENT_KEY = 'ggl_palette_recent'

export function readRecentCommands(): string[] {
  try {
    const raw = window.localStorage.getItem(PALETTE_RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}

export function rememberCommand(id: string): void {
  try {
    window.localStorage.setItem(PALETTE_RECENT_KEY, JSON.stringify(pushRecent(readRecentCommands(), id, 5)))
  } catch { /* ignore */ }
}

/**
 * Put recently run commands at the top of an empty query.
 *
 * This is the same reason a shell has history: the fourth time somebody opens
 * the palette in a session it is almost always to do the thing they did first.
 * Only applied when the query is empty, because a search result order that the
 * query did not ask for is a lie.
 */
export function orderByRecent<T extends { id: string }>(items: T[], recent: string[]): T[] {
  if (recent.length === 0) return items
  const rank = new Map(recent.map((id, index) => [id, index]))
  return [...items].sort((a, b) => {
    const aRank = rank.has(a.id) ? rank.get(a.id)! : Number.POSITIVE_INFINITY
    const bRank = rank.has(b.id) ? rank.get(b.id)! : Number.POSITIVE_INFINITY
    return aRank - bRank
  })
}

export function CommandPalette({
  commands,
  open,
  onClose,
}: {
  commands: Command[]
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => { setRecent(readRecentCommands()) }, [open])

  const results = useMemo(() => {
    const found = searchCommands(commands, query)
    return query.trim() ? found : orderByRecent(found, recent)
  }, [commands, query, recent])

  // Reset the highlight whenever the result set changes, or Enter runs whatever
  // happens to be at index 3 of a list the user cannot see.
  useEffect(() => { setActive(0) }, [query, open])

  useEffect(() => {
    if (!open) { setQuery(''); return }
    const id = setTimeout(() => inputRef.current?.focus(), 20)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const node = listRef.current?.children[active] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const close = useCallback(() => { setQuery(''); onClose() }, [onClose])

  if (!open) return null

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(index => Math.min(results.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(index => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = results[active]
      if (chosen) { rememberCommand(chosen.id); setRecent(readRecentCommands()); chosen.run(); close() }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  // Group headings are rendered inline so keyboard order and visual order stay
  // the same — a separate sidebar of groups would let the arrow keys and the
  // eye disagree. Precomputed rather than tracked with a mutable variable during
  // render, which would give different output on a second render.
  const rows = results.map((command, index) => ({
    command,
    index,
    heading: index === 0 || results[index - 1].group !== command.group ? command.group : null,
  }))

  return (
    <div className="palette-overlay" role="dialog" aria-modal="true" aria-label="Command palette" onClick={close}>
      <div className="palette" onClick={event => event.stopPropagation()}>
        <div className="palette-search">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, play something, change a setting…"
            aria-label="Command"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-item-${results[active].id}` : undefined}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {results.length === 0 ? <p className="palette-empty">Nothing matches “{query}”.</p> : null}
          {rows.map(({ command, index, heading }) => {
            return (
              <div key={command.id}>
                {heading ? <p className="palette-group">{heading}</p> : null}
                <button
                  type="button"
                  id={`palette-item-${command.id}`}
                  role="option"
                  aria-selected={index === active}
                  className={`palette-item ${index === active ? 'is-active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => { rememberCommand(command.id); setRecent(readRecentCommands()); command.run(); close() }}
                >
                  <span>{command.label}</span>
                  {command.hint ? <span className="palette-hint">{command.hint}</span> : null}
                  <ArrowRight size={12} />
                </button>
              </div>
            )
          })}
        </div>
        <footer className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>↵</kbd> to run</span>
          <span><Command size={11} /> Shift+Alt+K any time</span>
        </footer>
      </div>
    </div>
  )
}
