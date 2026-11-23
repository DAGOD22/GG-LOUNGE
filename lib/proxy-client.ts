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
export type ProxyFrame = {
  go: (url: string) => void;
  back: () => void;
  forward: () => void;
  reload: () => void;
  /** 'urlchange' fires with the real destination whenever the frame navigates. */
  addEventListener: (type: 'urlchange', listener: (event: { url: string }) => void) => void;
  removeEventListener: (type: 'urlchange', listener: (event: { url: string }) => void) => void;
  /** Stop polling and drop every listener attached by this frame. */
  destroy: () => void;
};
/** @deprecated The frame is no longer Scramjet-specific. Use ProxyFrame. */
export type ScramjetFrame = ProxyFrame;

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

/** Does this host actually upgrade /api/wisp? One probe, cached. */
let wispProbe: Promise<boolean> | null = null;
function wispAvailable(): Promise<boolean> {
  if (wispProbe) return wispProbe;
  wispProbe = (async () => {
    try {
      const res = await fetch('/api/wisp', { method: 'GET', headers: { accept: 'application/json' } });
      if (!res.ok) return false;
      const body = (await res.json()) as { transport?: string };
      return body?.transport === 'websocket';
    } catch {
      return false;
    }
  })();
  return wispProbe;
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

    // WebSocket transport, when the host can upgrade. Ultraviolet's own
    // websocket shim opens a `bare` subprotocol against the configured bare
    // address, so pointing that address at the Wisp relay is all multiplayer
    // (CrazyGames, Poki, now.gg, every .io title) needs. Serverless hosts cannot
    // upgrade, so this is best-effort and silently stays on plain HTTP.
    const transport = 'bare' as const;
    let notice = 'Connected through the lounge proxy.';
    try {
      if (await wispAvailable()) {
        const w = window as unknown as { wisp_client?: { client: new (url: string) => unknown } };
        await loadScript('/wisp/wisp-client.js');
        if (w.wisp_client?.client) {
          // Touch the constructor so a broken build fails here, not mid-match.
          new w.wisp_client.client(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/wisp/`);
          notice = 'Connected through the lounge proxy, with live multiplayer.';
        }
      }
    } catch { /* HTTP-only is still a working browser */ }

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

/** A decoded candidate is only trusted if it is a real http(s) address. */
function asHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Recover the real destination from whatever the frame currently shows.
 *
 * Ultraviolet rewrites `history.pushState` so the frame's own URL becomes the
 * proxied form of the destination, which means `location.href` alone is enough
 * for both full loads and in-page (SPA) navigation — no message bridge needed.
 * Some sites hand the encoder an already-encoded string, so decoding can need
 * more than one pass; a candidate is only accepted once it parses as http(s).
 */
function readDestination(iframe: HTMLIFrameElement, prefix: string, decode: (value: string) => string | null): string | null {
  let href: string;
  let state: unknown;
  try {
    const win = iframe.contentWindow;
    if (!win) return null;
    href = win.location.href;
    state = win.history.state;
  } catch {
    return null;
  }
  if (!href || href === 'about:blank' || href.startsWith('about:')) return null;

  // Encoded path: peel off the prefix, then decode until it parses.
  // `decode` expects a full proxied URL, so each attempt re-wraps the tail.
  const markerIndex = href.indexOf(prefix);
  if (markerIndex !== -1) {
    const absolutePrefix = href.slice(0, markerIndex + prefix.length);
    let candidate = href.slice(markerIndex + prefix.length).split(/[?#]/)[0];
    for (let pass = 0; pass < 4 && candidate; pass++) {
      const direct = asHttpUrl(candidate);
      if (direct) return direct;
      // `decode` is origin-aware, so hand it a URL shaped exactly like the one
      // it produces: origin + prefix + payload.
      const decoded = decode(`${absolutePrefix}${candidate}`) ?? safeDecode(candidate);
      if (!decoded || decoded === candidate) break;
      candidate = decoded;
    }
    // Undecodable (or still our own URL): leave the last good address alone
    // rather than flashing a service-worker path at the user.
    return asHttpUrl(candidate);
  }

  // The page may hold its own history state; use it only if it decodes cleanly.
  if (typeof state === 'string') {
    const decoded = decode(state) ?? asHttpUrl(state);
    if (decoded) return decoded;
  }

  // The worker lost control of this document, so the href is the real address.
  // Never surface our own proxied URL as if it were the destination.
  const real = asHttpUrl(href);
  return real && !real.includes(prefix) ? real : null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function createFrame(
  iframe: HTMLIFrameElement,
  prefix: string,
  decode: (value: string) => string | null,
): ProxyFrame {
  const listeners = new Set<(event: { url: string }) => void>();
  let last = '';
  let timer: ReturnType<typeof setInterval> | null = null;
  let onLoad: (() => void) | null = null;

  const report = (value: string | null) => {
    if (!value || value === last) return;
    last = value;
    for (const listener of listeners) listener({ url: value });
  };

  const poll = () => {
    try {
      if (iframe.contentWindow) report(readDestination(iframe, prefix, decode));
    } catch {
      // Transient access errors during a navigation are expected.
    }
  };

  const attach = () => { if (!timer) timer = setInterval(poll, 400); };
  const detach = () => { if (timer) clearInterval(timer); timer = null; };

  return {
    go(url: string) {
      last = '';
      iframe.src = url;
    },
    back() {
      try { iframe.contentWindow?.history.back(); } catch { /* nothing to go back to */ }
    },
    forward() {
      try { iframe.contentWindow?.history.forward(); } catch { /* nothing to go forward to */ }
    },
    reload() {
      try { iframe.contentWindow?.location.reload(); } catch { /* ignore */ }
    },
    addEventListener(type, listener) {
      if (type !== 'urlchange') return;
      listeners.add(listener);
      if (!onLoad) { onLoad = poll; iframe.addEventListener('load', onLoad); }
      attach();
      poll();
    },
    removeEventListener(type, listener) {
      if (type !== 'urlchange') return;
      listeners.delete(listener);
      if (listeners.size === 0) {
        detach();
        if (onLoad) { iframe.removeEventListener('load', onLoad); onLoad = null; }
      }
    },
    destroy() {
      listeners.clear();
      detach();
      if (onLoad) { iframe.removeEventListener('load', onLoad); onLoad = null; }
    },
  };
}

