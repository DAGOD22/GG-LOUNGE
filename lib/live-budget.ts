/**
 * Rate limits for the live features.
 *
 * `checkRateLimit` in lib/db/core keeps its buckets in a module-level Map,
 * which is per-serverless-instance. That is fine for abuse *friction* but it
 * is not a limit: with N warm lambdas the real ceiling is N × max. For the
 * presence heartbeat — the highest-frequency endpoint on the site, one call
 * every couple of seconds per player — friction is not enough, so counters
 * live in Postgres where every instance shares them.
 *
 * When there is no database (local dev, self-host), it falls back to the
 * in-memory bucket, because the single-process dev server is exactly the case
 * where per-process really does mean global.
 */
import { getMode, pgQuery, migrate } from './db/connection';
import { checkRateLimit as inMemoryLimit } from './db/core';

/**
 * Count one hit and say whether it is allowed.
 *
 * Increment-then-compare in a single statement, so two concurrent lambdas
 * cannot both read "3999" and both proceed.
 */
export async function consumeSharedBudget(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  if (getMode() !== 'postgres') return inMemoryLimit(key, max, windowSeconds * 1000);
  try {
    await migrate();
    const rows = await pgQuery<{ count: number }>(
      `INSERT INTO "live_budget" ("key", "count", "resetAt")
       VALUES ($1, 1, NOW() + ($3 || ' seconds')::interval)
       ON CONFLICT ("key") DO UPDATE
         SET "count" = CASE
               WHEN "live_budget"."resetAt" <= NOW() THEN 1
               ELSE "live_budget"."count" + 1
             END,
             "resetAt" = CASE
               WHEN "live_budget"."resetAt" <= NOW() THEN NOW() + ($3 || ' seconds')::interval
               ELSE "live_budget"."resetAt"
             END
       RETURNING "count"`,
      [key, windowSeconds, String(windowSeconds)],
    );
    return Number(rows[0]?.count ?? 1) <= max;
  } catch {
    // The database answered badly; prefer letting players stay connected over
    // failing the heartbeat quietly. The in-memory bucket still applies.
    return inMemoryLimit(key, max, windowSeconds * 1000);
  }
}

/** Identifies the caller for budgeting: forwarded IP, or a shared bucket. */
export function callerKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || 'unknown';
}
