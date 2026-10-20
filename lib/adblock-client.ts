'use client';

/**
 * Bridges the ad-blocker setting (stored in customization settings) to the proxy
 * service worker, which does the actual filtering.
 *
 * Two channels are used because the service worker is a separate context that
 * can restart at any time:
 *
 *  1. postMessage — instant, so a toggle takes effect without a reload.
 *  2. a cookie — the service worker reads it through the Cookie Store API, so
 *     the setting survives a worker restart (browsers without cookieStore in the
 *     worker fall back to the last postMessage value).
 */
export const ADBLOCK_COOKIE = 'ggl_adblock';

export function readAdblockCookie(): boolean {
  try {
    return /(?:^|;\s*)ggl_adblock=1(?:;|$)/.test(document.cookie);
  } catch {
    return false;
  }
}

export function writeAdblockCookie(enabled: boolean): void {
  try {
    const attrs = `path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
    document.cookie = `${ADBLOCK_COOKIE}=${enabled ? '1' : '0'}; ${attrs}`;
  } catch {}
  try {
    if ('cookieStore' in window && (window as any).cookieStore?.set) {
      void (window as any).cookieStore.set({ name: ADBLOCK_COOKIE, value: enabled ? '1' : '0', path: '/', sameSite: 'lax' });
    }
  } catch {}
}

/** Pushes the current state to every proxy worker registration we control. */
export async function pushAdblockState(enabled: boolean): Promise<void> {
  writeAdblockCookie(enabled);
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const ours = registrations.filter(reg =>
      /\/proxy\/sw\.js$/.test(new URL((reg.active || reg.waiting || reg.installing)?.scriptURL || location.href).pathname)
    );
    for (const reg of ours) {
      reg.active?.postMessage({ ggLounge: 'adblock', enabled });
      reg.waiting?.postMessage({ ggLounge: 'adblock', enabled });
      reg.installing?.postMessage({ ggLounge: 'adblock', enabled });
    }
  } catch {
    /* No registrations yet — the proxy page pushes state again once it boots. */
  }
}
