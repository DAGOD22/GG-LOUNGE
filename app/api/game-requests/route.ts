import { NextResponse } from "next/server";
import { MAX_ICON_BYTES, createRequest, createSimpleRequest, listRequests, upvoteRequest, validateGameHtml } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fix 10: rate limits for game requests — 5 creates/min + 10 upvotes/min per IP
const reqRate = new Map<string, { count: number; reset: number }>();
const upvoteRate = new Map<string, { count: number; reset: number }>();
function hitLimit(map: Map<string,{count:number;reset:number}>, ip: string, max: number): boolean {
  const now = Date.now();
  const e = map.get(ip);
  if (!e || now > e.reset) {
    map.set(ip, { count: 1, reset: now + 60_000 });
    if (map.size > 5000) for (const [k,v] of map) if (now > v.reset) map.delete(k);
    return true;
  }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

export async function GET() {
  try {
    const requests = await listRequests();
    // return in shape expected by homepage: { requests: [{id,title,votes,status}]}
    return NextResponse.json({ requests: requests.map(r=> ({ id:r.id, title:r.title, votes: (r as any).votes||1, status:r.status, createdAt:r.createdAt })) }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } });
  } catch (e) {
    console.error("[game-requests GET]", e);
    return NextResponse.json({ requests: [] });
  }
}

/**
 * Supports:
 * - {title, html, icon} -> full upload (back-compat, validates html)
 * - {title} -> simple request (no html) for homepage quick request
 * - {upvoteId} -> upvote existing request
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(()=> ({}));
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "0.0.0.0";
    // upvote shortcut
    if (typeof (body as any).upvoteId === "string" && (body as any).upvoteId.trim()) {
      if (!hitLimit(upvoteRate, ip, 10)) {
        return NextResponse.json({ error: "Too many votes — wait a minute and try again." }, { status: 429, headers: { "Retry-After": "60" } });
      }
      const id = (body as any).upvoteId.trim();
      const updated = await upvoteRequest(id);
      if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, request: updated });
    }
    if (!hitLimit(reqRate, ip, 5)) {
      return NextResponse.json({ error: "Too many requests — please wait a minute." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const title = typeof (body as any).title === "string" ? (body as any).title.trim().slice(0, 80) : "";
    const html = typeof (body as any).html === "string" ? (body as any).html : "";
    const icon =
      typeof (body as any).icon === "string" && (body as any).icon ? (body as any).icon.trim().slice(0, MAX_ICON_BYTES) : null;
    if (!title) return NextResponse.json({ error: "Game title is required." }, { status: 400 });

    // simple title-only request path (homepage)
    if (!html) {
      const saved = await createSimpleRequest(title);
      return NextResponse.json({ ok: true, id: saved.id, request: { id: saved.id, title: saved.title, votes: 1, status: saved.status } });
    }

    if (html.length > 3_000_000) {
      return NextResponse.json(
        { error: "File is too large for quick submit — use the upload form instead." },
        { status: 400 },
      );
    }
    const invalid = validateGameHtml(html);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    const saved = await createRequest(title, icon, html);
    return NextResponse.json({ ok: true, id: saved.id, request: saved });
  } catch (err) {
    console.error("[game-requests]", err);
    return NextResponse.json({ error: "Couldn't save the request. Try again." }, { status: 500 });
  }
}
