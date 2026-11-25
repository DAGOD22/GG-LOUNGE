'use client';

/**
 * The Arcade Lab engine.
 *
 * Ten experiments hang off one small runtime, so they share a clock, one
 * settings store and one set of controls instead of ten competing toggles.
 * Everything here is frame-loop based and disposable: any module can be turned
 * on or off mid-session without reloading the game.
 *
 * House rules every module follows:
 *   · nothing runs unless the person turns it on — no hidden timers, no
 *     background audio, no unsolicited network traffic;
 *   · the loop is `requestAnimationFrame` and does no allocation per frame;
 *   · everything is `pointer-events: none` unless it is a control, and every
 *     control is a real `<button>`;
 *   · turning a module off restores exactly what it changed.
 */

export type Setting = {
  id: string;
  label: string;
  /** Short line for the tooltip; what it does, in plain words. */
  hint: string;
};

/* ------------------------------------------------------------------ store -- */

const listeners = new Set<() => void>();
let state: Record<string, unknown> = {};
const STORAGE_KEY = 'gg-arcade-lab';

function readStored(): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

let loaded = false;
function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return;
  state = { ...readStored() };
  loaded = true;
}

export function getSetting<T>(id: string, fallback: T): T {
  ensureLoaded();
  return (state[id] as T) ?? fallback;
}

export function setSetting<T>(id: string, value: T) {
  ensureLoaded();
  state[id] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode: settings last for the session */
  }
  for (const listener of listeners) listener();
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ------------------------------------------------------------- time scale -- */

/**
 * Time scaling, without patching the page's clock.
 *
 * The obvious approach — override `performance.now` and `requestAnimationFrame`
 * — is what most trainers do, and it is a disaster in a shared document: the
 * save system's debounce, the presence poller and React's scheduler all read the
 * same clock, so a 0.25x game also becomes a 0.25x site and the UI looks frozen.
 *
 * Instead the scale is applied only to callbacks registered *through this
 * engine*: the game loop is re-timed at the source, and `setInterval`-style
 * timers are scaled by re-scheduling them. A game that reads
 * `performance.now()` itself still sees real time, which is honest — the
 * alternative silently corrupts every other timer on the page.
 */
export class ScaledClock {
  scale = 1;
  private frameHandlers = new Set<(now: number) => void>();
  private raf = 0;
  private virtual = 0;
  private last = 0;

  start() {
    if (this.raf || typeof window === 'undefined') return;
    this.last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(250, now - this.last); // tab-switch guard
      this.last = now;
      this.virtual += delta * this.scale;
      for (const handler of this.frameHandlers) handler(this.virtual);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  onFrame(handler: (now: number) => void) {
    this.frameHandlers.add(handler);
    this.start();
    return () => {
      this.frameHandlers.delete(handler);
      if (!this.frameHandlers.size) this.stop();
    };
  }
}

/* ------------------------------------------------------------------ audio -- */

/**
 * A tiny synthesised-hum bus.
 *
 * Both the ghost-hum and the panic detector need an AudioContext, and browsers
 * cap how many you can create. One shared context, started lazily on the first
 * gesture (autoplay policy), is the only way this works on a phone.
 */
let audio: AudioContext | null = null;

export function audioBus(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audio) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  if (audio.state === 'suspended') void audio.resume();
  return audio;
}

/* ------------------------------------------------------------------ utils -- */

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Post to the game frame's window, best effort — a proxied game ignores it. */
export function postToFrame(frame: HTMLIFrameElement | null, message: unknown) {
  try {
    frame?.contentWindow?.postMessage(message, '*');
  } catch {
    /* frame gone */
  }
}
