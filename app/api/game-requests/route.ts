import { NextResponse } from "next/server";
import { MAX_ICON_BYTES, createRequest, validateGameHtml } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Small single-shot game requests (back-compat).
 * The request form uses /api/uploads (chunked) for real index.html files;
 * this endpoint stays for tiny games posted as JSON.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
    const html = typeof body.html === "string" ? body.html : "";
    const icon =
      typeof body.icon === "string" && body.icon ? body.icon.trim().slice(0, MAX_ICON_BYTES) : null;
    if (!title) return NextResponse.json({ error: "Game title is required." }, { status: 400 });
    if (html.length > 3_000_000) {
      return NextResponse.json(
        { error: "File is too large for quick submit — use the upload form instead." },
        { status: 400 },
      );
    }
    const invalid = validateGameHtml(html);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    const saved = await createRequest(title, icon, html);
    return NextResponse.json({ ok: true, id: saved.id });
  } catch (err) {
    console.error("[game-requests]", err);
    return NextResponse.json({ error: "Couldn't save the request. Try again." }, { status: 500 });
  }
}
