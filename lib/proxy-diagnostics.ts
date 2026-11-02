'use client';

export type ProxyDiagnosticOutcome = 'started' | 'ok' | 'failed' | 'timeout' | 'blocked' | 'degraded';
export type ProxyDiagnosticTransport = 'scramjet' | 'wisp' | 'http';
export type ProxyDiagnosticSource = 'client' | 'service-worker';

export type ProxyDiagnosticDetails = {
  source?: ProxyDiagnosticSource;
  outcome?: ProxyDiagnosticOutcome;
  transport?: ProxyDiagnosticTransport;
  status?: number;
  durationMs?: number;
  code?: string;
  method?: string;
  requestType?: string;
  requestId?: number;
};

const STORAGE_KEY = 'ggl-proxy-diagnostics';
const SAFE_ERROR_CODES = new Set([
  'Error', 'TypeError', 'NetworkError', 'AbortError', 'TimeoutError', 'SecurityError',
  'SyntaxError', 'InvalidStateError', 'NotSupportedError', 'URIError',
]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const SAFE_REQUEST_TYPES = new Set([
  'document', 'iframe', 'script', 'style', 'image', 'font', 'audio', 'video', 'track',
  'worker', 'sharedworker', 'empty', 'fetch', 'other',
]);

/** Diagnostics are automatic in development and opt-in on production deployments. */
export function resolveProxyDiagnosticsEnabled(production: boolean, search: string, stored: string | null): boolean {
  return !production || new URLSearchParams(search).get('proxyDebug') === '1' || stored === '1';
}

export function proxyDiagnosticsEnabled(): boolean {
  const production = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  if (!production) return true;
  if (typeof window === 'undefined') return false;
  try {
    return resolveProxyDiagnosticsEnabled(production, window.location.search, window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return resolveProxyDiagnosticsEnabled(production, window.location.search, null);
  }
}

/** Reduce arbitrary exceptions to a short class name; never expose message/stack/URL. */
export function safeProxyErrorCode(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : 'Error';
  return SAFE_ERROR_CODES.has(name) ? name : 'Error';
}

/** Build a privacy-safe record. URLs, query strings, headers, bodies and messages are never copied. */
export function createProxyDiagnosticRecord(
  stage: string,
  details: ProxyDiagnosticDetails = {},
): Record<string, string | number> {
  const safeStage = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/i.test(stage) ? stage.slice(0, 64) : 'proxy.event';
  const record: Record<string, string | number> = {
    source: details.source === 'service-worker' ? 'service-worker' : 'client',
    stage: safeStage,
  };

  if (details.outcome && ['started', 'ok', 'failed', 'timeout', 'blocked', 'degraded'].includes(details.outcome)) record.outcome = details.outcome;
  if (details.transport && ['scramjet', 'wisp', 'http'].includes(details.transport)) record.transport = details.transport;
  if (Number.isInteger(details.status) && details.status! >= 0 && details.status! <= 599) record.status = details.status!;
  if (Number.isFinite(details.durationMs)) record.durationMs = Math.max(0, Math.min(600_000, Math.round(details.durationMs!)));
  if (details.code && SAFE_ERROR_CODES.has(details.code)) record.code = details.code;
  if (details.method && SAFE_METHODS.has(details.method.toUpperCase())) record.method = details.method.toUpperCase();
  if (details.requestType && SAFE_REQUEST_TYPES.has(details.requestType)) record.requestType = details.requestType;
  if (Number.isInteger(details.requestId) && details.requestId! >= 0) record.requestId = details.requestId!;
  return record;
}

export function proxyDiagnostic(stage: string, details: ProxyDiagnosticDetails = {}): void {
  if (!proxyDiagnosticsEnabled() || typeof console === 'undefined') return;
  console.info('[GG-Lounge proxy]', createProxyDiagnosticRecord(stage, details));
}

export function setProxyWorkerDiagnostics(
  worker: ServiceWorker | null | undefined,
  enabled = proxyDiagnosticsEnabled(),
  transport?: ProxyDiagnosticTransport,
): void {
  worker?.postMessage({ ggLounge: 'diagnostics', enabled, transport });
}
