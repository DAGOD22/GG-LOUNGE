import { Readable, Writable } from "node:stream";
import { createBareServer } from "@nebula-services/bare-server-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bare server (TOMPHTTP protocol) for the lounge proxy, using the same
 * @nebula-services/bare-server-node library Interstellar uses.
 * Adapts Next.js Web Request/Response to the Node req/res the library wants.
 * Plain HTTP tunneling works; websocket upgrades are not supported on this
 * route (Next.js route handlers can't upgrade), so realtime sites may break.
 */
const DIRECTORY = "/api/bare/";
const bare = createBareServer(DIRECTORY);

function cleanText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "").slice(0, 200) || "OK";
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let barePath = DIRECTORY + url.pathname.slice(DIRECTORY.length) + url.search;
  // Next.js strips trailing slashes (308) but bare routes are slash-terminated.
  barePath = barePath.replace(/^(\/api\/bare\/v[123])(\?|$)/, "$1/$2");

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Fake an IncomingMessage: a real Readable carrying the body bytes plus the
  // url/method/headers fields the bare library reads.
  let fakeReq: Readable & { url: string; method?: string; headers: Record<string, string> };
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    fakeReq = Object.assign(new Readable({ read() {} }), {
      url: barePath,
      method: req.method,
      headers,
    });
  } else {
    const buf = Buffer.from(await req.arrayBuffer());
    fakeReq = Object.assign(Readable.from([buf]), {
      url: barePath,
      method: req.method,
      headers,
    });
  }

  return new Promise<Response>((resolve) => {
    let status = 200;
    let statusText = "OK";
    const outHeaders: Record<string, string> = {};
    const chunks: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(finish, 30000);
    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        resolve(
          new Response(Buffer.concat(chunks), {
            status,
            statusText: cleanText(statusText),
            headers: outHeaders,
          }),
        );
      } catch {
        resolve(new Response(Buffer.concat(chunks), { status, headers: outHeaders }));
      }
    }

    const fakeRes = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
        cb();
      },
    }) as Writable & { writeHead: (...args: unknown[]) => void };
    fakeRes.writeHead = (st: unknown, stx?: unknown, hdr?: unknown) => {
      status = Number(st) || 200;
      let h: unknown = hdr;
      if (typeof stx === "string") statusText = stx;
      else if (stx && typeof stx === "object") h = stx;
      if (h && typeof h === "object") {
        for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
          if (v !== undefined && v !== null) outHeaders[String(k).toLowerCase()] = cleanText(String(v));
        }
      }
    };
    fakeRes.on("finish", finish);
    fakeRes.on("error", finish);

    try {
      const maybe = (bare as unknown as { routeRequest: (a: unknown, b: unknown) => Promise<void> }).routeRequest(
        fakeReq,
        fakeRes,
      );
      if (maybe && typeof maybe.catch === "function") maybe.catch(() => finish());
    } catch {
      finish();
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
