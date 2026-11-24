import type { MetadataRoute } from 'next'
import { games } from '@/lib/games'
import { absoluteUrl } from '@/lib/site-domains'

/**
 * Only URLs that are actually this site's own pages belong in here.
 *
 * A sitemap entry is a promise to a crawler: "this is a document". Eleven games
 * are `proxy` entries whose `path` is an external site (https://state.io/ and
 * friends) — those were being concatenated onto the canonical origin and shipped
 * as `/g…https://state.io/`, which is a malformed `<loc>` and a 404. The rule
 * below is the general form of that bug: a sitemap URL must start with `/` and
 * must not carry a scheme or a query.
 */
function isLocalPath(pathname: string): boolean {
  if (!pathname || !pathname.startsWith('/') || pathname.startsWith('//')) return false
  // Reject anything that still carries a scheme after the slash, e.g. "/https://x".
  return !pathname.slice(1).includes('://')
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/privacy'), lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/terms'), lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/proxy'), lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: absoluteUrl('/apps'), lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: absoluteUrl('/games/youtube'), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ]
  const gameSeoUrls: MetadataRoute.Sitemap = games.map(g => ({
    url: absoluteUrl(`/g/${g.id}`),
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: g.featured ? 0.9 : 0.6,
  }))
  const gameAssetUrls: MetadataRoute.Sitemap = games
    .filter(g => isLocalPath(g.path))
    .map(g => ({
      url: absoluteUrl(g.path),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    }))
  return [...staticPages, ...gameSeoUrls, ...gameAssetUrls]
}
