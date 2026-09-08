import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export async function POST(request: Request) { const body = await request.json(); const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : ''; const html = typeof body.html === 'string' ? body.html : ''; const icon = typeof body.icon === 'string' ? body.icon.trim().slice(0, 500) : null; if (!title || !html || html.length > 2_000_000 || !/<html[\s>]/i.test(html)) return NextResponse.json({ error: 'Provide a title and valid HTML file.' }, { status: 400 }); await pool.query('INSERT INTO "game_request" ("id","title","icon","html") VALUES ($1,$2,$3,$4)', [randomUUID(), title, icon, html]); return NextResponse.json({ ok: true }) }
