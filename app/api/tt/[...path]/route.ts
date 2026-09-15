import { NextResponse } from "next/server";
import { tiktokFeed, tiktokFromPage, tiktokPost, tiktokSearch } from "../lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TikTok for the lounge. Metadata + playable URLs are fetched by this server
 * and every media URL is rewritten to /api/yt/media, so the browser only ever
 * talks to the lounge origin.
 */
export async function GET(req: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const [root] = (path ?? []).filter(Boolean);
  const sp = new URL(req.url).searchParams;

  try {
    if (root === "feed" || !root) {
      const cursor = Number(sp.get("cursor") || 0);
      const region = (sp.get("region") || "US").slice(0, 4).toUpperCase();
      let res = await tiktokFeed({ cursor, region });
      // mirror hiccup -> try the next page (single retry keeps it snappy)
      if (!res.ok) res = await tiktokFeed({ cursor, region: "US" });
      if (!res.ok) {
        return NextResponse.json(
          { error: "TikTok mirrors unreachable", detail: res.error, items: [] },
          { status: 502 },
        );
      }
      return NextResponse.json(res, {
        headers: { "Cache-Control": "public, s-maxage=90, stale-while-revalidate=300" },
      });
    }

    if (root === "search") {
      const q = (sp.get("q") || "").trim().slice(0, 120);
      const cursor = Number(sp.get("cursor") || 0);
      if (!q) return NextResponse.json({ error: "Missing q", items: [] }, { status: 400 });
      const res = await tiktokSearch(q, cursor);
      if (!res.ok) {
        return NextResponse.json({ error: res.error, items: [] }, { status: 502 });
      }
      return NextResponse.json(res, {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=240" },
      });
    }

    if (root === "post") {
      const url = (sp.get("url") || "").trim();
      if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
      const direct = await tiktokPost(url);
      if (direct.ok && direct.item?.play) return NextResponse.json(direct);
      const rescue = await tiktokFromPage(url);
      if (rescue.ok) return NextResponse.json(rescue);
      return NextResponse.json(
        { error: rescue.error || direct.error || "unavailable" },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (err) {
    return NextResponse.json(
      { error: "TikTok proxy error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
