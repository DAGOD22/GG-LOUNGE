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

/**
 * The bare hostname of a destination, for anything that leaves this browser:
 * the activity roster, the feed, a status line.
 *
 * Paths and queries on a proxied URL routinely contain search terms, session
 * ids and account names. Broadcasting "in the proxy" is fine; broadcasting
 * "in the proxy on youtube.com/watch?v=something-embarrassing" is a leak, so
 * everything past the host is dropped at the source rather than at the sink.
 */
export function hostOnly(input: string): string {
  const value = input.trim();
  if (!value) return '';
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    // Must look like a hostname; a bare word is not a destination.
    if (!host.includes('.') || !/[a-z]/.test(host)) return '';
    return host.slice(0, 60);
  } catch {
    return '';
  }
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
 * Watch one worker's lifecycle, keeping the states it passed through.
 *
 * The old version reported two outcomes, `activated` and the catch-all
 * "installation failed" — which is what the page showed for a failed *fetch*, a
 * syntax error in the bundle and a genuine install exception alike. That text
 * told the user nothing they could act on and told us nothing we could fix.
 * Every state is recorded now, so the message can name the step that broke.
 */
export function watchWorker(worker: ServiceWorker, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const states: string[] = [];
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', check);
      if (error) {
        // Keep the sentence first; the state trail is supporting detail.
        error.message = `Proxy worker activation timed out or failed: ${error.message}`;
        if (states.length) error.message += ` (${states.join(' → ')})`;
        reject(error);
      } else resolve();
    };
    const check = () => {
      states.push(worker.state);
      if (worker.state === 'activated') finish();
      // `redundant` is terminal: the browser has thrown this worker away.
      else if (worker.state === 'redundant') finish(new Error('Proxy worker installation failed'));
    };
    const timer = setTimeout(
      () => finish(new Error(`Proxy worker did not finish installing (state: ${worker.state})`)),
      timeoutMs,
    );
    worker.addEventListener('statechange', check);
    check();
  });
}

/**
 * Wait for THIS registration, not for `navigator.serviceWorker.ready`.
 *
 * `ready` can resolve for an unrelated worker, and waits forever when the page
 * is outside the worker's scope — both of which read as a hung proxy.
 */
export function waitForActivation(reg: ServiceWorkerRegistration, timeoutMs = 15000): Promise<ServiceWorkerRegistration> {
  const worker = reg.installing || reg.waiting || reg.active;
  if (!worker) return Promise.reject(new Error('Proxy worker was not installed'));
  return watchWorker(worker, timeoutMs).then(() => reg);
}

/**
 * Check the two files the worker imports before asking the browser to install it.
 *
 * A worker's install is a black box: it activates or it goes `redundant`, and
 * the page is told nothing about why. Probing the same URLs the worker imports
 * turns the common failures into a sentence instead of "installation failed":
 *
 *   · a 404, or an HTML error page where a script should be (bad deploy, or a
 *     rewrite catching /uv/*),
 *   · a config that is not the shape Ultraviolet expects,
 *   · a bundle that is missing the globals the worker extends at load time.
 *
 * An exception *inside* a valid-looking bundle is the one case this cannot see.
 */
async function preflight(): Promise<string | null> {
  const [bundle, config] = await Promise.all([
    fetch('/uv/uv.bundle.js', { cache: 'no-store' }).catch(() => null),
    fetch('/uv/uv.config.js', { cache: 'no-store' }).catch(() => null),
  ]);
  if (!bundle) return 'The proxy engine could not be downloaded.';
  if (!bundle.ok) return `The proxy engine could not be downloaded (HTTP ${bundle.status}).`;
  if (bundle.headers.get('content-type')?.includes('text/html')) {
    return 'The proxy engine was served as a web page instead of a script.';
  }
  if (!config) return 'The proxy configuration could not be downloaded.';
  if (!config.ok) return `The proxy configuration could not be downloaded (HTTP ${config.status}).`;
  const configText = await config.text().catch(() => '');
  if (!/self\.__uv\$config\s*=/.test(configText)) return 'The proxy configuration is malformed.';
  const bundleText = await bundle.text().catch(() => '');
  if (!bundleText.includes('Ultraviolet')) return 'The proxy engine file is incomplete.';
  return null;
}

