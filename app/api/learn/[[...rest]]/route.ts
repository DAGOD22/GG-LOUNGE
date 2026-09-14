import { Readable, Writable } from "node:stream";
import { createBareServer } from "@nebula-services/bare-server-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GG-Lounge Bare (TOMPHTTP) — INSANE MODE for harshest school networks
 * - Streaming responses (no buffering) => YouTube video/range works without OOM
 * - 90s timeout, 100MB upload cap, Range/Cookie forwarding
 * - Alias bare endpoints /api/edu/ /api/learn/ to evade keyword filters on /api/bare/
 * - Preserves large x-bare-* JSON headers (8k), proper CORS
 */

const DIRECTORY = "/api/bare/";
const ALIAS_PREFIXES = ["/api/bare/", "/api/edu/", "/api/learn/", "/api/t/"] as const;
const bare = createBareServer(DIRECTORY, {
  logErrors: false,
  maintainer: { email: "gg@lounge.local", website: "https://gg-lounge.local" },
} as never);

function cleanText(v: string, max = 400): string {
  return v.replace(/[^\x20-\x7E]/g, "").slice(0, max) || "OK";
}
function cleanHeaderValue(v: unknown, isBare = false): string {
  const max = isBare ? 7800 : 400;
  if (Array.isArray(v)) return v.map((x) => cleanText(String(x), max)).join(", ");
  const s = String(v ?? "");
  if (!isBare) return cleanText(s, max);
  if (s.length <= max) return cleanText(s, max);
  // Bare headers often contain JSON (x-bare-headers). Slicing it in the middle breaks JSON
  // and causes the exact error seen: “Unterminated string in JSON at position 8192”.
  // Instead, parse and shrink values so the JSON stays valid and under the 8k Vercel limit.
  try {
    const obj = JSON.parse(s);
    const tryStr = (o: unknown) => JSON.stringify(o);
    let cur = tryStr(obj);
    if (cur.length <= max) return cleanText(cur, max);
    const truncateObj = (o: unknown, limit: number): unknown => {
      if (typeof o === "string") return o.slice(0, limit);
      if (Array.isArray(o)) return o.map((x) => truncateObj(x, limit));
      if (o && typeof o === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(o as Record<string, unknown>)) out[k] = truncateObj(val, limit);
        return out;
      }
      return o;
    };
    for (const limit of [1200, 800, 500, 300, 150, 80]) {
      const shrunk = truncateObj(obj, limit);
      cur = tryStr(shrunk);
      if (cur.length <= max) return cleanText(cur, max);
    }
    if (obj && typeof obj === "object") {
      const copy = { ...(obj as Record<string, unknown>) };
      delete (copy as Record<string, unknown>)["set-cookie"];
      delete (copy as Record<string, unknown>)["Set-Cookie"];
      delete (copy as Record<string, unknown>)["cookie"];
      delete (copy as Record<string, unknown>)["Cookie"];
      cur = tryStr(copy);
      if (cur.length <= max) return cleanText(cur, max);
    }
    return cleanText(JSON.stringify({ bare: "headers truncated" }), max);
  } catch {
    return cleanText(s, max);
  }
}
function isBareHeader(k: string): boolean {
  return k.startsWith("x-bare-") || k === "x-bare-headers" || k === "x-bare-forward-headers";
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const rawPath = url.pathname;

  // Normalize alias bare paths to DIRECTORY for the bare server
  // e.g. /api/edu/v1/... -> /api/bare/v1/...
  // Also handles /api/learn/...
  let effectivePath = rawPath;
  for (const alias of ALIAS_PREFIXES) {
    if (rawPath.startsWith(alias)) {
      effectivePath = DIRECTORY + rawPath.slice(alias.length);
      break;
    }
  }
  // If path is exactly /api/edu or /api/learn or /api/t without trailing slash, treat as bare root
  if (effectivePath === rawPath && (rawPath === "/api/edu" || rawPath === "/api/learn" || rawPath === "/api/t")) {
    effectivePath = DIRECTORY;
  }

  // Build bare-internal path (must start with /api/bare/)
  let barePath = effectivePath + url.search;
  // Next.js strips trailing slash on /v1 etc.
  barePath = barePath.replace(/^(\/api\/bare\/v[123])(\?|$)/, "$1/$2");
  // Ensure we always have a trailing slash form for bare root
  if (barePath === "/api/bare") barePath = "/api/bare/";

  // Fast CORS preflight for harsh networks that do OPTIONS
  if (req.method === "OPTIONS") {
    // Let bare handle it, but also provide immediate CORS if bare doesn't
    // We'll fall through to bare routing which will set proper bare headers
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // Build a Node-like IncomingMessage (Readable) — keep streaming capability
  let fakeReq: Readable & { url: string; method?: string; headers: Record<string, string>; aborted?: boolean; socket?: unknown };
  const hasBody = !(req.method === "GET" || req.method === "HEAD");
  if (!hasBody) {
    fakeReq = Object.assign(new Readable({ read() { this.push(null); } }), {
      url: barePath,
      method: req.method,
      headers,
      aborted: false,
      socket: { remoteAddress: req.headers.get("x-forwarded-for") || "127.0.0.1" },
    });
    (fakeReq as Readable).push(null);
  } else {
    try {
      const buf = Buffer.from(await req.arrayBuffer());
      if (buf.length > 100 * 1024 * 1024) {
        return new Response(JSON.stringify({ code: "PAYLOAD_TOO_LARGE", message: "Body too large (100MB max)" }), {
          status: 413,
          headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "*" },
        });
      }
      fakeReq = Object.assign(Readable.from(buf.length ? [buf] : []), {
        url: barePath,
        method: req.method,
        headers,
        aborted: false,
        socket: { remoteAddress: req.headers.get("x-forwarded-for") || "127.0.0.1" },
      });
    } catch {
      fakeReq = Object.assign(new Readable({ read() { this.push(null); } }), {
        url: barePath,
        method: req.method,
        headers,
        aborted: false,
        socket: {},
      });
      (fakeReq as Readable).push(null);
    }
  }

  // Streaming response: create a ReadableStream for the client, pipe bare writes into it
  return new Promise<Response>((resolve) => {
    let status = 200;
    let statusText = "OK";
    const outHeaders: Record<string, string> = {};
    let settled = false;
    let responseResolved = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const pendingChunks: Uint8Array[] = [];

    const timer = setTimeout(() => finish(504, "Bare timeout (90s)"), 90000);

    // Create web stream that bare will write into
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        // Flush any chunks that arrived before start (rare)
        for (const c of pendingChunks) controller.enqueue(c);
        pendingChunks.length = 0;
      },
      cancel() {
        (fakeReq as unknown as { aborted: boolean }).aborted = true;
        finish(499, "Client closed");
      },
    });

    function ensureResponse() {
      if (responseResolved) return;
      responseResolved = true;
      outHeaders["access-control-allow-origin"] ??= "*";
      outHeaders["access-control-allow-headers"] ??= "*";
      outHeaders["access-control-expose-headers"] ??= "*";
      // Important: don't set content-length for streaming (let chunked)
      try {
        resolve(
          new Response(stream, {
            status,
            statusText: cleanText(statusText, 120),
            headers: outHeaders,
          }),
        );
      } catch {
        resolve(new Response(stream, { status, headers: outHeaders }));
      }
    }

    function finish(overrideStatus?: number, overrideText?: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (overrideStatus) status = overrideStatus;
      if (overrideText) statusText = overrideText;
      if (!responseResolved) {
        // Error path where writeHead was never called — return buffered error if any
        outHeaders["access-control-allow-origin"] ??= "*";
        outHeaders["access-control-allow-headers"] ??= "*";
        outHeaders["access-control-expose-headers"] ??= "*";
        if (streamController) {
          try { streamController.close(); } catch {}
        }
        try {
          resolve(
            new Response(pendingChunks.length ? Buffer.concat(pendingChunks) as unknown as BodyInit : null, {
              status,
              statusText: cleanText(statusText, 120),
              headers: outHeaders,
            }),
          );
        } catch {
          resolve(new Response(null, { status, headers: outHeaders }));
        }
      } else {
        // Response already streaming — just close the stream
        if (streamController) {
          try { streamController.close(); } catch {}
        }
      }
    }

    const fakeRes = new Writable({
      write(chunk: Buffer | string, _enc: string, cb: () => void) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
        const u8 = new Uint8Array(buf);
        if (streamController) {
          try { streamController.enqueue(u8); } catch {}
        } else {
          pendingChunks.push(u8);
        }
        cb();
      },
    }) as Writable & {
      writeHead: (...args: unknown[]) => void;
      end: (...args: unknown[]) => void;
    };

    fakeRes.writeHead = (st: unknown, stx?: unknown, hdr?: unknown) => {
      status = Number(st) || 200;
      let h: unknown = hdr;
      if (typeof stx === "string") statusText = stx;
      else if (stx && typeof stx === "object" && stx !== null) h = stx;
      if (h && typeof h === "object") {
        for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
          const lk = String(k).toLowerCase();
          const isBare = isBareHeader(lk);
          outHeaders[lk] = cleanHeaderValue(v, isBare);
        }
      }
      ensureResponse();
    };

    (fakeRes as unknown as { end: (chunk?: unknown, enc?: unknown, cb?: unknown) => void }).end = (chunk?: unknown, _enc?: unknown, cb?: unknown) => {
      if (chunk) {
        const buf = Buffer.isBuffer(chunk) ? (chunk as Buffer) : Buffer.from(chunk as Uint8Array);
        const u8 = new Uint8Array(buf);
        if (streamController) {
          try { streamController.enqueue(u8); } catch {}
        } else {
          pendingChunks.push(u8);
        }
      }
      if (typeof cb === "function") (cb as () => void)();
      // Ensure response is resolved even if writeHead was never called (e.g., bare health)
      if (!responseResolved) {
        // bare health may not call writeHead explicitly? It does, but fallback
        ensureResponse();
      }
      finish();
      return fakeRes as never;
    };

    fakeRes.on("finish", () => finish());
    fakeRes.on("error", (err) => {
      console.error("[bare] write error", err);
      if (!responseResolved) finish(502, "Bare write error");
      else {
        if (streamController) try { streamController.error(err); } catch {}
        clearTimeout(timer);
      }
    });

    (req as unknown as { signal?: AbortSignal }).signal?.addEventListener("abort", () => {
      (fakeReq as unknown as { aborted: boolean }).aborted = true;
      if (streamController) try { streamController.error(new Error("Client closed")); } catch {}
      finish(499, "Client closed");
    });

    try {
      const maybe = (bare as unknown as { routeRequest: (a: unknown, b: unknown) => unknown }).routeRequest(fakeReq, fakeRes);
      if (maybe && typeof (maybe as Promise<unknown>).catch === "function") {
        (maybe as Promise<void>).catch((e) => {
          console.error("[bare] route error", e);
          if (!responseResolved) finish(502, "Bare route failed");
          else if (streamController) try { streamController.error(e as Error); } catch {}
        });
      }
      // Safety: if bare never calls writeHead within 12s, ensure we still resolve for health checks
      setTimeout(() => {
        if (!responseResolved && !settled) {
          // For health path, bare should have responded by now, but if not, assume 200 empty
          // Don't finish yet, let main timer handle timeout
        }
      }, 12000);
    } catch (e) {
      console.error("[bare] sync error", e);
      finish(500, "Bare crash");
    }
  });
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
  handle as HEAD,
};
