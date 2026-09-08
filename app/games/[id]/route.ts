import { NextResponse } from 'next/server'
import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) { const { id } = await context.params; const result = await pool.query('SELECT "html" FROM "published_game" WHERE "id"=$1', [id]); if (!result.rows[0]) return new NextResponse('Game not found', { status: 404 }); return new NextResponse(result.rows[0].html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:;" } }) }
