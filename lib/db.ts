/**
 * GG-Lounge storage layer.
 *
 * - Uses Postgres when DATABASE_URL is set (permanent, for production).
 * - Falls back to a local JSON file store when it isn't (local dev / preview).
 * - Auto-creates tables on first use, so there is no manual migration step.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

export type DbMode = "postgres" | "local";

export interface Ban {
  id: string;
  identifier: string;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
}
export interface Visit {
  id: string;
  ip: string;
  ua: string;
  path: string;
  createdAt: string;
}
export interface GameRequest {
  id: string;
  title: string;
  icon: string | null;
  html?: string;
  status: string;
  createdAt: string;
}
export interface PublishedGame {
  id: string;
  title: string;
  icon: string | null;
  html?: string;
  createdAt: string;
}

export const MAX_HTML_BYTES = 50 * 1024 * 1024; // 50MB per game (chunked upload)
export const MAX_CHUNK_BYTES = 1024 * 1024; // 1MB per request (serverless limits)
export const MAX_ICON_BYTES = 300 * 1024; // 300KB favicon (data URL)

export function getMode(): DbMode {
  return process.env.DATABASE_URL ? "postgres" : "local";
}

/* ---------------- Postgres ---------------- */

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

let migratePromise: Promise<void> | null = null;
export function migrate(): Promise<void> {
  if (getMode() !== "postgres") return Promise.resolve();
  if (!migratePromise) {
    migratePromise = (async () => {
      const p = getPool();
      await p.query(`
        CREATE TABLE IF NOT EXISTS "banned_user" (
          "id" TEXT PRIMARY KEY,
          "identifier" TEXT UNIQUE NOT NULL,
          "reason" TEXT,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "expiresAt" TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS "visits" (
          "id" TEXT PRIMARY KEY,
          "ip" TEXT NOT NULL,
          "ua" TEXT NOT NULL DEFAULT '',
          "path" TEXT NOT NULL DEFAULT '/',
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "visits_createdAt_idx" ON "visits" ("createdAt" DESC);
        CREATE TABLE IF NOT EXISTS "game_request" (
          "id" TEXT PRIMARY KEY,
          "title" TEXT NOT NULL,
          "icon" TEXT,
          "html" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS "published_game" (
          "id" TEXT PRIMARY KEY,
          "title" TEXT NOT NULL,
          "icon" TEXT,
          "html" TEXT NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS "upload_parts" (
          "upload_id" TEXT NOT NULL,
          "idx" INTEGER NOT NULL,
          "chunk" TEXT NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("upload_id", "idx")
        );
      `);
      // Tolerate tables created by older schemas.
      await p.query(`ALTER TABLE "banned_user" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ`);
      await p.query(`ALTER TABLE "game_request" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending'`);
    })().catch((err) => {
      migratePromise = null;
      throw err;
    });
  }
  return migratePromise;
}

async function pgQuery<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await migrate();
  const res = await getPool().query(text, params as never[]);
  return res.rows as T[];
}

/* ---------------- Local JSON fallback ---------------- */

interface LocalStore {
  bans: Ban[];
  visits: Visit[];
  requests: GameRequest[];
  games: PublishedGame[];
}

let localDir: string | null = null;
async function getLocalDir(): Promise<string> {
  if (localDir) return localDir;
  const candidates = [
    process.env.DATA_DIR,
    path.join(process.cwd(), ".data"),
    "/tmp/gg-lounge",
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.access(dir);
      localDir = dir;
      return dir;
    } catch {
      // try next
    }
  }
  throw new Error("No writable data directory");
}

