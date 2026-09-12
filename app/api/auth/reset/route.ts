import { NextResponse } from "next/server";
import { verifyFavoriteFood, resetAuthPassword, findAuthUserByUsername } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request){
  try{
    const { username, favoriteFood, newPassword } = await req.json() as any
    if(!username || !favoriteFood || !newPassword) return NextResponse.json({ error: "All fields required." }, { status: 400 })
    const user = await findAuthUserByUsername(String(username))
    if(!user) return NextResponse.json({ error: "User not found." }, { status: 404 })
    const ok = await verifyFavoriteFood(String(username), String(favoriteFood))
    if(!ok) return NextResponse.json({ error: "Wrong favorite food answer." }, { status: 401 })
    await resetAuthPassword(String(username), String(newPassword))
    return NextResponse.json({ ok: true })
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Reset failed" }, { status: 400 })
  }
}
