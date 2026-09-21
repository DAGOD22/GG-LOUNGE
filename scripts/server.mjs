// Optional Node hosting mode. Vercel functions cannot accept WebSocket upgrades.
import { createServer } from 'node:http';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
const dev = process.argv.includes('--dev');
const wispOnly = process.argv.includes('--wisp-only');
const port = Number(process.env.PORT || (wispOnly ? 3001 : 3000));
process.env.GG_LOCAL_WISP ??= '1';
Object.assign(wisp.options, {
  allow_private_ips: false, allow_loopback_ips: false, allow_direct_ip: false,
  allow_udp_streams: false, port_whitelist: [80, 443],
  stream_limit_total: 64, stream_limit_per_host: 16, dns_result_order: 'ipv4first',
});
let handle;
let upgrade;
if (!wispOnly) {
  const { default: next } = await import('next');
  const app = next({ dev, hostname: '0.0.0.0', port });
  await app.prepare();
  handle = app.getRequestHandler();
  upgrade = app.getUpgradeHandler();
}
const allowed = new Set((process.env.WISP_ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean));
const connections = new Map();
const server = createServer({ maxHeaderSize: 64 * 1024 }, (req, res) => {
  if (wispOnly) { res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ service: 'GG-Lounge Wisp' })); }
  else handle(req, res);
});
server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url, 'http://internal.invalid').pathname;
  if (path !== '/wisp/' && path !== '/wisp') {
    if (upgrade) upgrade(req, socket, head); else socket.destroy();
    return;
  }
  let sameOrigin = false;
  try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch {}
  if (!sameOrigin && !allowed.has(req.headers.origin)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const ip = socket.remoteAddress;
  const count = connections.get(ip) || 0;
  if (count >= 20) { socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return; }
  connections.set(ip, count + 1);
  socket.once('close', () => { const n = (connections.get(ip) || 1) - 1; n ? connections.set(ip, n) : connections.delete(ip); });
  wisp.routeRequest(req, socket, head);
});
server.listen(port, '0.0.0.0', () => console.log(`GG-Lounge ${wispOnly ? 'Wisp backend' : 'website + Wisp'} listening on 0.0.0.0:${port}`));
