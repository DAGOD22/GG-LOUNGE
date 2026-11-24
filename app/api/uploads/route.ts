import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  MAX_CHUNK_BYTES,
  MAX_ICON_BYTES,
  MAX_UPLOAD_BYTES,
  assembleUpload,
  createRequest,
  dropUpload,
  publishDirect,
  putChunk,
  validateGameHtml,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chunks a single client may store per minute, and assembly attempts per hour. */
const CHUNKS_PER_MINUTE = 60;
const DONE_PER_HOUR = 10;

/**
 * Chunked game-HTML uploads.
 * - {op:'chunk', uploadId, idx, chunk} — store one piece (anyone, rate limited).
 * - {op:'done', uploadId, total, kind:'request'|'publish', title, icon} — assemble + save.
 *   kind 'publish' requires admin; 'request' is public.
 * - {op:'abort', uploadId} — discard pieces.
 *
 * This route is public by design (a student can request a game without an
 * account), so every limit that protects storage lives in lib/db/uploads.ts and
 * every limit that protects the function lives in the rate limiter below. An
 * upload id is also namespaced by client IP: ids used to be a bare global
 * namespace, so one client could guess or reuse another's id and either read
 * back a half-written HTML blob at assembly time or delete their pieces.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
  }
  const op = body.op;
  const rawId = typeof body.uploadId === "string" ? body.uploadId.slice(0, 80) : "";
  if (!rawId || !/^[A-Za-z0-9_-]+$/.test(rawId)) {
    return NextResponse.json({ error: "Invalid upload id." }, { status: 400 });
  }
  // Namespaced per client so ids cannot collide across clients.
  const uploadId = `${ip.replace(/[^A-Za-z0-9]/g, "_")}__${rawId}`.slice(0, 120);

  try {
    if (op === "chunk") {
      const budget = rateLimit(`uploads:chunk:${ip}`, CHUNKS_PER_MINUTE, 60_000);
      if (!budget.ok) {
        return NextResponse.json(
          { error: "Too many pieces — slow down." },
          { status: 429, headers: rateLimitResponse(CHUNKS_PER_MINUTE, budget.remaining, budget.resetAt) },
        );
      }
      const idx = Number(body.idx);
      const chunk = typeof body.chunk === "string" ? body.chunk : "";
      if (!Number.isInteger(idx) || idx < 0 || idx > 200) {
        return NextResponse.json({ error: "Invalid chunk index." }, { status: 400 });
      }
      if (!chunk || chunk.length > MAX_CHUNK_BYTES) {
        return NextResponse.json({ error: "Invalid chunk size." }, { status: 400 });
      }
      const stored = await putChunk(uploadId, idx, chunk);
      if (stored === "too-large") {
        return NextResponse.json(
          { error: `Game is too big — ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB maximum.` },
          { status: 413 },
        );
      }
      if (stored === "busy") {
        return NextResponse.json(
          { error: "Too many uploads in progress. Try again in a few minutes." },
          { status: 503, headers: { "retry-after": "120" } },
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (op === "abort") {
      await dropUpload(uploadId);
      return NextResponse.json({ ok: true });
    }

    if (op === "done") {
      const budget = rateLimit(`uploads:done:${ip}`, DONE_PER_HOUR, 60 * 60_000);
      if (!budget.ok) {
        return NextResponse.json(
          { error: "Too many uploads from this address. Try again later." },
          { status: 429, headers: rateLimitResponse(DONE_PER_HOUR, budget.remaining, budget.resetAt) },
        );
      }
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
