import { NextResponse } from "next/server"
import { getUserFromToken, listUserAchievements, getUserStats, listUserGameStats } from "@/lib/db"
import { ACHIEVEMENTS } from "@/lib/achievements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getToken(req: Request){
  const c = req.headers.get('cookie')||''
  return c.split(';').find(s=> s.trim().startsWith('ggl_token='))?.split('=')[1]?.trim()||''
}

export async function GET(req: Request){
  const token = getToken(req)
  const user = await getUserFromToken(token).catch(()=>null)
  if (!user) return NextResponse.json({ signedIn:false, total: ACHIEVEMENTS.length, unlocked:0, points:0 })
  const stats = await getUserStats(user.id)
  const gameStats = await listUserGameStats(user.id)
  return NextResponse.json({ signedIn:true, total: ACHIEVEMENTS.length, ...stats, gameStats })
}
