import { NextResponse } from 'next/server'
import { games } from '@/lib/games'
import Fuse from 'fuse.js'

export const dynamic = 'force-dynamic'

const fuse = new Fuse(games, {
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'genre', weight: 0.2 },
    { name: 'tone', weight: 0.15 },
    { name: 'description', weight: 0.15 },
  ],
  threshold: 0.35,
  distance: 80,
  minMatchCharLength: 2,
  ignoreLocation: true,
  includeScore: true,
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const limit = Math.min(24, Math.max(1, parseInt(searchParams.get('limit') || '12', 10) || 12))

  if (!q) {
    return NextResponse.json({ query: '', results: games.slice(0, limit).map(g => ({ id: g.id, title: g.title, genre: g.genre, tone: g.tone })), total: games.length })
  }

  // fast exact substring first (instant), then fuse for typos
  const lower = q.toLowerCase()
  const exact = games.filter(g => `${g.title} ${g.genre} ${g.tone} ${g.description}`.toLowerCase().includes(lower))

  let results = exact
  let typoCorrected: string | null = null

  if (exact.length === 0) {
    const fused = fuse.search(q, { limit })
    results = fused.map(r => r.item)
    // if fuse found something with good score, suggest correction via first result title substring?
    if (fused.length > 0 && fused[0].score !== undefined && fused[0].score < 0.3) {
      // simple suggestion: use matched key value
      typoCorrected = fused[0].item.title
    }
  } else if (exact.length < limit) {
    // also add fuzzy to fill up to limit
    const fused = fuse.search(q, { limit: limit * 2 })
    const seen = new Set(exact.map(g => g.id))
    for (const r of fused) {
      if (results.length >= limit) break
      if (!seen.has(r.item.id)) {
        results.push(r.item)
        seen.add(r.item.id)
      }
    }
  } else {
    results = results.slice(0, limit)
  }

  return NextResponse.json(
    {
      query: q,
      results: results.map(g => ({ id: g.id, title: g.title, genre: g.genre, tone: g.tone, path: g.path, icon: g.icon, mark: g.mark, color: g.color })),
      total: results.length,
      exactCount: exact.length,
      suggestion: typoCorrected,
    },
    { headers: { 'cache-control': 'public, s-maxage=30, stale-while-revalidate=60' } }
  )
}
