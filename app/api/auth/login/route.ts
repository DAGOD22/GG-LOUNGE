import { NextResponse } from "next/server";
import { verifyAuthUser, createSession } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookieForToken(token:string){
  return `ggl_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30*24*3600};`
}

export async function POST(req: Request){
  try{
    const { username, password } = await req.json() as any
    if(!username || !password) return NextResponse.json({ error: "Username and password required." }, { status: 400 })
    const user = await verifyAuthUser(String(username), String(password))
    if(!user) return NextResponse.json({ error: "Wrong username or password." }, { status: 401 })
    const sess = await createSession(user.id)
    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username } })
    res.headers.set('Set-Cookie', cookieForToken(sess.token))
    return res
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Login failed" }, { status: 500 })
  }
}
