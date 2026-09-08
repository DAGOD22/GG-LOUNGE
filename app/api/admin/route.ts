import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const COOKIE = 'gg_admin_session'
const signature = () => createHmac('sha256', process.env.ADMIN_PASSWORD ?? '').update('gg-lounge-admin').digest('hex')
async function isAdmin() { const value = (await cookies()).get(COOKIE)?.value; const expected = signature(); if (!value || value.length !== expected.length) return false; return timingSafeEqual(Buffer.from(value), Buffer.from(expected)) }
function clean(value: unknown, limit: number) { return typeof value === 'string' ? value.trim().slice(0, limit) : '' }

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [bans, requests, games] = await Promise.all([
    pool.query('SELECT "id", "identifier", "reason", "createdAt" FROM "banned_user" ORDER BY "createdAt" DESC'),
    pool.query('SELECT "id", "title", "icon", "status", "createdAt" FROM "game_request" ORDER BY "createdAt" DESC'),
    pool.query('SELECT "id", "title", "icon", "createdAt" FROM "published_game" ORDER BY "createdAt" DESC'),
  ])
  return NextResponse.json({ bans: bans.rows, requests: requests.rows, games: games.rows })
}

export async function POST(request: Request) {
  const body = await request.json()
  if (body.action === 'login') {
    if (!process.env.ADMIN_PASSWORD || body.password !== process.env.ADMIN_PASSWORD) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const response = NextResponse.json({ ok: true }); response.cookies.set(COOKIE, signature(), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 8, path: '/' }); return response
  }
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const action = clean(body.action, 30)
  if (action === 'ban') { const identifier = clean(body.identifier, 160); if (!identifier) return NextResponse.json({ error: 'Identifier required' }, { status: 400 }); await pool.query('INSERT INTO "banned_user" ("id", "identifier", "reason") VALUES ($1,$2,$3) ON CONFLICT ("identifier") DO UPDATE SET "reason"=EXCLUDED."reason"', [randomUUID(), identifier, clean(body.reason, 500) || null]); return NextResponse.json({ ok: true }) }
  if (action === 'publish') { const id = clean(body.id, 80); await pool.query('INSERT INTO "published_game" ("id", "title", "icon", "html") SELECT "id", "title", "icon", "html" FROM "game_request" WHERE "id"=$1 ON CONFLICT ("id") DO NOTHING', [id]); await pool.query('UPDATE "game_request" SET "status"=$2 WHERE "id"=$1', [id, 'approved']); return NextResponse.json({ ok: true }) }
  if (action === 'deny') { await pool.query('UPDATE "game_request" SET "status"=$2 WHERE "id"=$1', [clean(body.id, 80), 'denied']); return NextResponse.json({ ok: true }) }
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function DELETE(request: Request) { if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const body = await request.json(); const type = clean(body.type, 20); const id = clean(body.id, 80); if (type === 'ban') await pool.query('DELETE FROM "banned_user" WHERE "id"=$1', [id]); if (type === 'game') await pool.query('DELETE FROM "published_game" WHERE "id"=$1', [id]); return NextResponse.json({ ok: true }) }
