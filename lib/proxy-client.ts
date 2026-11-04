'use client';
import type { ScramjetController, ScramjetFrame } from '@mercuryworkshop/scramjet';
import type { BareMuxConnection } from '@mercuryworkshop/bare-mux';
import {
  proxyDiagnostic,
  proxyDiagnosticsEnabled,
  safeProxyErrorCode,
  setProxyWorkerDiagnostics,
} from '@/lib/proxy-diagnostics';

type RuntimeWindow = Window & {
  $scramjetLoadController: () => { ScramjetController: new (config: object) => ScramjetController };
  BareMux: { BareMuxConnection: new (worker: string) => BareMuxConnection };
};
export type WispStatus = 'connected' | 'not-configured' | 'failed';
export type ProxyTransportSelection = { transport: 'wisp' | 'http'; notice: string; wispStatus: WispStatus };
export type ProxyRuntime = ProxyTransportSelection & { controller: ScramjetController; serviceWorker: ServiceWorker };
const scripts = new Map<string, Promise<void>>();
let bootPromise: Promise<ProxyRuntime> | undefined;

type ProxyMux = Pick<BareMuxConnection, 'setTransport'>;
type TransportDependencies = {
  fetcher?: typeof fetch;
  probeWisp?: (endpoint: string) => Promise<void>;
};

function loadScript(src: string): Promise<void> {
  if (scripts.has(src)) return scripts.get(src)!;
  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => {
      proxyDiagnostic('runtime.asset.failed', { outcome: 'failed', code: 'NetworkError' });
      script.remove();
      scripts.delete(src);
      reject(new Error('A required self-hosted proxy runtime asset could not be loaded. Reload to retry.'));
    };
    document.head.appendChild(script);
  });
  scripts.set(src, pending);
  return pending;
}

export function normalizeProxyUrl(input: string): string {
  let value = input.trim();
  if (!value) throw new Error('Enter a website address or search.');
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) throw new Error('Only HTTP and HTTPS websites are supported.');
  if (!/^https?:\/\//i.test(value)) {
    value = !/\s/.test(value) && value.includes('.') ? `https://${value}` : `https://www.bing.com/search?q=${encodeURIComponent(value)}`;
  }
  const url = new URL(value);
  if (url.username || url.password) throw new Error('Addresses containing credentials are not supported.');
  return url.href;
}

/** Convert configured local endpoints to WS(S) and enforce the Wisp path convention. */
export function normalizeWispUrl(configured: string, baseUrl: string): URL {
  const endpoint = new URL(configured, baseUrl);
  if (endpoint.protocol === 'https:') endpoint.protocol = 'wss:';
  if (endpoint.protocol === 'http:') endpoint.protocol = 'ws:';
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('Wisp must be a WebSocket endpoint without URL credentials or a fragment.');
  }
  if (new URL(baseUrl).protocol === 'https:' && endpoint.protocol !== 'wss:') {
    throw new Error('Wisp must use secure WebSockets (wss://) on HTTPS.');
  }
  if (!endpoint.pathname.endsWith('/')) endpoint.pathname += '/';
  return endpoint;
}

async function probeWispEndpoint(endpoint: string, timeoutMs = 7000): Promise<void> {
  // A plain WebSocket upgrade only proves that *something* accepted the socket.
  // Use the existing Wisp client to complete its protocol handshake before
  // choosing the transport; this remains a readiness check, not an outbound-site test.
  const { ClientConnection } = await import('@mercuryworkshop/wisp-js/client');
  await new Promise<void>((resolve, reject) => {
    let connection: InstanceType<typeof ClientConnection> | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { connection?.close(); } catch { /* already closed */ }
      error ? reject(error) : resolve();
    };
    try {
      connection = new ClientConnection(endpoint);
    } catch {
      finish(new Error('Could not start the Wisp protocol handshake.'));
      return;
    }
    connection.onopen = () => finish();
    connection.onerror = () => finish(new Error('The Wisp protocol handshake failed.'));
    connection.onclose = () => finish(new Error('The Wisp connection closed before its handshake completed.'));
    timer = setTimeout(() => finish(new Error('The Wisp protocol handshake timed out.')), timeoutMs);
  });
}

