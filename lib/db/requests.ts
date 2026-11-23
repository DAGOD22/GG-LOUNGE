/**
 * Game requests: creation, upvoting, duplicate merging, reports and play logging.
 */
import { randomUUID } from "node:crypto";
import { getMode, pgQuery, migrate, getPool } from "./connection";
import { withLocalLock, readLocal } from "./local-store";
import { canonicalGameTitle } from "../game-identity";
import { logVisit } from "./visits";
import { MAX_HTML_BYTES, type GameRequest, type Report } from "./core";
import { scanHtmlForRisks } from "./moderation";

/* ---------------- Requests & published games ---------------- */

export function validateGameHtml(html: string): string | null {
  if (!html || typeof html !== "string") return "Missing game HTML.";
  if (html.length > MAX_HTML_BYTES) return "Game file is too large (50MB max).";
  if (!/<html[\s>]/i.test(html)) return "That file doesn't look like an index.html page.";
  const risks = scanHtmlForRisks(html)
  if (risks.includes("external-script") && html.length> 500_000) return "External scripts need manual review — flagged for admin.";
  return null;
}

export async function createRequest(
  title: string,
  icon: string | null,
  html: string = "",
): Promise<GameRequest> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  if (getMode() === "postgres") {
    await pgQuery('INSERT INTO "game_request" ("id","title","icon","html","status","votes") VALUES ($1,$2,$3,$4,$5,$6)', [
      id,
      title,
      icon,
      html || "",
      "pending",
      1,
    ]);
  } else {
    await withLocalLock(async (s) => {
      s.requests.push({ id, title, icon, html: html||"", status: "pending", createdAt, votes: 1 });
    });
  }
  return { id, title, icon, status: "pending", createdAt, votes: 1 };
}
export async function createSimpleRequest(title: string): Promise<GameRequest> {
  const key = canonicalGameTitle(title);
  if (!key) throw new Error("A game title must include letters or numbers.");
  const created: GameRequest = { id: randomUUID(), title: title.trim(), icon: null, html: "", status: "pending", votes: 1, createdAt: new Date().toISOString() };
  if (getMode() === "postgres") {
    await migrate();
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      // Transaction-level lock serializes simultaneous requests for one identity.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['game-request:' + key]);
      const rows = await client.query<GameRequest>(`SELECT "id","title","icon","status","createdAt",COALESCE("votes",1) AS "votes" FROM "game_request" WHERE "status"='pending' ORDER BY "createdAt", "id"`);
      const existing = rows.rows.find(row => canonicalGameTitle(row.title) === key);
      if (!existing) await client.query(`INSERT INTO "game_request" ("id","title","icon","html","status","votes") VALUES ($1,$2,NULL,'','pending',1)`, [created.id, created.title]);
      await client.query('COMMIT');
      return existing || created;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  let result = created;
  await withLocalLock(async state => {
    const existing = state.requests.filter(row => row.status === 'pending' && canonicalGameTitle(row.title) === key).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
    if (existing) result = existing;
    else state.requests.push(created);
  });
  return result;
}
export async function upvoteRequest(id: string): Promise<GameRequest | null> {
  if (getMode() === "postgres") {
    await pgQuery('UPDATE "game_request" SET "votes" = COALESCE("votes",0)+1 WHERE "id"=$1', [id]);
    const rows = await pgQuery<GameRequest>('SELECT "id","title","icon","status","createdAt","votes" FROM "game_request" WHERE "id"=$1', [id]);
    return rows[0] ?? null;
  }
  let out: GameRequest | null = null
  await withLocalLock(async (s) => {
    const r = s.requests.find(x=> x.id===id);
    if(!r){ out=null; return; }
    r.votes = (r.votes||0)+1;
    out = r;
  });
  return out;
}
export async function addReport(gameId: string, title: string): Promise<Report> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const rep: Report = { id, gameId, title, createdAt };
  if (getMode() === "postgres") {
    try{ await pgQuery('INSERT INTO "reports" ("id","gameId","title") VALUES ($1,$2,$3)', [id, gameId, title]); }catch{}
  } else {
    await withLocalLock(async (s) => {
      s.reports = s.reports || [];
      s.reports.push(rep);
      s.reports = s.reports.slice(-200);
    });
  }
  return rep;
}
export async function listReports(): Promise<Report[]> {
  if (getMode() === "postgres") {
    try{ return await pgQuery<Report>('SELECT "id","gameId","title","createdAt" FROM "reports" ORDER BY "createdAt" DESC LIMIT 100'); }catch{ return []}
  }
  const s = await readLocal();
  return (s.reports||[]).slice().reverse().slice(0,100);
}
export async function logGamePlay(gameId: string, ip: string, userId?: string | null, username?: string | null, ua = ""): Promise<void> {
  // Every play is recorded so the moderation console can attribute traffic and
  // ban a guest or a named account. Only signed-in plays count for the
  // leaderboard; leaderboard() filters on userId itself.
  await logVisit(ip, ua, "/play/"+gameId, userId, username);
}
export async function leaderboard(limit=10): Promise<{gameId:string,count:number}[]>{
  if(getMode()==="postgres"){
    try{
      // Only signed-in users (userId IS NOT NULL) count — guests ignored
      const rows = await pgQuery<{gameId:string,count:string}>('SELECT substring("path" from 7) as "gameId", COUNT(*) as count FROM "visits" WHERE "path" LIKE \'/play/%\' AND "userId" IS NOT NULL GROUP BY "gameId" ORDER BY count DESC LIMIT $1', [limit]);
      return rows.map(r=> ({gameId:r.gameId, count: Number(r.count)}));
    }catch{ return []}
  }
  const s = await readLocal();
  const map: Record<string,number>={}
  for(const v of s.visits) if(v.path.startsWith('/play/') && (v as any).userId) map[v.path.slice(6)] = (map[v.path.slice(6)]||0)+1
  return Object.entries(map).sort((a,b)=> b[1]-a[1]).slice(0,limit).map(([gameId,count])=> ({gameId,count}))
}
