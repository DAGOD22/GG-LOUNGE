import { NextResponse } from "next/server";
import { upvoteRequest } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upvoteRate2 = new Map<string, { count: number; reset: number }>();
function hitUpvoteLimit(ip: string): boolean {
  const now = Date.now();
  const e = upvoteRate2.get(ip);
  if (!e || now > e.reset) {
    upvoteRate2.set(ip, { count: 1, reset: now + 60_000 });
    if (upvoteRate2.size > 5000) for (const [k,v] of upvoteRate2) if (now > v.reset) upvoteRate2.delete(k);
    return true;
  }
  if (e.count >= 10) return false;
  e.count++;
  return true;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "0.0.0.0";
  if (!hitUpvoteLimit(ip)) {
    return NextResponse.json({ error: "Too many votes — wait a minute." }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const updated = await upvoteRequest(id);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, request: updated });
}