/**
 * Register the proxy worker at origin scope and resolve once it is actually
 * controlling this page. Ultraviolet only intercepts requests for documents it
 * controls, so navigating before control is established yields a 404.
 */
export async function ensureProxyWorker(): Promise<ServiceWorkerRegistration> {
  const problem = await preflight();
  if (problem) throw new Error(`${problem} Reload to retry.`);

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register('/uv/uv.sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch (cause) {
    // register() rejects when the script will not parse — a different fix from
    // a worker that installs and then throws.
    throw new Error(`The proxy worker could not be registered: ${describe(cause)}.`);
  }

  try {
    await waitForActivation(registration);
  } catch (cause) {
    // A redundant worker is not retried by the browser on the same page load,
    // so leaving the registration behind guarantees the next attempt fails too.
    await registration.unregister().catch(() => {});
    throw new Error(`${describe(cause)}. Reload to retry.`);
  }

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
  if (!navigator.serviceWorker.controller) {
    throw new Error('The proxy worker installed but could not take control of this page. Reload and try again.');
  }
  return registration;
}

/** A short, human reason from whatever was thrown. */
function describe(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  const name = (cause as { name?: string })?.name;
  return name ? `the browser reported ${name}` : 'the browser gave no reason';
}

/**
 * Is there a real WebSocket relay at /api/wisp?
 *
 * The old probe *fetched* `/api/wisp` and believed the JSON, which says "yes,
 * transport: websocket" on the self-hosted server and returns a JSON body on a
 * serverless host too — so the client switched to a Wisp transport that did not
 * exist and proxied pages sat on a blank frame. The only honest test is an
 * actual upgrade, so this opens one and closes it. A serverless deployment
 * refuses immediately and we stay on Bare, which is what actually works there.
 */
let wispProbe: Promise<boolean> | null = null;
function wispAvailable(): Promise<boolean> {
  if (wispProbe) return wispProbe;
  wispProbe = new Promise<boolean>(resolve => {
    let settled = false;
    let timer = 0;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.onopen = socket.onerror = socket.onclose = null;
      try { socket.close(); } catch { /* already closed */ }
      resolve(ok);
    };
    let socket: WebSocket;
    try {
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/wisp/`,
        ['wisp-v2', 'wisp-v1'],
      );
    } catch {
      resolve(false);
      return;
    }
    // Probe with the exact protocol list the Wisp client itself uses; a server
    // that speaks only wisp-v1 would reject v2 and answer a v2-only probe with
    // a close, which is indistinguishable from "no server at all".
    timer = window.setTimeout(() => done(false), 3500);
    socket.onopen = () => done(true);
    socket.onerror = () => done(false);
    socket.onclose = () => done(false);
  });
  return wispProbe;
}

export function bootProxy(): Promise<ProxyRuntime> {
  if (bootPromise) return bootPromise;
  bootPromise = (async (): Promise<ProxyRuntime> => {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('The proxy needs HTTPS and service workers enabled in your browser.');

    // Retire the *other* engines' workers only.
    //
    // This used to also unregister `/uv/uv.sw.js` — the worker the next line
    // then registers — because the old Scramjet worker shared that shape of
    // path. Unregistering a worker does not cancel its in-flight install, so
    // the registration below raced the unregister and the page reported
    // "Proxy worker installation failed" against a worker that had, in fact,
    // been removed by our own boot code. Match the legacy scripts exactly and
    // touch nothing else: an installed, controlling worker is what makes
    // /service/ resolve at all.
    const existing = await navigator.serviceWorker.getRegistrations();
    await Promise.all(existing.filter(reg => {
      const scriptPath = new URL(
        (reg.active || reg.waiting || reg.installing)?.scriptURL || location.href,
      ).pathname;
      return scriptPath === '/gg-sw.js'
        || scriptPath === '/proxy/sw.js'
        || scriptPath === '/gg-app-sw.js'
        || scriptPath === '/uv.sw.js'
        || scriptPath === '/service/uv.sw.js';
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

