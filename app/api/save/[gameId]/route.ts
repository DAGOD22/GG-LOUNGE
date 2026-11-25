import { NextResponse } from "next/server";
import { getUserFromToken, getSave, setSave } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getToken(req: Request){
  const cookie = req.headers.get('cookie') || ''
  const m = cookie.split(';').find(s=> s.trim().startsWith('ggl_token='))
  return m?.split('=')[1]?.trim() || ''
}

export async function GET(req: Request, ctx: { params: Promise<{ gameId: string }> }){
  const { gameId } = await ctx.params
  const token = getToken(req)
  const user = await getUserFromToken(token)
  if(!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 })
  const save = await getSave(user.id, gameId)
  return NextResponse.json({ save: save ? { gameId: save.gameId, data: save.data, updatedAt: save.updatedAt } : null })
}

export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }){
  const { gameId } = await ctx.params
  const token = getToken(req)
  const user = await getUserFromToken(token)
  if(!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 })
  try{
    const body = await req.json() as any
    const data = typeof body.data === 'string' ? body.data : JSON.stringify(body.data || {})
    // Real web builds carry big save files (Leaf Blower Revolution's is ~1.2 MB
    // raw, ~85 KB gzipped), so allow a generous cap while staying under the
    // Postgres row/ TEXT practical limits.
    const MAX_SAVE_BYTES = 4_000_000
    if(data.length > MAX_SAVE_BYTES) return NextResponse.json({ error: "Save too large (limit 4 MB)" }, { status: 413 })
    const saved = await setSave(user.id, gameId, data)
    return NextResponse.json({ ok: true, save: saved })
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Save failed" }, { status: 500 })
  }
}
