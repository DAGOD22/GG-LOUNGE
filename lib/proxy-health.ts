import { lookup as nodeLookup } from 'node:dns/promises';
import { isPublicAddress } from '@/lib/network-target';

export const PROXY_HEALTH_TARGETS = {
  youtube: { label: 'YouTube', host: 'www.youtube.com', url: 'https://www.youtube.com/generate_204' },
  roblox: { label: 'Roblox', host: 'www.roblox.com', url: 'https://www.roblox.com/robots.txt' },
  tiktok: { label: 'TikTok', host: 'www.tiktok.com', url: 'https://www.tiktok.com/robots.txt' },
} as const;

export type ProxyHealthTarget = keyof typeof PROXY_HEALTH_TARGETS;
export type ProxyHealthCode =
  | 'DNS_ERROR' | 'PRIVATE_DNS_ANSWER' | 'TLS_ERROR' | 'TIMEOUT'
  | 'CONNECTION_RESET' | 'CONNECTION_REFUSED' | 'NETWORK_UNREACHABLE' | 'NETWORK_ERROR';
export type ProxyBackendCheck = {
  target: ProxyHealthTarget;
  dns: { outcome: 'resolved' | 'failed' | 'blocked'; addressCount?: number; durationMs: number; code?: ProxyHealthCode };
  http: { outcome: 'connected' | 'failed' | 'skipped'; status?: number; durationMs?: number; code?: ProxyHealthCode };
};

type Address = { address: string; family: number };
type HealthDependencies = {
  lookup?: (host: string) => Promise<Address[]>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

async function lookupPublicAddresses(host: string): Promise<Address[]> {
  return nodeLookup(host, { all: true, verbatim: true });
}

function safeNetworkCode(error: unknown): ProxyHealthCode {
  if (error && typeof error === 'object') {
    const value = error as { name?: unknown; code?: unknown; cause?: { code?: unknown } };
    const code = String(value.cause?.code ?? value.code ?? '');
    if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EBADNAME'].includes(code)) return 'DNS_ERROR';
    if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code)) return 'TLS_ERROR';
    if (['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code) || value.name === 'TimeoutError' || value.name === 'AbortError') return 'TIMEOUT';
    if (['ECONNRESET', 'UND_ERR_SOCKET'].includes(code)) return 'CONNECTION_RESET';
    if (code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
    if (['EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return 'NETWORK_UNREACHABLE';
  }
  return 'NETWORK_ERROR';
}

/**
 * Probe only fixed, public destination endpoints. No caller-supplied URL, cookie,
 * authorization header, response body, resolved address, or exception text is returned.
 * Any HTTP response (including 403/404) proves DNS+TLS+HTTP reached that host;
 * it does not imply the destination permits browsing or authentication.
 */
export async function checkProxyBackendTarget(target: string, dependencies: HealthDependencies = {}): Promise<ProxyBackendCheck> {
  if (!Object.hasOwn(PROXY_HEALTH_TARGETS, target)) throw new Error('Unknown proxy health target.');
  const id = target as ProxyHealthTarget;
  const config = PROXY_HEALTH_TARGETS[id];
  const lookup = dependencies.lookup ?? lookupPublicAddresses;
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? Date.now;
  const timeoutMs = dependencies.timeoutMs ?? 6000;

  const dnsStarted = now();
  let addresses: Address[];
  try {
    addresses = await lookup(config.host);
  } catch (error) {
    return {
      target: id,
      dns: { outcome: 'failed', durationMs: Math.max(0, now() - dnsStarted), code: safeNetworkCode(error) },
      http: { outcome: 'skipped' },
    };
  }
  if (!addresses.length) {
    return {
      target: id,
      dns: { outcome: 'failed', addressCount: 0, durationMs: Math.max(0, now() - dnsStarted), code: 'DNS_ERROR' },
      http: { outcome: 'skipped' },
    };
  }
  if (addresses.some(item => !isPublicAddress(item.address))) {
    return {
      target: id,
      dns: { outcome: 'blocked', addressCount: addresses.length, durationMs: Math.max(0, now() - dnsStarted), code: 'PRIVATE_DNS_ANSWER' },
      http: { outcome: 'skipped' },
    };
  }

  const httpStarted = now();
  try {
    const response = await fetcher(config.url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    try { await response.body?.cancel(); } catch { /* discard only the fixed, unauthenticated probe body */ }
    return {
      target: id,
      dns: { outcome: 'resolved', addressCount: addresses.length, durationMs: Math.max(0, httpStarted - dnsStarted) },
      http: { outcome: 'connected', status: response.status, durationMs: Math.max(0, now() - httpStarted) },
    };
  } catch (error) {
    return {
      target: id,
      dns: { outcome: 'resolved', addressCount: addresses.length, durationMs: Math.max(0, httpStarted - dnsStarted) },
      http: { outcome: 'failed', durationMs: Math.max(0, now() - httpStarted), code: safeNetworkCode(error) },
    };
  }
}
