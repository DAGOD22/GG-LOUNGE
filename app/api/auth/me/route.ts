import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request){
  const token = req.headers.get('cookie')?.split(';').find(s=> s.trim().startsWith('ggl_token='))?.split('=')[1]?.trim() || ''
  const user = await getUserFromToken(token)
  if(!user) return NextResponse.json({ user: null })
  return NextResponse.json({ user: { id: user.id, username: user.username } })
}
