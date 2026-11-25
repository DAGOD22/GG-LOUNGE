import { NextResponse } from "next/server";
import { isChatverseMember } from "@/lib/chatverse-auth";
import { MAX_CHAT_MEDIA_BYTES, putMedia, sniffMedia } from "@/lib/db/chat-media";
import { consumeSharedBudget, callerKey } from "@/lib/live-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload a screenshot or image into CHATVERSE.
 *
 * Takes the raw body (not multipart) so a paste, a drag or a file picker all
 * funnel into one code path. The type is sniffed from the bytes; the filename
 * and the browser's `content-type` are treated as decoration only. Anything
 * that is not a real PNG/JPEG/GIF/WebP/AVIF/HEIC still or an MP4/WebM clip is
 * refused before a single byte is stored.
 */
export async function POST(req: Request) {
  if (!(await isChatverseMember())) return NextResponse.json({ error: "Locked" }, { status: 401 });
  if (!(await consumeSharedBudget(`chatverse:media:${callerKey(req)}`, 30, 60))) {
    return NextResponse.json({ error: "Slow down — too many uploads." }, { status: 429 });
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_CHAT_MEDIA_BYTES) {
    return NextResponse.json({ error: "That file is larger than 4 MB." }, { status: 413 });
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  if (!buffer.length) return NextResponse.json({ error: "Empty file." }, { status: 400 });
  if (buffer.length > MAX_CHAT_MEDIA_BYTES) {
    return NextResponse.json({ error: "That file is larger than 4 MB." }, { status: 413 });
  }

  const mime = sniffMedia(buffer.subarray(0, 32));
  if (!mime) {
    return NextResponse.json(
      { error: "That is not an image or a short video (PNG, JPEG, GIF, WebP, AVIF, MP4 or WebM)." },
      { status: 415 },
    );
  }

  const room = (new URL(req.url).searchParams.get("room") ?? "").slice(0, 40);
  const name = req.headers.get("x-file-name") ?? "image";
  const saved = await putMedia(buffer, mime, decodeURIComponent(name), room);
  return NextResponse.json({ url: saved.url, mime, name });
}
