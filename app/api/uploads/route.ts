import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import {
  MAX_CHUNK_BYTES,
  MAX_ICON_BYTES,
  assembleUpload,
  createRequest,
  dropUpload,
  publishDirect,
  putChunk,
  validateGameHtml,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chunked game-HTML uploads.
 * - {op:'chunk', uploadId, idx, chunk} — store one piece (anyone).
 * - {op:'done', uploadId, total, kind:'request'|'publish', title, icon} — assemble + save.
 *   kind 'publish' requires admin; 'request' is public.
 * - {op:'abort', uploadId} — discard pieces.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
  }
  const op = body.op;
  const uploadId = typeof body.uploadId === "string" ? body.uploadId.slice(0, 80) : "";
  if (!uploadId || !/^[A-Za-z0-9_-]+$/.test(uploadId)) {
    return NextResponse.json({ error: "Invalid upload id." }, { status: 400 });
  }

  try {
    if (op === "chunk") {
      const idx = Number(body.idx);
      const chunk = typeof body.chunk === "string" ? body.chunk : "";
      if (!Number.isInteger(idx) || idx < 0 || idx > 200) {
        return NextResponse.json({ error: "Invalid chunk index." }, { status: 400 });
      }
      if (!chunk || chunk.length > MAX_CHUNK_BYTES) {
        return NextResponse.json({ error: "Invalid chunk size." }, { status: 400 });
      }
      await putChunk(uploadId, idx, chunk);
      return NextResponse.json({ ok: true });
    }

    if (op === "abort") {
      await dropUpload(uploadId);
      return NextResponse.json({ ok: true });
    }

    if (op === "done") {
      const total = Number(body.total);
      const kind = body.kind === "publish" ? "publish" : "request";
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
      const icon = typeof body.icon === "string" && body.icon ? body.icon.slice(0, MAX_ICON_BYTES + 100) : null;
      if (!Number.isInteger(total) || total < 1 || total > 200) {
        return NextResponse.json({ error: "Invalid chunk total." }, { status: 400 });
      }
      if (!title) return NextResponse.json({ error: "Game title is required." }, { status: 400 });
      if (icon && icon.length > MAX_ICON_BYTES) {
        return NextResponse.json({ error: "Icon is too large (300KB max)." }, { status: 400 });
      }
      if (kind === "publish" && !(await isAdmin())) {
        return NextResponse.json({ error: "Admin login required." }, { status: 401 });
      }
      const html = await assembleUpload(uploadId, total);
      if (html == null) {
        return NextResponse.json({ error: "Upload incomplete — a piece is missing. Try again." }, { status: 400 });
      }
      const invalid = validateGameHtml(html);
      if (invalid) {
        await dropUpload(uploadId);
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
      const saved =
        kind === "publish"
          ? await publishDirect(title, icon, html)
          : await createRequest(title, icon, html);
      await dropUpload(uploadId);
      return NextResponse.json({ ok: true, id: saved.id });
    }

    return NextResponse.json({ error: "Unknown upload op." }, { status: 400 });
  } catch (err) {
    console.error("[uploads]", err);
    return NextResponse.json({ error: "Upload failed on the server. Try again." }, { status: 500 });
  }
}
