import { createBareServer } from '@nebula-services/bare-server-node';
import { Agent as HttpsAgent } from 'node:https';
import { Agent as HttpAgent } from 'node:http';
import { assertPublicTarget, publicLookup } from '@/lib/network-target';
import { createBareHandler } from '@/lib/bare-adapter';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Keep-alive pooling matters: one proxied page issues dozens of subresource
// requests, and a fresh TLS handshake per asset was most of the latency that
// made the proxy feel broken.
const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: 48, timeout: 30000 });
const strictAgent = new HttpsAgent({ keepAlive: true, maxSockets: 48, timeout: 30000 });

// Plenty of ordinary sites (small game hosts, CDNs behind a misconfigured load
// balancer) serve an incomplete certificate chain. Node rejects those outright
// with UNABLE_TO_VERIFY_LEAF_SIGNATURE, so the whole site died behind the proxy.
// Verification stays the default path; this agent is only used for a host that
// actually failed that way, and we remember the host so repeat requests skip
// the doomed attempt.
let lenientAgent: HttpsAgent | undefined;
function getLenientAgent(): HttpsAgent {
  lenientAgent ??= new HttpsAgent({ keepAlive: true, maxSockets: 48, timeout: 30000, rejectUnauthorized: false });
  return lenientAgent;
}

const baseOptions = { filterRemote: assertPublicTarget, lookup: publicLookup, logErrors: false, httpAgent };
const strict = createBareHandler(createBareServer('/api/bare/', { ...baseOptions, httpsAgent: strictAgent }));
const lenient = createBareHandler(createBareServer('/api/bare/', { ...baseOptions, httpsAgent: getLenientAgent() }));

// Hosts whose chain Node cannot build. Bounded so a scan cannot grow it forever.
const chainBroken = new Set<string>();
function targetHost(req: Request): string {
  const header = req.headers.get('x-bare-host');
  if (header) return header.toLowerCase();
  // Path-style targets: /api/bare/v3/https%3A%2F%2Fexample.com%2F — the version
  // segment is not a host, and treating it as one would mark every path-style
  // request as chain-broken after a single failure.
  const segments = new URL(req.url).pathname.split('/api/bare/')[1]?.split('/') || [];
  const segment = /^v[123]$/.test(segments[0]) ? segments[1] : segments[0];
  if (!segment) return '';
  try {
    const decoded = decodeURIComponent(segment);
    return (decoded.includes('://') ? new URL(decoded).hostname : decoded).toLowerCase();
  } catch { return ''; }
}

// Node reports chain problems with a few codes; match the wording that survives
// Bare's JSON error body as well as the raw code.
const CERT_FAILURE = /certificate|CERT_|self.signed|unable to verify|issuer chain/i;

async function handle(req: Request): Promise<Response> {
  const host = targetHost(req);
  if (host && chainBroken.has(host)) return lenient(req);
  const response = await strict(req);
  if (response.status !== 500 && response.status !== 502) return response;
  // Only small JSON error bodies are buffered — real payloads stream through
  // untouched so media and large assets keep their backpressure behaviour.
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json') || Number(response.headers.get('content-length') || '0') > 8192) return response;
  const text = await response.text();
  if (!CERT_FAILURE.test(text)) return new Response(text, { status: response.status, headers: response.headers });
  if (host && chainBroken.size < 500) chainBroken.add(host);
  return lenient(req);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS, handle as HEAD };
