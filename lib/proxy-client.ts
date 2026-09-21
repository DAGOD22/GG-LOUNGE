'use client';
import type { ScramjetController, ScramjetFrame } from '@mercuryworkshop/scramjet';
import type { BareMuxConnection } from '@mercuryworkshop/bare-mux';

type RuntimeWindow = Window & {
  $scramjetLoadController: () => { ScramjetController: new (config: object) => ScramjetController };
  BareMux: { BareMuxConnection: new (worker: string) => BareMuxConnection };
};
export type ProxyRuntime = { controller: ScramjetController; transport: 'wisp' | 'http'; notice: string };
const scripts = new Map<string, Promise<void>>();
let bootPromise: Promise<ProxyRuntime> | undefined;

function loadScript(src: string): Promise<void> {
  if (scripts.has(src)) return scripts.get(src)!;
  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); scripts.delete(src); reject(new Error(`Could not load ${src}. Reload to retry.`)); };
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
    const mux = new win.BareMux.BareMuxConnection('/proxy-runtime/baremux/worker.js');
    const response = await fetch('/api/proxy/config', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Could not load proxy configuration.');
    const config: { wisp: string | null } = await response.json();
    const transport: 'wisp' | 'http' = config.wisp ? 'wisp' : 'http';
    if (config.wisp) {
      const wisp = new URL(config.wisp, location.href);
      if (wisp.protocol === 'https:') wisp.protocol = 'wss:';
      if (wisp.protocol === 'http:') wisp.protocol = 'ws:';
      if (location.protocol === 'https:' && wisp.protocol !== 'wss:') throw new Error('Wisp must use secure WebSockets (wss://) on HTTPS.');
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(wisp.href);
        const timer = setTimeout(() => { socket.close(); reject(new Error('The Wisp backend is unreachable. Check WISP_URL and its allowed origins.')); }, 7000);
        socket.onopen = () => { clearTimeout(timer); socket.close(); resolve(); };
        socket.onerror = () => { clearTimeout(timer); socket.close(); reject(new Error('Wisp connection failed. The server or this network rejected the connection.')); };
      });
      await mux.setTransport('/proxy-runtime/libcurl/index.mjs', [{ wisp: wisp.href }]);
    } else {
      const health = await fetch('/api/bare/', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const manifest = await health.json().catch(() => null);
      if (!health.ok || !Array.isArray(manifest?.versions) || !manifest.versions.includes('v3')) throw new Error('The lounge HTTP proxy is unavailable.');
      await mux.setTransport('/proxy-runtime/bare/index.mjs', [new URL('/api/bare/', location.href).href]);
    }
    const registration = await navigator.serviceWorker.register('/proxy/sw.js', { scope: '/browse/', updateViaCache: 'none' });
    await waitForActivation(registration);
    return { controller, transport, notice: transport === 'wisp'
      ? 'Scramjet · Wisp connected. Destination and network restrictions still apply.'
      : 'Scramjet · HTTP only. Configure WISP_URL for WebSockets, streaming and cloud apps.' };
  })().catch(error => { bootPromise = undefined; throw error; });
  return bootPromise!;
}
export type { ScramjetFrame };
