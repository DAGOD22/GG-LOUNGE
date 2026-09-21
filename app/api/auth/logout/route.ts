import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request){
  const token = req.headers.get('cookie')?.split(';').find(s=> s.trim().startsWith('ggl_token='))?.split('=')[1]?.trim() || ''
  if(token) await deleteSession(token)
  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', 'ggl_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;')
  return res
}
