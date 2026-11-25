/**
 * Where the proxy frame currently is.
 *
 * Two components need this and neither can own it. The proxy page knows the
 * destination because it watches the frame's own `location`; the activity
 * reporter needs it because the roster and the feed are built from it. Reading
 * it off the address bar does not work: the proxy is a single Next route, so
 * browsing ten pages inside the frame changes the query string zero times.
 *
 * A module-level value plus a listener set is enough — there is one proxy frame
 * per tab, and this is display state, not data anyone can lose. The reporter
 * subscribes and re-announces; the proxy page publishes on every navigation.
 */
let destination = '';
const listeners = new Set<(next: string) => void>();

/** Only the hostname leaves the browser; callers must still reduce it. */
export function setProxyDestination(url: string): void {
  if (url === destination) return;
  destination = url;
  for (const listener of listeners) listener(destination);
}

export function getProxyDestination(): string {
  return destination;
}

export function subscribeProxyDestination(listener: (next: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
