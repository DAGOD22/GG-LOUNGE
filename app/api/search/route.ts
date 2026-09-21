import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// School-friendly Bing search proxy — same-origin, no bare needed
// Fetches Bing server-side and streams back, so school only sees same-origin request
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }
  const target = `https://www.bing.com/search?q=${encodeURIComponent(q)}&form=QBLH&sp=-1&ghc=1`;
  try {
    const r = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // 8s timeout
      signal: AbortSignal.timeout(8000) as any,
      cache: "no-store",
    });
    if (!r.ok) {
      return NextResponse.json({ error: "Bing unreachable", status: r.status }, { status: 502 });
    }
    const html = await r.text();
    // Rewrite links to go through same-origin proxy or bare if needed
    // For now, just return HTML with base tag handling — client will handle
    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
        "X-Search-Engine": "bing-school-proxy",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Search failed", detail: String(e?.message || e) }, { status: 502 });
  }
}
