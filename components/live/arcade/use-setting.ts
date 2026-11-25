'use client';

import { useEffect, useState } from 'react';
import { getSetting, subscribeSettings } from './engine';

/**
 * Read one engine setting.
 *
 * `useSyncExternalStore` would be the textbook answer, but the store is created
 * per session (localStorage-backed, no module singleton on the server), so a
 * plain effect subscription keeps the server render identical to the client's
 * first paint — no hydration mismatch and no flash of the wrong filter.
 */
export function useSetting<T>(id: string, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    const sync = () => setValue(getSetting(id, fallback));
    sync();
    // `fallback` is deliberately not a dependency: it is a literal at every
    // call site, and including it would re-subscribe on every render.
    return subscribeSettings(sync);
  }, [id]);
  return value;
}
