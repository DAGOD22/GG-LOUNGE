import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://gg-lounge.example.com'
  const staticRoutes = ['', '/proxy', '/apps', '/request-game', '/admin'].map(p=> ({
    url: base + p,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: p==='' ? 1 : 0.6,
  }))
  // 200 games for SEO - list top 30 as example, full sitemap would be dynamic
  const gameIds = ['cookie-clicker','stack','drive-mad','slope','retro-bowl','among-us','hole-io','moto-x3m','1v1-lol','ovo','geometry-dash','paper-minecraft','eaglercraftx','subway-surfers','drift-boss','tunnel-rush','cluster-rush','temple-run-2']
  const gameRoutes = gameIds.map(id=> ({
    url: `${base}/#${id}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }))
  return [...staticRoutes, ...gameRoutes]
}
