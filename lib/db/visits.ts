/** Visit log and the recent-visitors query used by the admin page. */
import { randomUUID } from "node:crypto";
import { getMode, pgQuery } from "./connection";
import { withLocalLock, readLocal } from "./local-store";
import type { Visit } from "./core";

/* ---------------- Visits ---------------- */

export async function logVisit(ip: string, ua: string, visitPath: string, userId?: string | null): Promise<void> {
  try {
    if (getMode() === "postgres") {
      await pgQuery('INSERT INTO "visits" ("id","ip","ua","path","userId") VALUES ($1,$2,$3,$4,$5)', [
        randomUUID(),
        ip.slice(0, 80),
        ua.slice(0, 300),
        visitPath.slice(0, 200),
        userId || null,
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
      'SELECT "id","ip","ua","path","createdAt" FROM "visits" ORDER BY "createdAt" DESC LIMIT $1',
      [limit],
    );
  }
  const s = await readLocal();
  return s.visits.slice(-limit).reverse();
}
