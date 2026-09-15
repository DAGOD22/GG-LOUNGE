import { NextResponse } from 'next/server'
import { listGames } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * main built this on a hand-made pg Pool, which meant community games vanished
 * whenever the app ran in local JSON mode (and two pools pointed at one database).
 * lib/db already understands both modes, so the listing comes from there.
 */
export async function GET() {
  try {
    const games = await listGames()
    return NextResponse.json(games.map((g) => ({ id: g.id, title: g.title, icon: g.icon ?? null })))
  } catch (error) {
    return NextResponse.json({ error: 'Game listing is unavailable.' }, { status: 502 })
  }
}
