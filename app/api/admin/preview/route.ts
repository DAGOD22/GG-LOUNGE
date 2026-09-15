import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getGame, getRequest } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CSP =
  "default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:;";

/** Admin-only preview of a request or published game before/after approval. */
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") === "game" ? "game" : "request";
  const id = (searchParams.get("id") || "").slice(0, 80);
  if (!id) return new NextResponse("Missing id", { status: 400 });
  const doc = kind === "game" ? await getGame(id) : await getRequest(id);
  if (!doc?.html) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(doc.html, {
    headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP },
  });
}
