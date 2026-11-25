import { isChatverseMember } from "@/lib/chatverse-auth";
import { getMedia } from "@/lib/db/chat-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve one uploaded image or clip.
 *
 * Three headers matter and each is doing a job:
 *
 *   · `content-type` comes from the sniff done at upload time, never from a
 *     caller — so a file cannot be reinterpreted as HTML later.
 *   · `nosniff` stops the browser second-guessing that type.
 *   · `Content-Disposition: inline` plus a sandboxing CSP keeps a "video" from
 *     being navigated to as a document.
 *
 * The route is gated on the CHATVERSE cookie, so an upload cannot be hot-linked
 * or crawled by anyone who was not let in.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isChatverseMember())) return new Response("Locked", { status: 401 });
  const { id } = await context.params;
  const media = await getMedia(id);
  if (!media) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(media.bytes), {
    headers: {
      "content-type": media.mime,
      "content-length": String(media.size),
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-disposition": `inline; filename="${media.name.replace(/["\\]/g, "")}"`,
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
