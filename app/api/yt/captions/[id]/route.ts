import { captionsVtt } from "../../innertube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WebVTT captions, same origin (YouTube's timedtext endpoint sets no CORS
 * headers and is usually blocked at school anyway).
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sp = new URL(req.url).searchParams;
  if (!/^[\w-]{11}$/.test(id)) return new Response("Bad id", { status: 400 });
  const lang = (sp.get("lang") || "en").slice(0, 8);
  const auto = sp.get("auto") === "1";
  const vtt = await captionsVtt(id, lang, auto);
  if (!vtt || vtt.length < 16) {
    return new Response("WEBVTT\n\n", {
      status: 200,
      headers: { "content-type": "text/vtt; charset=utf-8", "cache-control": "public, max-age=3600" },
    });
  }
  return new Response(vtt, {
    headers: {
      "content-type": "text/vtt; charset=utf-8",
      "cache-control": "public, max-age=86400, immutable",
      "access-control-allow-origin": "*",
    },
  });
}
