import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomUUID } from 'node:crypto'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'

async function member() { return auth.api.getSession({ headers: await headers() }) }
export async function GET() {
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
  const session = await member(); if (!session?.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!['note', 'chat'].includes(body?.action)) return NextResponse.json({ error: 'Unsupported action. Achievements are earned through gameplay.' }, { status: 400 })
  const content = String(body.action === 'note' ? body.note || '' : body.message || '').trim()
  if (!content) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
  const userId = session.user.id
  const username = String(session.user.name || 'Player').slice(0, 40)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('INSERT INTO "profile" ("id","userId","username") VALUES ($1,$2,$3) ON CONFLICT ("userId") DO UPDATE SET "username"=EXCLUDED."username"', [randomUUID(), userId, username])
    if (body.action === 'note') await client.query('INSERT INTO "note" ("id","userId","title","body") VALUES ($1,$2,$3,$4)', [randomUUID(), userId, String(body.title || 'Untitled').slice(0, 100), content.slice(0, 10000)])
    else await client.query('INSERT INTO "chat_message" ("id","userId","username","body") VALUES ($1,$2,$3,$4)', [randomUUID(), userId, username, content.slice(0, 500)])
    const award = await client.query('INSERT INTO "achievement" ("id","userId","slug") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING "slug"', [randomUUID(), userId, body.action])
    await client.query('COMMIT')
    return NextResponse.json({ ok: true, unlocked: award.rows.map(row => row.slug) })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}