/**
 * Select Wisp when its real protocol handshake succeeds; otherwise try the
 * existing same-origin Bare HTTP transport. This keeps page/search requests
 * usable on networks that block WebSockets, while clearly reporting limitations.
 */
export async function selectProxyTransport(
  mux: ProxyMux,
  config: { wisp?: string | null },
  baseUrl: string,
  dependencies: TransportDependencies = {},
): Promise<ProxyTransportSelection> {
  const fetcher = dependencies.fetcher ?? fetch;
  const configuredWisp = typeof config.wisp === 'string' ? config.wisp.trim() : '';
  let wispFailed = false;

  if (configuredWisp) {
    const started = Date.now();
    proxyDiagnostic('transport.wisp.probe', { transport: 'wisp', outcome: 'started' });
    try {
      const endpoint = normalizeWispUrl(configuredWisp, baseUrl);
      await (dependencies.probeWisp ?? probeWispEndpoint)(endpoint.href);
      proxyDiagnostic('transport.wisp.handshake', {
        transport: 'wisp', outcome: 'ok', durationMs: Date.now() - started,
      });
      await mux.setTransport('/proxy-runtime/libcurl/index.mjs', [{ wisp: endpoint.href }]);
      proxyDiagnostic('transport.wisp.selected', { transport: 'wisp', outcome: 'ok' });
      return {
        transport: 'wisp',
        notice: 'Scramjet · Wisp handshake completed. Destination and network restrictions still apply.',
        wispStatus: 'connected',
      };
    } catch (error) {
      wispFailed = true;
      proxyDiagnostic('transport.wisp.failed', {
        transport: 'wisp', outcome: 'failed', code: safeProxyErrorCode(error), durationMs: Date.now() - started,
      });
    }
  }

  const healthUrl = new URL('/api/bare/', baseUrl);
  const healthStarted = Date.now();
  let health: Response;
  try {
    health = await fetcher(healthUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  } catch {
    proxyDiagnostic('transport.http.health', {
      transport: 'http', outcome: 'failed', code: 'NetworkError', durationMs: Date.now() - healthStarted,
    });
    throw new Error('The lounge HTTP proxy could not be reached.');
  }
  if (!health.ok) {
    proxyDiagnostic('transport.http.health', {
      transport: 'http', outcome: 'failed', status: health.status, durationMs: Date.now() - healthStarted,
    });
    throw new Error(`The lounge HTTP proxy is unavailable (HTTP ${health.status}).`);
  }
  const manifest = await health.json().catch(() => null);
  if (!Array.isArray(manifest?.versions) || !manifest.versions.includes('v3')) {
    proxyDiagnostic('transport.http.health', {
      transport: 'http', outcome: 'failed', status: health.status, code: 'SyntaxError', durationMs: Date.now() - healthStarted,
    });
    throw new Error('The lounge HTTP proxy did not advertise Bare v3.');
  }

  await mux.setTransport('/proxy-runtime/bare/index.mjs', [healthUrl.href]);
  proxyDiagnostic('transport.http.selected', {
    transport: 'http', outcome: wispFailed ? 'degraded' : 'ok', status: health.status, durationMs: Date.now() - healthStarted,
  });
  return {
    transport: 'http',
    wispStatus: configuredWisp ? 'failed' : 'not-configured',
    notice: wispFailed
      ? 'Scramjet · HTTP fallback. Wisp handshake failed; ordinary requests still depend on backend outbound access. WebSockets and realtime apps are unavailable.'
      : 'Scramjet · HTTP only. Destination access is not yet verified; configure a real WISP_URL for WebSockets and realtime apps.',
  };
}

// navigator.serviceWorker.ready can resolve for an unrelated worker, or wait
// forever when /proxy is outside /browse/. Wait for THIS registration instead.
export function waitForActivation(reg: ServiceWorkerRegistration, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = reg.installing || reg.waiting || reg.active;
    if (!worker) return reject(new Error('Proxy worker was not installed.'));
    const finish = (error?: Error) => {
      clearTimeout(timer); worker.removeEventListener('statechange', check);
      error ? reject(error) : resolve();
    };
    const check = () => {
      if (worker.state === 'activated') finish();
      else if (worker.state === 'redundant') finish(new Error('Proxy worker installation failed. Reload to retry.'));
    };
    const timer = setTimeout(() => finish(new Error('Proxy worker activation timed out.')), timeoutMs);
    worker.addEventListener('statechange', check);
    check();
  });
}

