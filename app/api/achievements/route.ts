import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomUUID } from 'node:crypto'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { achievements, earnedBy, isGameplayEvent } from '@/lib/achievements'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user)
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const result = await pool.query(
    'SELECT "slug" FROM "achievement" WHERE "userId"=$1',
    [session.user.id],
  )
  return NextResponse.json({
    slugs: result.rows
      .map((row) => row.slug)
      .filter((slug) => achievements.some((a) => a.slug === slug)),
  })
}
export async function POST(request: Request) {
  // Same-origin browser events, not arbitrary achievement slugs. Client telemetry is
  // suitable for personal milestones, not an authoritative competitive leaderboard.
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user)
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (
    !Array.isArray(body?.events) ||
    !body.events.length ||
    body.events.length > 100 ||
    !body.events.every(isGameplayEvent)
  )
    return NextResponse.json(
      { error: 'Invalid gameplay events' },
      { status: 400 },
    )
  const slugs = [
    ...new Set(
      (body.events as Parameters<typeof earnedBy>[0][]).flatMap((e) =>
        earnedBy(e).map((a) => a.slug),
      ),
    ),
  ]
  if (!slugs.length) return NextResponse.json({ unlocked: [] })
  const result = await pool.query(
    'INSERT INTO "achievement" ("id","userId","slug") SELECT unnest($1::text[]), $2, unnest($3::text[]) ON CONFLICT DO NOTHING RETURNING "slug"',
    [slugs.map(() => randomUUID()), session.user.id, slugs],
  )
  return NextResponse.json({ unlocked: result.rows.map((row) => row.slug) })
}
