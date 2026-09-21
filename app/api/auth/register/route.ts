import { NextResponse } from "next/server";
import { createAuthUser, createSession, checkRateLimit } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookieForToken(token:string){
  return `ggl_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30*24*3600}; Secure;`
}
function getIp(req:Request){
  try{ const h=req.headers.get('x-forwarded-for'); if(h) return h.split(',')[0].trim(); return req.headers.get('x-real-ip')||'unknown' }catch{ return 'unknown'}
}
export async function POST(req: Request){
  try{
    const ip=getIp(req)
    if(!checkRateLimit('register:'+ip, 5, 15*60*1000)) return NextResponse.json({ error: "Too many accounts — try again later." }, { status: 429 })
    const { username, password, favoriteFood } = await req.json() as any
    if(!username || !password || !favoriteFood) return NextResponse.json({ error: "Username, password and favorite food required." }, { status: 400 })
    const usernameLower = String(username).trim().toLowerCase()
    if(!checkRateLimit('register:user:'+usernameLower, 3, 60*60*1000)) return NextResponse.json({ error: "Too many attempts for this username — wait an hour." }, { status: 429 })
    const user = await createAuthUser(String(username), String(password), String(favoriteFood))
    const sess = await createSession(user.id)
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username } })
    res.headers.set('Set-Cookie', cookieForToken(sess.token))
    return res
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Failed to create account" }, { status: 400 })
  }
}
