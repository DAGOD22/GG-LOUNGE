import { Readable, Writable } from "node:stream";
import { createBareServer } from "@nebula-services/bare-server-node";

export const runtime = "nodejs";
/** Vercel Hobby caps functions at 60s; asking for more fails the build. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Bare server (TOMPHTTP) for the lounge proxy.
 *
 * Next.js route handlers hand us a Web `Request`/`Response` while the bare
 * library wants Node's `req`/`res`, so this file is the adapter. It used to
 * buffer the whole upstream response and resolve after a 30s timer, which made
 * big pages, video embeds and any long-lived request look "broken". It now
 * streams: the Response is returned the moment headers arrive and body bytes
 * are pushed through as the upstream sends them.
 *
 * Websocket upgrades still cannot work here (route handlers can't upgrade), so
 * realtime sites fall back to their HTTP transports.
 */
const DIRECTORY = "/api/bare/";
const bare = createBareServer(DIRECTORY);

/** Header values must survive verbatim: truncating a long `location` or
 *  dropping `set-cookie` is what quietly broke redirects and logins. */
function safeHeader(value: string): string {
  // Only strip characters that are illegal in a header; keep the rest as-is.
  return value.replace(/[\u0000-\u0008\u000a-\u001f\u007f]/g, "");
}

function bodyFor(req: Request): Promise<Readable | null> {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return Promise.resolve(null);
  return req
    .arrayBuffer()
    .then((buf) => (buf.byteLength ? Readable.from([Buffer.from(buf)]) : Readable.from([])))
    .catch(() => Readable.from([]));
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
  // The library reads `host`/`x-forwarded-for` off the request for logging and
  // for building its own URLs; keep whatever the client sent, plus the real host.
  if (!headers.host) headers.host = url.host;

  const body = await bodyFor(req);
  const fakeReq = Object.assign(body ?? Readable.from([]), {
    url: barePath,
    method: req.method,
    headers,
    httpVersion: "1.1",
    socket: { remoteAddress: headers["x-forwarded-for"]?.split(",")[0]?.trim() || "127.0.0.1" },
  }) as Readable & { url: string; method?: string; headers: Record<string, string> };

  // Stream the upstream response out through a ReadableStream as it arrives.
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });

  let status = 200;
  let statusText = "OK";
  const outHeaders = new Headers();
  let headSent = false;
  let resolveResponse: ((r: Response) => void) | null = null;
  const responseReady = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  function sendHead() {
    if (headSent) return;
    headSent = true;
    resolveResponse?.(
      new Response(stream, {
        status,
        statusText: statusText || "OK",
        headers: outHeaders,
      }),
    );
  }

  function close(err?: unknown) {
    if (!headSent) sendHead();
    try {
      if (err) streamController?.error(err instanceof Error ? err : new Error("bare stream failed"));
      else streamController?.close();
    } catch {
      /* already closed */
    }
  }

  const fakeRes = new Writable({
    write(chunk, _enc, cb) {
      // Ensure the Response exists before the first byte is pushed.
      sendHead();
      try {
        streamController?.enqueue(Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : new Uint8Array(chunk as Uint8Array));
      } catch {
        /* client went away */
      }
      cb();
    },
    final(cb) {
      close();
      cb();
    },
  }) as Writable & {
    writeHead: (...args: unknown[]) => Writable;
    setHeader: (k: string, v: unknown) => void;
    getHeader: (k: string) => unknown;
    headersSent: boolean;
    statusCode: number;
    statusMessage: string;
    flushHeaders: () => void;
    removeHeader: (k: string) => void;
  };

  const resHeaders = new Map<string, string>();
  fakeRes.statusCode = 200;
  fakeRes.statusMessage = "OK";
  fakeRes.headersSent = false;
  fakeRes.setHeader = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    resHeaders.set(String(key).toLowerCase(), safeHeader(Array.isArray(value) ? value.join(", ") : String(value)));
  };
  fakeRes.getHeader = (key: string) => resHeaders.get(String(key).toLowerCase());
  fakeRes.removeHeader = (key: string) => {
    resHeaders.delete(String(key).toLowerCase());
  };
  fakeRes.flushHeaders = () => {
    for (const [k, v] of resHeaders) outHeaders.set(k, v);
    sendHead();
  };
  fakeRes.writeHead = ((...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "number") status = first;
    const maybeText = args[1];
    if (typeof maybeText === "string") statusText = maybeText;
    const raw = args[1] ?? args[2];
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (v === undefined || v === null) continue;
        resHeaders.set(k.toLowerCase(), safeHeader(Array.isArray(v) ? v.join(", ") : String(v)));
      }
    }
    for (const [k, v] of resHeaders) outHeaders.set(k, v);
    fakeRes.headersSent = true;
    sendHead();
    return fakeRes;
  }) as never;

  fakeRes.on("finish", () => close());
  fakeRes.on("error", (err: unknown) => close(err));

  try {
    const maybe = (bare as unknown as { routeRequest: (a: unknown, b: unknown) => Promise<void> }).routeRequest(
      fakeReq,
      fakeRes,
    );
    if (maybe && typeof maybe.catch === "function") maybe.catch((err: unknown) => close(err));
  } catch (err) {
    close(err);
  }

  // If the library never answers (a hung upstream), still return *something* so
  // the proxy UI can report it instead of spinning forever.
  const guard = new Promise<Response>((resolve) =>
    setTimeout(() => {
      if (!headSent) {
        status = 504;
        outHeaders.set("content-type", "application/json");
        resolve(
          new Response(
            JSON.stringify({ error: "Bare request timed out", detail: "The target site did not answer in time." }),
            { status: 504, headers: { "content-type": "application/json" } },
          ),
        );
      }
    }, 120000),
  );
  return Promise.race([responseReady, guard]);
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