async function readLocal(): Promise<LocalStore> {
  const dir = await getLocalDir();
  try {
    const raw = await fs.readFile(path.join(dir, "lounge.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalStore>;
    return {
      bans: parsed.bans ?? [],
      visits: parsed.visits ?? [],
      requests: parsed.requests ?? [],
      games: parsed.games ?? [],
    };
  } catch {
    return { bans: [], visits: [], requests: [], games: [] };
  }
}

async function writeLocal(store: LocalStore): Promise<void> {
  const dir = await getLocalDir();
  await fs.writeFile(path.join(dir, "lounge.json"), JSON.stringify(store));
}

/* ---------------- Bans & kicks ---------------- */

export async function listBans(): Promise<Ban[]> {
  if (getMode() === "postgres") {
    return pgQuery<Ban>(
      'SELECT "id","identifier","reason","createdAt","expiresAt" FROM "banned_user" ORDER BY "createdAt" DESC',
    );
  }
  const s = await readLocal();
  return s.bans.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function addBan(
  identifier: string,
  reason: string | null,
  expiresAt: Date | null,
): Promise<Ban> {
  const id = randomUUID();
  if (getMode() === "postgres") {
    await pgQuery(
      'INSERT INTO "banned_user" ("id","identifier","reason","expiresAt") VALUES ($1,$2,$3,$4) ON CONFLICT ("identifier") DO UPDATE SET "reason"=EXCLUDED."reason","expiresAt"=EXCLUDED."expiresAt"',
      [id, identifier, reason, expiresAt ? expiresAt.toISOString() : null],
    );
    const rows = await pgQuery<Ban>(
      'SELECT "id","identifier","reason","createdAt","expiresAt" FROM "banned_user" WHERE "identifier"=$1',
      [identifier],
    );
    return rows[0];
  }
  const s = await readLocal();
  s.bans = s.bans.filter((b) => b.identifier !== identifier);
  const ban: Ban = {
    id,
    identifier,
    reason,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
  s.bans.push(ban);
  await writeLocal(s);
  return ban;
}

export async function removeBan(id: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery('DELETE FROM "banned_user" WHERE "id"=$1', [id]);
    return;
  }
  const s = await readLocal();
  s.bans = s.bans.filter((b) => b.id !== id);
  await writeLocal(s);
}

/** Returns the active ban for an identifier (null when clean/expired). Prunes expired rows. */
export async function findActiveBan(identifier: string): Promise<Ban | null> {
  const now = new Date();
  if (getMode() === "postgres") {
    await pgQuery('DELETE FROM "banned_user" WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= NOW()');
    const rows = await pgQuery<Ban>(
      'SELECT "id","identifier","reason","createdAt","expiresAt" FROM "banned_user" WHERE "identifier"=$1',
      [identifier],
    );
    return rows[0] ?? null;
  }
  const s = await readLocal();
  const before = s.bans.length;
  s.bans = s.bans.filter((b) => !b.expiresAt || new Date(b.expiresAt) > now);
  if (s.bans.length !== before) await writeLocal(s);
  return s.bans.find((b) => b.identifier === identifier) ?? null;
}

/* ---------------- Visits ---------------- */

export async function logVisit(ip: string, ua: string, visitPath: string): Promise<void> {
  try {
    if (getMode() === "postgres") {
      await pgQuery('INSERT INTO "visits" ("id","ip","ua","path") VALUES ($1,$2,$3,$4)', [
        randomUUID(),
        ip.slice(0, 80),
        ua.slice(0, 300),
        visitPath.slice(0, 200),
      ]);
      if (Math.random() < 0.02) {
        await pgQuery(
          'DELETE FROM "visits" WHERE "id" NOT IN (SELECT "id" FROM "visits" ORDER BY "createdAt" DESC LIMIT 500)',
        );
      }
      return;
    }
    const s = await readLocal();
    s.visits.push({
      id: randomUUID(),
      ip: ip.slice(0, 80),
      ua: ua.slice(0, 300),
      path: visitPath.slice(0, 200),
      createdAt: new Date().toISOString(),
    });
    s.visits = s.visits.slice(-500);
    await writeLocal(s);
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

/* ---------------- Requests & published games ---------------- */

export function validateGameHtml(html: string): string | null {
  if (!html || typeof html !== "string") return "Missing game HTML.";
  if (html.length > MAX_HTML_BYTES) return "Game file is too large (50MB max).";
  if (!/<html[\s>]/i.test(html)) return "That file doesn't look like an index.html page.";
  return null;
}

export async function createRequest(
  title: string,
  icon: string | null,
  html: string,
): Promise<GameRequest> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  if (getMode() === "postgres") {
    await pgQuery('INSERT INTO "game_request" ("id","title","icon","html","status") VALUES ($1,$2,$3,$4,$5)', [
      id,
      title,
      icon,
      html,
      "pending",
    ]);
  } else {
    const s = await readLocal();
    s.requests.push({ id, title, icon, html, status: "pending", createdAt });
    await writeLocal(s);
  }
  return { id, title, icon, status: "pending", createdAt };
}

export async function listRequests(): Promise<GameRequest[]> {
  if (getMode() === "postgres") {
    return pgQuery<GameRequest>(
      'SELECT "id","title","icon","status","createdAt" FROM "game_request" ORDER BY "createdAt" DESC',
    );
  }
  const s = await readLocal();
  return s.requests
    .map(({ html: _h, ...rest }) => rest)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getRequest(id: string): Promise<GameRequest | null> {
  if (getMode() === "postgres") {
    const rows = await pgQuery<GameRequest>(
      'SELECT "id","title","icon","html","status","createdAt" FROM "game_request" WHERE "id"=$1',
      [id],
    );
    return rows[0] ?? null;
  }
  const s = await readLocal();
  return s.requests.find((r) => r.id === id) ?? null;
}

export async function setRequestStatus(id: string, status: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery('UPDATE "game_request" SET "status"=$2 WHERE "id"=$1', [id, status]);
    return;
  }
  const s = await readLocal();
  const r = s.requests.find((x) => x.id === id);
  if (r) r.status = status;
  await writeLocal(s);
}

export async function deleteRequest(id: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery('DELETE FROM "game_request" WHERE "id"=$1', [id]);
    return;
  }
  const s = await readLocal();
  s.requests = s.requests.filter((x) => x.id !== id);
  await writeLocal(s);
}

export async function publishFromRequest(id: string): Promise<PublishedGame | null> {
  const req = await getRequest(id);
  if (!req?.html) return null;
  return publishDirect(req.title, req.icon ?? null, req.html, id);
}

export async function publishDirect(
  title: string,
  icon: string | null,
  html: string,
  id: string = randomUUID(),
): Promise<PublishedGame> {
  const createdAt = new Date().toISOString();
  if (getMode() === "postgres") {
    await pgQuery(
      'INSERT INTO "published_game" ("id","title","icon","html") VALUES ($1,$2,$3,$4) ON CONFLICT ("id") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon","html"=EXCLUDED."html"',
      [id, title, icon, html],
    );
  } else {
    const s = await readLocal();
    s.games = s.games.filter((g) => g.id !== id);
    s.games.push({ id, title, icon, html, createdAt });
    await writeLocal(s);
  }
  return { id, title, icon, createdAt };
}

export async function listGames(): Promise<PublishedGame[]> {
  if (getMode() === "postgres") {
    return pgQuery<PublishedGame>(
      'SELECT "id","title","icon","createdAt" FROM "published_game" ORDER BY "createdAt" DESC',
    );
  }
  const s = await readLocal();
  return s.games
    .map(({ html: _h, ...rest }) => rest)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getGame(id: string): Promise<PublishedGame | null> {
  if (getMode() === "postgres") {
    const rows = await pgQuery<PublishedGame>(
      'SELECT "id","title","icon","html","createdAt" FROM "published_game" WHERE "id"=$1',
      [id],
    );
    return rows[0] ?? null;
  }
  const s = await readLocal();
  return s.games.find((g) => g.id === id) ?? null;
}

export async function deleteGame(id: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery('DELETE FROM "published_game" WHERE "id"=$1', [id]);
    return;
  }
  const s = await readLocal();
  s.games = s.games.filter((g) => g.id !== id);
  await writeLocal(s);
}

/* ---------------- Chunked uploads ---------------- */

export async function putChunk(uploadId: string, idx: number, chunk: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery(
      'INSERT INTO "upload_parts" ("upload_id","idx","chunk") VALUES ($1,$2,$3) ON CONFLICT ("upload_id","idx") DO UPDATE SET "chunk"=EXCLUDED."chunk"',
      [uploadId, idx, chunk],
    );
    return;
  }
  const dir = await getLocalDir();
  const upDir = path.join(dir, "uploads", uploadId);
  await fs.mkdir(upDir, { recursive: true });
  await fs.writeFile(path.join(upDir, `${idx}.txt`), chunk, "utf8");
}

export async function assembleUpload(uploadId: string, total: number): Promise<string | null> {
  if (getMode() === "postgres") {
    const rows = await pgQuery<{ idx: number; chunk: string }>(
      'SELECT "idx","chunk" FROM "upload_parts" WHERE "upload_id"=$1 ORDER BY "idx" ASC',
      [uploadId],
    );
    if (rows.length !== total) return null;
    for (let i = 0; i < total; i++) {
      if (rows[i].idx !== i) return null;
    }
    return rows.map((r) => r.chunk).join("");
  }
  const dir = await getLocalDir();
  const parts: string[] = [];
  for (let i = 0; i < total; i++) {
    try {
      parts.push(await fs.readFile(path.join(dir, "uploads", uploadId, `${i}.txt`), "utf8"));
    } catch {
      return null;
    }
  }
  return parts.join("");
}

export async function dropUpload(uploadId: string): Promise<void> {
  try {
    if (getMode() === "postgres") {
      await pgQuery('DELETE FROM "upload_parts" WHERE "upload_id"=$1', [uploadId]);
      return;
    }
    const dir = await getLocalDir();
    await fs.rm(path.join(dir, "uploads", uploadId), { recursive: true, force: true });
  } catch {
    // best effort
  }
}
