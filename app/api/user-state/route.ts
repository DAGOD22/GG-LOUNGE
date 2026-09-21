import { NextResponse } from "next/server";
import { getUserState, setUserState } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.slice(0,64);
  if(!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const state = await getUserState(id);
  return NextResponse.json({ state });
}
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(()=> ({}));
    const id = typeof (body as any).id === "string" ? (body as any).id.slice(0,64) : "";
    if(!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const favorites = Array.isArray((body as any).favorites) ? (body as any).favorites.slice(0,100).map((x:any)=> String(x).slice(0,40)) : [];
    const playCounts = typeof (body as any).playCounts === "object" && (body as any).playCounts ? (body as any).playCounts : {};
    const sanitized: Record<string,number> = {};
    for(const k of Object.keys(playCounts).slice(0,200)) sanitized[String(k).slice(0,40)] = Math.max(0, Math.min(9999, Number(playCounts[k])||0));
    const recentlyPlayed = Array.isArray((body as any).recentlyPlayed) ? (body as any).recentlyPlayed.slice(0,20).map((x:any)=> String(x).slice(0,40)) : [];
    const saved = await setUserState(id, { favorites, playCounts: sanitized, recentlyPlayed } as any);
    return NextResponse.json({ ok: true, state: saved });
  } catch(e) {
    console.error("[user-state]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
