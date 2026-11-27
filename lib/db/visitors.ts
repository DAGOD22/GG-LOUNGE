/**
 * The site's real visitor counter.
 *
 * The retro LED counter used to count only its own browser's reloads — a number
 * that lied. This is the honest version: one row per visitor, keyed by an
 * anonymous cookie id (no account, no sign-in, nothing personal), plus a
 * single-row hit total. Both live in the same database as everything else, so
 * the number is the same for everyone on every device and it survives forever.
 *
 * "Visitor" here means a distinct browser: the cookie is issued once and
 * replayed on every later visit. Clearing cookies makes you a new visitor to
 * the counter, exactly like every hit counter since 1994.
 */
import { getMode, pgQuery } from './connection';
import { readLocal, withLocalLock } from './local-store';

export type VisitStats = { visitors: number; hits: number };

type LocalCounter = {
  siteVisitors?: Record<string, number>;
  siteHits?: number;
};

/** An id we did not issue (or a hand-rolled one) is not worth storing. */
export function cleanVisitorId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const id = input.trim().toLowerCase();
  return /^[a-f0-9-]{8,64}$/.test(id) ? id : null;
}

/** Count this visitor (once) and this visit (always). */
export async function recordVisit(vid: string): Promise<VisitStats> {
  if (getMode() === 'postgres') {
    // ON CONFLICT DO NOTHING makes the insert idempotent: an existing visitor
    // is counted exactly once, no matter how many times they come back.
    await pgQuery(
      `INSERT INTO "site_visitor" ("id") VALUES ($1) ON CONFLICT ("id") DO NOTHING`,
      [vid],
    );
    const rows = await pgQuery<{ visitors: string; hits: string }>(
      `SELECT (SELECT COUNT(*) FROM "site_visitor")::text AS "visitors",
              (SELECT "hits" FROM "site_hit" WHERE "id" = TRUE)::text AS "hits"`,
    );
    const nextHits = Number(rows[0]?.hits ?? 0) + 1;
    await pgQuery(`UPDATE "site_hit" SET "hits" = "hits" + 1 WHERE "id" = TRUE`);
    return { visitors: Number(rows[0]?.visitors ?? 0), hits: nextHits };
  }
  let stats: VisitStats = { visitors: 0, hits: 0 };
  await withLocalLock(async (raw: unknown) => {
    const store = raw as LocalCounter;
    const visitors = (store.siteVisitors ??= {});
    if (!visitors[vid]) visitors[vid] = Date.now();
    store.siteHits = (store.siteHits ?? 0) + 1;
    stats = { visitors: Object.keys(visitors).length, hits: store.siteHits };
  });
  return stats;
}

export async function visitorStats(): Promise<VisitStats> {
  if (getMode() === 'postgres') {
    const rows = await pgQuery<{ visitors: string; hits: string }>(
      `SELECT (SELECT COUNT(*) FROM "site_visitor")::text AS "visitors",
              (SELECT "hits" FROM "site_hit" WHERE "id" = TRUE)::text AS "hits"`,
    );
    return { visitors: Number(rows[0]?.visitors ?? 0), hits: Number(rows[0]?.hits ?? 0) };
  }
  const store = (await readLocal()) as unknown as LocalCounter;
  return {
    visitors: Object.keys(store.siteVisitors ?? {}).length,
    hits: store.siteHits ?? 0,
  };
}
