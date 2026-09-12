import type { MetadataRoute } from 'next'
import { games } from '@/lib/games'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://gg-lounge.vercel.app'
  const now = new Date()
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/proxy`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/apps`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/games/youtube`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ]
  const gameUrls: MetadataRoute.Sitemap = games.slice(0, 100).map(g => ({
    url: `${base}${g.path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))
  return [...staticPages, ...gameUrls]
}
