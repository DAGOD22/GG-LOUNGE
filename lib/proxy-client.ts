'use client';
/**
 * Proxy runtime for the lounge.
 *
 * Engine: Ultraviolet. Its service worker reads `self.__uv$config`, which is
 * generated per-request by /uv/uv.config.js — so the worker and the page always
 * agree on the URL prefix and encoders. (The previous Scramjet setup passed its
 * config to the worker with a postMessage during init(), which raced on cold
 * loads and left the worker throwing "reading 'prefix'" on every request.)
 */
export type ProxyRuntime = {
  prefix: string;
  /** Build a proxied URL for a real destination. */
  encode: (url: string) => string;
  /** Recover the real destination from a proxied URL or frame href. */
  decode: (value: string) => string | null;
  transport: 'bare';
  notice: string;
};
export type ScramjetFrame = {
  go: (url: string) => void;
  back: () => void;
  forward: () => void;
  addEventListener: (type: 'urlchange', listener: (event: { url: string }) => void) => void;
};

const PREFIX = '/service/';
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

/**
 * navigator.serviceWorker.ready can resolve for an unrelated worker, or wait
 * forever when the page is outside the worker's scope. Wait for THIS
 * registration instead.
 */
export function waitForActivation(reg: ServiceWorkerRegistration, timeoutMs = 15000): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const worker = reg.installing || reg.waiting || reg.active;
    if (!worker) return reject(new Error('Proxy worker was not installed.'));
    const finish = (error?: Error) => {
      clearTimeout(timer); worker.removeEventListener('statechange', check);
      error ? reject(error) : resolve(reg);
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

/**
 * Register the proxy worker at origin scope and resolve once it is actually
 * controlling this page. Ultraviolet only intercepts requests for documents it
 * controls, so navigating before control is established yields a 404.
 */
export async function ensureProxyWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await waitForActivation(
    await navigator.serviceWorker.register('/uv/uv.sw.js', { scope: '/', updateViaCache: 'none' }),
  );
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>(resolve => {
      const done = () => resolve();
      navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
      setTimeout(done, 5000);
    });
  }
  for (let attempt = 0; attempt < 40 && !navigator.serviceWorker.controller; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!navigator.serviceWorker.controller) throw new Error('The proxy worker could not take control of this page. Reload and try again.');
  return registration;
}

export function bootProxy(): Promise<ProxyRuntime> {
  if (bootPromise) return bootPromise;
  bootPromise = (async (): Promise<ProxyRuntime> => {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('The proxy needs HTTPS and service workers enabled in your browser.');
    // Only one engine may own the scope; drop the old Scramjet workers.
    const existing = await navigator.serviceWorker.getRegistrations();
    await Promise.all(existing.filter(reg => {
      const scriptPath = new URL((reg.active || reg.waiting || reg.installing)?.scriptURL || location.href).pathname;
      return scriptPath === '/gg-sw.js' || scriptPath === '/proxy/sw.js' || /\/(?:uv\/)?uv\.sw\.js$/.test(scriptPath);
    }).map(reg => reg.unregister()));

    await ensureProxyWorker();
    // The bundle provides the global `Ultraviolet` object (its codecs).
    await loadScript('/uv/uv.bundle.js');
    const win = window as unknown as { Ultraviolet?: { codec: { xor: { encode: (v: string) => string; decode: (v: string) => string } } } };
    const codec = win.Ultraviolet?.codec?.xor;
    if (!codec) throw new Error('The proxy runtime failed to load. Reload and try again.');

    // HTTP-only transport. There is deliberately no Wisp/WebSocket path: the
    // in-app Bare relay handles every request, so a missing Wisp server can no
    // longer leave proxied pages stuck on a blank screen.
    const transport: 'bare' = 'bare';
    const notice = 'Connected through the lounge proxy.';

    return {
      prefix: PREFIX,
      encode: (url: string) => `${location.origin}${PREFIX}${codec.encode(url)}`,
      decode: (value: string) => {
        const marker = `${location.origin}${PREFIX}`;
        if (!value.startsWith(marker)) return null;
        const cookieMatch = value.match(/[?&]__uv=([^&]+)/);
        if (cookieMatch) return null;
        try { return codec.decode(value.slice(marker.length)); } catch { return null; }
      },
      transport,
      notice,
    };
  })().catch(error => { bootPromise = undefined; throw error; });
  return bootPromise!;
}

/** Frame controls backed by same-origin iframe the worker proxies. */
export function createFrame(iframe: HTMLIFrameElement, prefix: string): ScramjetFrame {
  return {
    go(url: string) { iframe.src = url; },
    back() { try { iframe.contentWindow?.history.back(); } catch { /* cross-origin after a navigation */ } },
    forward() { try { iframe.contentWindow?.history.forward(); } catch { /* cross-origin after a navigation */ } },
    addEventListener(_type, _listener) { void prefix; },
  };
}
