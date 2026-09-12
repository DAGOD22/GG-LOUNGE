import { NextResponse } from "next/server";
import { createAuthUser, createSession } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookieForToken(token:string){
  return `ggl_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30*24*3600};`
}

export async function POST(req: Request){
  try{
    const { username, password, favoriteFood } = await req.json() as any
    if(!username || !password || !favoriteFood) return NextResponse.json({ error: "Username, password and favorite food required." }, { status: 400 })
    const user = await createAuthUser(String(username), String(password), String(favoriteFood))
    const sess = await createSession(user.id)
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username } })
    res.headers.set('Set-Cookie', cookieForToken(sess.token))
    return res
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Failed to create account" }, { status: 400 })
  }
}
