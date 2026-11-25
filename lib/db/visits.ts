/** Visit log and the recent-visitors query used by the admin page. */
import { randomUUID } from "node:crypto";
import { getMode, pgQuery } from "./connection";
import { withLocalLock, readLocal } from "./local-store";
import type { Visit } from "./core";

/* ---------------- Visits ---------------- */

/**
 * Record a page/game view for the moderation console.
 *
 * `username` is stored alongside `userId` so the admin panel can show who a
 * visitor actually is without a join, and so the name survives account
 * deletion (the FK nulls `userId`, but the historical row still reads
 * sensibly). Guests pass null and are displayed as "anonymous" + IP.
 */
export async function logVisit(ip: string, ua: string, visitPath: string, userId?: string | null, username?: string | null): Promise<void> {
  try {
    if (getMode() === "postgres") {
      await pgQuery('INSERT INTO "visits" ("id","ip","ua","path","userId","username") VALUES ($1,$2,$3,$4,$5,$6)', [
        randomUUID(),
        ip.slice(0, 80),
        ua.slice(0, 300),
        visitPath.slice(0, 200),
        userId || null,
        username ? username.slice(0, 60) : null,
      ]);
      if (Math.random() < 0.02) {
        await pgQuery(
          'DELETE FROM "visits" WHERE "id" NOT IN (SELECT "id" FROM "visits" ORDER BY "createdAt" DESC LIMIT 500)',
        );
      }
      return;
    }
    await withLocalLock(async (s) => {
      s.visits.push({
        id: randomUUID(),
        ip: ip.slice(0, 80),
        ua: ua.slice(0, 300),
        path: visitPath.slice(0, 200),
        createdAt: new Date().toISOString(),
        userId: userId || null,
        username: username ? username.slice(0, 60) : null,
      } as any);
      s.visits = s.visits.slice(-500);
    });
  } catch {
    // visit logging must never break page loads
  }
}

export async function recentVisits(limit = 60): Promise<Visit[]> {
  if (getMode() === "postgres") {
    return pgQuery<Visit>(
      // Fall back to the account's current name for rows written before the
      // username column existed.
      'SELECT v."id", v."ip", v."ua", v."path", v."createdAt", COALESCE(v."username", u."username") AS "username" FROM "visits" v LEFT JOIN "auth_user" u ON u."id" = v."userId" ORDER BY v."createdAt" DESC LIMIT $1',
      [limit],
    );
  }
  const s = await readLocal();
  return s.visits.slice(-limit).reverse();
}
