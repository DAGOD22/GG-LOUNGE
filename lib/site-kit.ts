/**
 * Pure helpers for the small extras that are not worth a file each.
 *
 * Everything here is a plain function with no DOM and no React, which is the
 * only reason the rest of the site can test them. The components that use them
 * live in `components/SiteKit.tsx`.
 */

/** "42 titles · 9 categories · 6 featured" — the collection note's second half. */
export function catalogSummary(count: number, genres: number, featured: number): string {
  const parts = [pluralize(count, 'title')]
  if (genres) parts.push(pluralize(genres, 'category', 'categories'))
  if (featured) parts.push(`${featured} featured`)
  return parts.join(' · ')
}

/** 1234 → "1.2k", 12400 → "12k", 999 → "999". */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const n = Math.max(0, Math.round(value))
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
}

/** "1 game" / "2 games" — with the irregular plurals the caller passes in. */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural ?? `${singular}s`}`
}

/**
 * Shorten with an ellipsis in the middle, which keeps both the start and the end
 * readable. A game title truncated at the end is usually indistinguishable from
 * the next one; the tail is the part that differs.
 */
export function truncateMiddle(text: string, max: number): string {
  if (max < 5) return text.slice(0, Math.max(0, max))
  if (text.length <= max) return text
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

/** A greeting that matches the clock, using the visitor's own local hour. */
export function greetingFor(hour: number): string {
  if (!Number.isFinite(hour)) return 'Hello'
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  if (hour < 22) return 'Good evening'
  return 'Late one'
}

/** Bytes as something a person can read. Deliberately rounded, not exact. */
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'kB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

export type StorageEntry = { key: string; bytes: number }

/**
 * What this browser has stored, summarised.
 *
 * The site keeps favourites, history, theme and a streak in localStorage, so a
 * truthful "here is what I saved about you" panel is both a privacy feature and
 * a debugging one. The maths is here so the component only has to read the keys.
 */
export function storageSummary(entries: StorageEntry[]): {
  count: number
  totalBytes: number
  human: string
  largest: StorageEntry | null
} {
  const totalBytes = entries.reduce((sum, entry) => sum + Math.max(0, entry.bytes), 0)
  const largest = entries.reduce<StorageEntry | null>(
    (best, entry) => (!best || entry.bytes > best.bytes ? entry : best),
    null,
  )
  return { count: entries.length, totalBytes, human: humanBytes(totalBytes), largest }
}

/**
 * Friendly names for the keys this site writes.
 *
 * Anything not in the map is still listed — the point of the panel is that it
 * does not hide what it does not recognise — it just shows the raw key.
 */
export const STORAGE_LABELS: Record<string, string> = {
  ggl_fav: 'Favourite games',
  ggl_recent: 'Recently played',
  ggl_playcounts: 'Your play counts',
  ggl_theme: 'Light or dark choice',
  ggl_streak: 'Visit streak',
  ggl_last_visit: 'Last visit date',
  ggl_scratchpad: 'Scratchpad text',
  ggl_req_votes: 'Games you voted for',
  ggl_customization_v1: 'Custom theme colours',
  ggl_tools_recent: 'Recently used tools',
  ggl_palette_recent: 'Recently used commands',
  ggl_welcome_seen: 'Welcome tour dismissed',
}

export function storageLabel(key: string): string {
  return STORAGE_LABELS[key] ?? key
}

/** Which of these keys did this site write? Used to avoid touching anyone else's. */
export function isOurKey(key: string): boolean {
  return key.startsWith('ggl_')
}

/**
 * The share of the page that has been read, 0–1.
 *
 * Guarded against the degenerate case where the document is shorter than the
 * viewport, which would otherwise divide by zero and send a NaN into a style.
 */
export function scrollFraction(scrollY: number, scrollHeight: number, viewportHeight: number): number {
  const range = scrollHeight - viewportHeight
  // NaN survives Math.min/Math.max, so it is checked rather than clamped.
  if (!Number.isFinite(scrollY) || !Number.isFinite(range) || range <= 0) return 0
  return Math.min(1, Math.max(0, scrollY / range))
}

/** The n newest ids, where "new" means "appended last to the curated list". */
export function newestIds(ids: string[], count: number): Set<string> {
  if (count <= 0) return new Set()
  return new Set(ids.slice(-count))
}

/** A short, honest label for a session estimate. */
export function sessionLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'a quick go'
  if (minutes <= 2) return 'about a minute'
  if (minutes <= 5) return `${Math.round(minutes)} minutes`
  if (minutes < 60) return `about ${Math.round(minutes / 5) * 5} minutes`
  const hours = Math.round((minutes / 60) * 2) / 2
  return hours === 1 ? 'about an hour' : `about ${hours} hours`
}

/** Remembers the last few of something, newest first, without duplicates. */
export function pushRecent<T>(list: T[], value: T, limit = 5): T[] {
  const next = [value, ...list.filter(item => item !== value)]
  return next.slice(0, Math.max(1, limit))
}
