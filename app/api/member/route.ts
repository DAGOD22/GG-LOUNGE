import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomUUID } from 'node:crypto'
import { auth } from '@/lib/auth-server'
import { getMode, pool } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function member() { return auth.api.getSession({ headers: await headers() }) }

// Member data lives in Postgres only (better-auth owns those tables). Without a
// DATABASE_URL every call below throws, so say what is missing instead of
// surfacing a 500 in the middle of the profile page.
function unavailable() {
  if (getMode() === 'postgres') return null
  return NextResponse.json(
    { error: 'Member accounts need the Postgres database. Add DATABASE_URL to this deployment (Vercel -> Settings -> Environment Variables), then sign in again.' },
    { status: 503 },
  )
}
export async function GET() {
  const down = unavailable(); if (down) return down
  const session = await member(); if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const userId = session.user.id
  const [profile, achievements, notes, messages] = await Promise.all([
    pool.query('SELECT "username" FROM "profile" WHERE "userId"=$1', [userId]),
    pool.query('SELECT "slug", "unlockedAt" FROM "achievement" WHERE "userId"=$1 ORDER BY "unlockedAt" DESC', [userId]),
    pool.query('SELECT "id", "title", "body", "updatedAt" FROM "note" WHERE "userId"=$1 ORDER BY "updatedAt" DESC', [userId]),
    pool.query('SELECT "id", "username", "body", "createdAt" FROM "chat_message" ORDER BY "createdAt" DESC LIMIT 80'),
  ])
  return NextResponse.json({ user: { id: userId, name: session.user.name }, profile: profile.rows[0], achievements: achievements.rows, notes: notes.rows, messages: messages.rows.reverse() })
}
export async function POST(request: Request) {
  const down = unavailable(); if (down) return down
  const session = await member(); if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const body = await request.json(); const userId = session.user.id; const username = String(body.username || session.user.name || 'Player').slice(0, 40)
  await pool.query('INSERT INTO "profile" ("id","userId","username") VALUES ($1,$2,$3) ON CONFLICT ("userId") DO UPDATE SET "username"=EXCLUDED."username"', [randomUUID(), userId, username])
  if (body.action === 'note') await pool.query('INSERT INTO "note" ("id","userId","title","body") VALUES ($1,$2,$3,$4)', [randomUUID(), userId, String(body.title || 'Untitled').slice(0, 100), String(body.note || '').slice(0, 10000)])
  if (body.action === 'chat') await pool.query('INSERT INTO "chat_message" ("id","userId","username","body") VALUES ($1,$2,$3,$4)', [randomUUID(), userId, username, String(body.message || '').trim().slice(0, 500)])
  if (body.action === 'achievement') await pool.query('INSERT INTO "achievement" ("id","userId","slug") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [randomUUID(), userId, String(body.slug).slice(0, 80)])
  return NextResponse.json({ ok: true })
}
