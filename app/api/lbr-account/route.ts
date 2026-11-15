import { NextResponse } from "next/server";
import { assertPublicTarget } from "@/lib/network-target";

/**
 * Account relay for Leaf Blower Revolution.
 *
 * The game's own account / cloud-save / season code posts form-encoded
 * requests to its official account server and reads the JSON reply. When the
 * game runs inside the lounge the browser will not always reach that server
 * (blocked host, mixed CORS, school network), so the game's "Sign in" dialog
 * is pointed at this route instead. The request is forwarded unchanged.
 *
 * Scope: this route only ever talks to the one official game host on HTTPS 443.
 * It refuses private addresses, other hosts, other ports and non-POST verbs, and
 * it does not log request bodies (they can contain a password).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set(["lbr.humblenorth.de", "humblenorth.de"]);
const MAX_BODY_BYTES = 64 * 1024;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "600",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function resolveTarget(req: Request): URL | null {
  try {
    const raw = new URL(req.url).searchParams.get("url") || "";
    const target = new URL(raw);
    if (!ALLOWED_HOSTS.has(target.hostname)) return null;
    if (target.protocol !== "https:" || (target.port && target.port !== "443")) return null;
    if (target.username || target.password) return null;
    assertPublicTarget(target);
    return target;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const target = resolveTarget(req);
  if (!target) return NextResponse.json({ error: "Only the official game account host is supported." }, { status: 400, headers: CORS });
  try {
    const upstream = await fetch(target, {
      headers: { accept: "*/*", "user-agent": "GG-Lounge/1.0 (+leaf-blower-revolution)" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        ...CORS,
        "content-type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-relay": "leaf-blower-revolution",
      },
    });
  } catch {
    return NextResponse.json({ error: "could not reach the game account server" }, { status: 502, headers: CORS });
  }
}

export async function POST(req: Request) {
  const target = resolveTarget(req);
  if (!target) return NextResponse.json({ error: "Only the official game account host is supported." }, { status: 400, headers: CORS });

  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large." }, { status: 413, headers: CORS });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": req.headers.get("content-type") || "application/x-www-form-urlencoded",
        accept: "application/json, text/plain, */*",
        "user-agent": "GG-Lounge/1.0 (+leaf-blower-revolution)",
      },
      body,
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        ...CORS,
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
        "x-relay": "leaf-blower-revolution",
      },
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timed out" : "could not reach the game account server";
    return NextResponse.json({ error: reason }, { status: 502, headers: CORS });
  } finally {
    clearTimeout(timer);
  }
}
