/**
 * Shared probe for the YouTube relay status.
 *
 * Isolated in its own module so both the JSON endpoint and any page-level
 * server component can ask the same question without duplicating the instance
 * list or the timeout behaviour.
 */

const PROBE_PATH = '/streams/dQw4w9WgXcQ';
const PROBE_BUDGET_MS = 4500;

export type RelayProbe = {
  ok: boolean;
  instance: string | null;
  checkedAt: string;
  /** Machine-readable reason so the UI can pick the right sentence. */
  reason: 'ok' | 'egress_blocked' | 'relay_down' | 'timeout';
  detail: string;
};

function normalise(url: string): string {
  return url.replace(/\/+$/, '');
}

async function attempt(base: string, timeoutMs: number): Promise<{ ok: boolean; error?: string; status?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalise(base)}${PROBE_PATH}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'GG-Lounge/1.0 (relay-status)' },
      cache: 'no-store',
    });
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : `status ${res.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: /abort/i.test(message) ? 'timed out' : message };
  } finally {
    clearTimeout(timer);
  }
}

async function check(): Promise<RelayProbe> {
  const checkedAt = new Date().toISOString();
  const { PIPED_INSTANCES } = await import('./yt-instances');
  const started = Date.now();
  const errors: string[] = [];

  // Try three hosts at a time; the whole probe stays inside the request budget.
  for (let i = 0; i < PIPED_INSTANCES.length; i += 3) {
    const batch = PIPED_INSTANCES.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async instance => ({ instance, ...(await attempt(instance, PROBE_BUDGET_MS)) })),
    );
    const hit = results.find(result => result.ok);
    if (hit) return { ok: true, instance: hit.instance, checkedAt, reason: 'ok', detail: `${hit.instance} answered in ${Date.now() - started}ms` };
    for (const result of results) errors.push(`${result.instance}: ${result.error ?? 'failed'}`);
    if (Date.now() - started > PROBE_BUDGET_MS * 2) break;
  }

  const blocked = errors.length > 0 && errors.every(e => /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed|network/i.test(e));
  return {
    ok: false,
    instance: null,
    checkedAt,
    reason: errors.some(e => /timed out/i.test(e)) ? 'timeout' : blocked ? 'egress_blocked' : 'relay_down',
    detail: errors.slice(0, 4).join('; ') || 'no relays configured',
  };
}

export const PipedProbe = { check };
