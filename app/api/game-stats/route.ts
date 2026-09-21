import { NextResponse } from "next/server"
import { getUserFromToken, incrementGameStats, getUserGameStats } from "@/lib/db"

export const runtime="nodejs"
export const dynamic="force-dynamic"

function getToken(req:Request){
  const c=req.headers.get('cookie')||''
  return c.split(';').find(s=> s.trim().startsWith('ggl_token='))?.split('=')[1]?.trim()||''
}

// POST {gameId, timeSeconds}
export async function POST(req:Request){
  const token=getToken(req)
  const user=await getUserFromToken(token).catch(()=>null)
  if(!user) return NextResponse.json({ ok:true, guest:true })
  try{
    const {gameId, timeSeconds} = await req.json() as any
    if(!gameId || typeof gameId!=='string') return NextResponse.json({error:"gameId required"},{status:400})
    const stats = await incrementGameStats(user.id, gameId.slice(0,80), Number(timeSeconds)||0)
    return NextResponse.json({ ok:true, stats })
  }catch(e:any){ return NextResponse.json({error:e?.message||"failed"},{status:500}) }
}

export async function GET(req:Request){
  const token=getToken(req)
  const user=await getUserFromToken(token).catch(()=>null)
  if(!user) return NextResponse.json({ signedIn:false })
  const url=new URL(req.url)
  const gameId=url.searchParams.get('gameId')
  if(gameId){
    const s=await getUserGameStats(user.id, gameId)
    return NextResponse.json({ signedIn:true, stats: s })
  }
  return NextResponse.json({ signedIn:true })
}
