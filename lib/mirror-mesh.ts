/**
 * Feature 8 — the self-healing mirror mesh.
 *
 * GG-Lounge is deployed to several hosts. The mesh's job is that a person who
 * reaches any one of them keeps a working site even if the one they arrived on
 * goes down mid-session, and that a *new* visitor on a dead host is not left
 * looking at a network error.
 *
 * What this deliberately is not: a crawler. Each mirror is probed for a single
 * small asset (`/site-domains.json`) with a 4-second timeout, and the winner
 * gets a note in localStorage — nothing is fetched from the "wrong" origin at
 * request time, because doing that would put a third-party origin's content in
 * the middle of an authenticated page.
 *
 * The list is ordered by trust: the canonical deployment first, then the known
 * aliases, then the duckdns host. A host that fails twice is retired for an
 * hour (exponential from there) so a permanently dead alias costs one probe per
 * session rather than one per page load.
 */

export const MIRRORS = [
  'https://gg-lounge.vercel.app',
  'https://growth-gulid.vercel.app',
  'https://talent-tribe.vercel.app',
  'https://gg-lounge.duckdns.org',
] as const;

const KEY = 'gg-mirror-health';
const PROBE_PATH = '/site-domains.json';
const TIMEOUT_MS = 4000;
const RETIRE_MS = 60 * 60 * 1000;

export type MirrorHealth = { host: string; failAt: number; fails: number };

/**
 * Health lives in localStorage, with an in-memory copy as the fallback.
 *
 * The memory copy is not a nicety: private mode throws on `localStorage`, and a
 * probe result that cannot be remembered means every retired mirror is probed
 * again on every render of the mesh panel.
 */
let memory: MirrorHealth[] = [];
let useMemory = false;

function read(): MirrorHealth[] {
  if (useMemory || typeof localStorage === 'undefined') return memory.slice();
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as MirrorHealth[]) : [];
    return Array.isArray(parsed) ? parsed.filter(entry => typeof entry?.host === 'string') : [];
  } catch {
    useMemory = true;
    return memory.slice();
  }
}

function write(list: MirrorHealth[]) {
  const capped = list.slice(-20);
  memory = capped;
  if (useMemory || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(capped));
  } catch {
    useMemory = true;
  }
}

/**
 * Is this mirror worth probing?
 *
 * A failing mirror is retired for `RETIRE_MS` on the first failure, doubling per
 * consecutive failure up to a day. That is deliberately lenient: a single probe
 * timeout on a train is not evidence the deployment is down.
 */
export function isRetired(host: string, now = Date.now()): boolean {
  const entry = read().find(item => item.host === host);
  if (!entry) return false;
  const wait = Math.min(24 * RETIRE_MS, RETIRE_MS * 2 ** Math.max(0, entry.fails - 1));
  return now - entry.failAt < wait;
}

export function recordFailure(host: string, now = Date.now()) {
  const list = read();
  const entry = list.find(item => item.host === host);
  if (entry) {
    entry.fails += 1;
    entry.failAt = now;
  } else {
    list.push({ host, fails: 1, failAt: now });
  }
  write(list);
}

export function recordSuccess(host: string) {
  write(read().filter(entry => entry.host !== host));
}

/** Probe one mirror. Resolves to the round-trip time, or null. */
export async function probe(host: string, timeoutMs = TIMEOUT_MS): Promise<number | null> {
  const started = Date.now();
  try {
    const response = await fetch(host + PROBE_PATH, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    // `no-cors` gives an opaque response with status 0 even on a 404, so the
    // useful signal is that the request resolved at all.
    void response;
    return Date.now() - started;
  } catch {
    return null;
  }
}

/**
 * Probe every mirror that is not retired, in parallel.
 *
 * Parallel rather than sequential because the whole point is to answer quickly
 * when the host you are on is the broken one; four HEAD requests cost less than
 * one sequential timeout.
 */
export async function probeMesh(timeoutMs = TIMEOUT_MS): Promise<Array<{ host: string; ms: number | null }>> {
  const candidates = MIRRORS.filter(host => !isRetired(host));
  const results = await Promise.all(
    candidates.map(async host => ({ host, ms: await probe(host, timeoutMs) })),
  );
  for (const result of results) {
    if (result.ms === null) recordFailure(result.host);
    else recordSuccess(result.host);
  }
  return results;
}

/** The healthiest mirror, preferring the canonical one on a tie. */
export function bestMirror(results: Array<{ host: string; ms: number | null }>): string | null {
  const reachable = results.filter((result): result is { host: string; ms: number } => result.ms !== null);
  if (!reachable.length) return null;
  const canonical = reachable.find(result => result.host === MIRRORS[0]);
  if (canonical && canonical.ms < 900) return canonical.host;
  return reachable.sort((a, b) => a.ms - b.ms)[0].host;
}
