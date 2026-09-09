import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ultraviolet client config, served dynamically so the proxy page can switch
 *  between the local bare server and public fallback bare servers. */
export async function GET() {
  const jar = await cookies();
  const raw = (jar.get("gg_bare")?.value || "/api/bare/").trim();
  const safe =
    /^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]*)?$/.test(raw) ||
    raw.startsWith("/")
      ? raw.replace(/["'\\<>]/g, "")
      : "/api/bare/";

  const js = `self.__uv$config = {
  prefix: "/service/",
  bare: ${JSON.stringify(safe)},
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/uv/uv.handler.js",
  bundle: "/uv/uv.bundle.js",
  config: "/uv/uv.config.js",
  sw: "/uv/uv.sw.js",
};
`;
  return new Response(js, { headers: { "content-type": "application/javascript" } });
}
