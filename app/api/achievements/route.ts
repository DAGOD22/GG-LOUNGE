import { NextResponse } from "next/server"
import { getUserFromToken, listUserAchievements, bulkUpsertAchievements, getUserStats } from "@/lib/db"
import { ACHIEVEMENTS } from "@/lib/achievements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getToken(req: Request) {
  const cookie = req.headers.get('cookie') || ''
  const m = cookie.split(';').find(s=> s.trim().startsWith('ggl_token='))
  return m?.split('=')[1]?.trim() || ''
}

// GET /api/achievements?gameId=cookie-clicker — returns definitions + user progress
export async function GET(req: Request){
  const url = new URL(req.url)
  const gameId = url.searchParams.get('gameId')
  const token = getToken(req)
  const user = token ? await getUserFromToken(token).catch(()=>null) : null

  let defs = ACHIEVEMENTS
  if (gameId) defs = defs.filter(a=> a.gameId===gameId)

  if (!user) {
    // guest: return defs with 0 progress
    return NextResponse.json({ achievements: defs.map(d=> ({...d, progress:0, unlocked:false, unlockedAt:null})), total: ACHIEVEMENTS.length, signedIn:false })
  }
  const progresses = await listUserAchievements(user.id)
  const map = new Map(progresses.map(p=> [p.achievementId, p]))
  const merged = defs.map(d=>{
    const p = map.get(d.id)
    return { ...d, progress: p?.progress||0, unlocked: !!p?.unlocked, unlockedAt: p?.unlockedAt||null }
  })
  const stats = await getUserStats(user.id)
  return NextResponse.json({ achievements: merged, total: ACHIEVEMENTS.length, stats, signedIn:true })
}

// POST /api/achievements — body: { updates: [{gameId, achievementId, progress, unlocked?}] }  OR single {gameId, achievementId, progress}
export async function POST(req: Request){
  const token = getToken(req)
  const user = await getUserFromToken(token)
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  try {
    const body = await req.json()
    const updates: Array<{gameId:string, achievementId:string, progress:number, unlocked?:boolean}> = []
    if (Array.isArray(body.updates)) {
      for (const u of body.updates) if (u.achievementId && u.gameId) updates.push({ gameId: String(u.gameId), achievementId: String(u.achievementId), progress: Number(u.progress)||0, unlocked: !!u.unlocked })
    } else if (body.achievementId && body.gameId) {
      updates.push({ gameId: String(body.gameId), achievementId: String(body.achievementId), progress: Number(body.progress)||0, unlocked: !!body.unlocked })
    } else {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }
    // auto-unlock if progress >= target
    for (const u of updates) {
      const def = ACHIEVEMENTS.find(a=> a.id===u.achievementId)
      if (def && u.progress >= def.target) u.unlocked = true
    }
    const res = await bulkUpsertAchievements(user.id, updates)
    return NextResponse.json({ ok:true, achievements: res })
  } catch (e:any) {
    return NextResponse.json({ error: e?.message||"failed" }, { status: 500 })
  }
}
