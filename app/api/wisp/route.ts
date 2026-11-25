/**
 * Wisp WebSocket relay.
 *
 * Ultraviolet proxies HTTP through the Bare relay, but every multiplayer site
 * (CrazyGames, Poki, now.gg, the .io titles) also opens raw WebSockets. Without
 * a relay those sockets cannot be upgraded, the client retries forever, and the
 * page shows "no internet" even though its HTML loaded fine.
 *
 * This route hands the upgrade to wisp-js. It only works under a Node host that
 * exposes `/api/wisp`, which is what `scripts/server.mjs` does; on a serverless
 * platform the upgrade never arrives and the client stays on the HTTP path.
 */
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  Object.assign(wisp.options, {
    allow_private_ips: false,
    allow_loopback_ips: false,
    allow_direct_ip: false,
    allow_udp_streams: false,
    port_whitelist: [80, 443],
    stream_limit_total: 64,
    stream_limit_per_host: 16,
    dns_result_order: "ipv4first",
  });
}

export async function GET() {
  configure();
  return Response.json(
    { service: "GG-Lounge Wisp", transport: "websocket", path: "/api/wisp" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST() {
  return GET();
}