export function bootProxy(): Promise<ProxyRuntime> {
  if (bootPromise) return bootPromise;
  proxyDiagnostic('boot.started', { transport: 'scramjet', outcome: 'started' });
  bootPromise = (async (): Promise<ProxyRuntime> => {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('The proxy needs HTTPS and service workers enabled in your browser.');
    if (!('SharedWorker' in window)) throw new Error('This browser does not support the shared worker required by this proxy. Try a current desktop browser.');

    // Remove ONLY obsolete lounge UV registrations; leave unrelated app workers alone.
    const old = await navigator.serviceWorker.getRegistrations();
    await Promise.all(old.filter(reg => /\/(?:uv\/)?uv\.sw\.js$/.test(new URL((reg.active || reg.waiting || reg.installing)?.scriptURL || location.href).pathname)).map(reg => reg.unregister()));

    await Promise.all([loadScript('/proxy-runtime/baremux/index.js'), loadScript('/proxy-runtime/scramjet/scramjet.all.js')]);
    const win = window as unknown as RuntimeWindow;
    const { ScramjetController: Controller } = win.$scramjetLoadController();
    const controller = new Controller({ prefix: '/browse/', files: {
      wasm: '/proxy-runtime/scramjet/scramjet.wasm.wasm', all: '/proxy-runtime/scramjet/scramjet.all.js', sync: '/proxy-runtime/scramjet/scramjet.sync.js',
    }});
    await controller.init();
    proxyDiagnostic('scramjet.initialized', { transport: 'scramjet', outcome: 'ok' });

    const mux = new win.BareMux.BareMuxConnection('/proxy-runtime/baremux/worker.js');
    let configResponse: Response;
    const configStarted = Date.now();
    try {
      configResponse = await fetch('/api/proxy/config', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    } catch {
      proxyDiagnostic('config.failed', { outcome: 'failed', code: 'NetworkError', durationMs: Date.now() - configStarted });
      throw new Error('The proxy configuration request could not reach the lounge server.');
    }
    proxyDiagnostic('config.response', {
      outcome: configResponse.ok ? 'ok' : 'failed', status: configResponse.status, durationMs: Date.now() - configStarted,
    });
    if (!configResponse.ok) throw new Error(`Could not load proxy configuration (HTTP ${configResponse.status}).`);
    const config = await configResponse.json().catch(() => null) as { wisp?: string | null } | null;
    if (!config || (config.wisp !== undefined && config.wisp !== null && typeof config.wisp !== 'string')) {
      throw new Error('The proxy configuration response was invalid.');
    }

    const selected = await selectProxyTransport(mux, config, location.href);
    const registration = await navigator.serviceWorker.register('/proxy/sw.js', { scope: '/browse/', updateViaCache: 'none' });
    await waitForActivation(registration);
    const worker = registration.active || registration.waiting || registration.installing;
    if (!worker) throw new Error('The proxy service worker is not available after activation.');
    setProxyWorkerDiagnostics(worker, proxyDiagnosticsEnabled(), selected.transport);
    proxyDiagnostic('service-worker.activated', { transport: 'scramjet', outcome: 'ok' });
    return { controller, ...selected, serviceWorker: worker };
  })().catch(error => {
    proxyDiagnostic('boot.failed', { transport: 'scramjet', outcome: 'failed', code: safeProxyErrorCode(error) });
    bootPromise = undefined;
    throw error;
  });
  return bootPromise!;
}
export type { ScramjetFrame };
