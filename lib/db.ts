/**
 * GG-Lounge storage layer.
 *
 * - Uses Postgres when DATABASE_URL is set (permanent, for production).
 * - Falls back to a local JSON file store when it isn't (local dev / preview).
 * - Auto-creates tables on first use, so there is no manual migration step.
 */
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

// ---- Fix 1: queued writes to avoid local JSON races ----
let writeQueue: Promise<void> = Promise.resolve();

// ---- Fix 2: auth hardening helpers ----
const COMMON_PASSWORDS = new Set(['password','123456','qwerty','letmein','admin','aaaa','abcd','1234','password1','qwerty123'])
function isStrongPassword(pw: string): string | null {
  if (pw.length < 6 || pw.length > 64) return 'Password must be 6-64 characters'
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'Password too common — choose another'
  if (/^([a-zA-Z0-9])\1{3,}$/.test(pw)) return 'Password too simple'
  return null
}
const rateMap = new Map<string, { count:number, reset:number }>()
export function checkRateLimit(key:string, max=5, windowMs=15*60*1000): boolean {
  const now = Date.now()
  const e = rateMap.get(key)
  if (!e || now > e.reset) { rateMap.set(key, { count: 1, reset: now + windowMs }); return true }
  if (e.count >= max) return false
  e.count++
  return true
}
export function getRateLimitRemaining(key:string, max=5): number {
  const e = rateMap.get(key)
  if (!e) return max
  if (Date.now() > e.reset) return max
  return Math.max(0, max - e.count)
}

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
  userId?: string | null;
}
export interface GameRequest {
  id: string;
  title: string;
  icon: string | null;
  html?: string;
  status: string;
  createdAt: string;
  votes?: number;
}
export interface Report {
  id: string;
  gameId: string;
  title: string;
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
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "userId" TEXT REFERENCES "auth_user"("id") ON DELETE SET NULL
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
        CREATE TABLE IF NOT EXISTS "reports" (
          "id" TEXT PRIMARY KEY,
          "gameId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS "auth_user" (
          "id" TEXT PRIMARY KEY,
          "username" TEXT NOT NULL,
          "username_lower" TEXT UNIQUE NOT NULL,
          "password_hash" TEXT NOT NULL,
          "favorite_food_hash" TEXT NOT NULL,
          "favorite_food_norm" TEXT NOT NULL,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS "auth_session" (
          "token" TEXT PRIMARY KEY,
          "user_id" TEXT NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "expires_at" TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS "game_save" (
          "user_id" TEXT NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
          "game_id" TEXT NOT NULL,
          "data" TEXT NOT NULL,
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("user_id", "game_id")
        );
        CREATE INDEX IF NOT EXISTS "game_save_user_idx" ON "game_save" ("user_id");
      `);
      // Tolerate tables created by older schemas.
      await p.query(`ALTER TABLE "banned_user" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ`);
      await p.query(`ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "userId" TEXT`);
      await p.query(`CREATE INDEX IF NOT EXISTS "visits_userId_idx" ON "visits" ("userId")`);
      await p.query(`ALTER TABLE "game_request" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending'`);
      await p.query(`ALTER TABLE "game_request" ADD COLUMN IF NOT EXISTS "votes" INTEGER NOT NULL DEFAULT 1`);
      await p.query(`ALTER TABLE "game_request" ADD COLUMN IF NOT EXISTS "html" TEXT`);
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
  reports: Report[];
  userStates: Record<string, UserState>;
  users: AuthUser[];
  sessions: AuthSession[];
  saves: GameSave[];
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
      reports: (parsed as any).reports ?? [],
      userStates: (parsed as any).userStates ?? {},
      users: (parsed as any).users ?? [],
      sessions: (parsed as any).sessions ?? [],
      saves: (parsed as any).saves ?? [],
    };
  } catch {
    return { bans: [], visits: [], requests: [], games: [], reports: [], userStates: {}, users: [], sessions: [], saves: [] };
  }
}

async function writeLocalRaw(store: LocalStore): Promise<void> {
  const dir = await getLocalDir();
  // atomic: write tmp then rename
  const tmp = path.join(dir, "lounge.json.tmp");
  await fs.writeFile(tmp, JSON.stringify(store));
  await fs.rename(tmp, path.join(dir, "lounge.json"));
}
async function writeLocal(store: LocalStore): Promise<void> {
  const task = writeQueue.then(() => writeLocalRaw(store));
  // keep queue alive even if one fails
  writeQueue = task.catch(() => {});
  return task;
}
// Fix 7: serialize read-modify-write for local JSON to prevent lost updates
async function withLocalLock<T>(fn: (store: LocalStore) => Promise<T> | T): Promise<T> {
  let result!: T
  const task = writeQueue.then(async () => {
    const store = await readLocal();
    result = await fn(store);
    await writeLocalRaw(store);
  });
  writeQueue = task.catch(() => {});
  await task;
  return result;
}
async function readLocalLocked(): Promise<LocalStore> {
  // For pure reads, just read without lock (ok to be slightly stale)
  return readLocal();
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
  let ban!: Ban
  await withLocalLock(async (s) => {
    s.bans = s.bans.filter((b) => b.identifier !== identifier);
    ban = {
      id,
      identifier,
      reason,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
    s.bans.push(ban);
  });
  return ban;
}

export async function removeBan(id: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery('DELETE FROM "banned_user" WHERE "id"=$1', [id]);
    return;
  }
  await withLocalLock(async (s) => {
    s.bans = s.bans.filter((b) => b.id !== id);
  });
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
  const filtered = s.bans.filter((b) => !b.expiresAt || new Date(b.expiresAt) > now);
  if (filtered.length !== before) {
    await withLocalLock(async (store) => {
      store.bans = store.bans.filter((b) => !b.expiresAt || new Date(b.expiresAt) > now);
    });
  }
  // re-read after prune? keep simple: read again
  const s2 = await readLocal();
  return s2.bans.find((b) => b.identifier === identifier) ?? null;
}

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
  return createRequest(title, null, "");
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
export async function logGamePlay(gameId: string, ip: string, userId?: string | null): Promise<void> {
  // only signed-in users count for leaderboard — guests are ignored
  if (!userId) return;
  await logVisit(ip, "play", "/play/"+gameId, userId);
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
// --- Moderation & user state ---
export function scanHtmlForRisks(html:string): string[] {
  const risks:string[]=[]
  if(/<script[^>]*src=["']https?:\/\/[^"']+["']/i.test(html)) risks.push("external-script")
  if(/eval\s*\(|Function\s*\(|\bimport\s*\(/i.test(html)) risks.push("obfuscated-code")
  if(/fetch\s*\(\s*["']https?:/i.test(html)) risks.push("external-fetch")
  if(/<iframe[^>]*src=["']https?:/i.test(html)) risks.push("iframe-embed")
  if(html.length> 2_000_000) risks.push("large-file")
  return risks
}
export interface UserState { id:string; favorites:string[]; playCounts:Record<string,number>; updatedAt:string }
export interface AuthUser { id:string; username:string; usernameLower:string; passwordHash:string; favoriteFoodHash:string; favoriteFoodNorm:string; createdAt:string }
export interface AuthSession { token:string; userId:string; createdAt:string; expiresAt:string }
export interface GameSave { userId:string; gameId:string; data:string; updatedAt:string }
export async function getUserState(id:string): Promise<UserState|null>{
  if(getMode()==="postgres"){
    try{
      const rows = await pgQuery<{payload:string}>('SELECT payload FROM user_state WHERE id=$1',[id])
      if(rows[0]?.payload) return JSON.parse(rows[0].payload as string)
    }catch{}
    return null
  }
  const s = await readLocal() as any
  const map = (s.userStates||{}) as Record<string,UserState>
  return map[id]||null
}
export async function setUserState(id:string, state: Omit<UserState,'id'|'updatedAt'>): Promise<UserState>{
  const full: UserState = { id, ...state, updatedAt: new Date().toISOString() }
  if(getMode()==="postgres"){
    try{
      await pgQuery('CREATE TABLE IF NOT EXISTS user_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW())')
      await pgQuery('INSERT INTO user_state (id,payload) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, updatedAt=NOW()',[id, JSON.stringify(full)])
    }catch{}
    return full
  }
  await withLocalLock(async (store:any)=>{
    store.userStates = store.userStates || {}
    store.userStates[id]=full
  })
  return full
}

function hashPassword(password:string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return salt + ':' + hash
}
function verifyPassword(password:string, stored:string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if(!salt || !hash) return false
    const derived = scryptSync(password, salt, 64).toString('hex')
    const a = Buffer.from(hash, 'hex')
    const b = Buffer.from(derived, 'hex')
    if(a.length !== b.length) return false
    return timingSafeEqual(a,b)
  } catch { return false }
}
function normFood(s:string){ return s.trim().toLowerCase().replace(/\s+/g,' ') }
function hashFood(food:string): string {
  const n = normFood(food)
  const salt = randomBytes(8).toString('hex')
  const hash = scryptSync(n, salt, 32).toString('hex')
  return salt+':'+hash
}
function verifyFood(food:string, stored:string, norm:string|undefined): boolean {
  const n = normFood(food)
  if(norm && n===norm) return true
  try{
    const [salt, hash] = stored.split(':')
    if(!salt||!hash) return false
    const derived = scryptSync(n, salt, 32).toString('hex')
    return timingSafeEqual(Buffer.from(hash,'hex'), Buffer.from(derived,'hex'))
  }catch{ return false }
}

export async function createAuthUser(username:string, password:string, favoriteFood:string): Promise<AuthUser>{
  const usernameTrim = username.trim()
  const usernameLower = usernameTrim.toLowerCase()
  if(!/^[a-z0-9_]{3,20}$/.test(usernameLower)) throw new Error('Username must be 3-20 letters, numbers or _')
  const pwErr = isStrongPassword(password)
  if (pwErr) throw new Error(pwErr)
  if(!favoriteFood.trim()) throw new Error('Favorite food is required')
  if(getMode()==="postgres"){
    await migrate()
    const exists = await pgQuery<{id:string}>('SELECT id FROM auth_user WHERE username_lower=$1 LIMIT 1',[usernameLower])
    if(exists.length) throw new Error('Username taken')
    const id=randomUUID()
    const passwordHash=hashPassword(password)
    const favoriteFoodHash=hashFood(favoriteFood)
    const favoriteFoodNorm=normFood(favoriteFood)
    const createdAt=new Date().toISOString()
    await pgQuery('INSERT INTO auth_user (id, username, username_lower, password_hash, favorite_food_hash, favorite_food_norm, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',[id, usernameTrim, usernameLower, passwordHash, favoriteFoodHash, favoriteFoodNorm, createdAt])
    return { id, username: usernameTrim, usernameLower, passwordHash, favoriteFoodHash, favoriteFoodNorm, createdAt }
  }
  let user!: AuthUser
  await withLocalLock(async (s:any) => {
    if(s.users.find((u:any)=> u.usernameLower===usernameLower)) throw new Error('Username taken')
    const id=randomUUID()
    const passwordHash=hashPassword(password)
    const favoriteFoodHash=hashFood(favoriteFood)
    const favoriteFoodNorm=normFood(favoriteFood)
    const createdAt=new Date().toISOString()
    user={ id, username: usernameTrim, usernameLower, passwordHash, favoriteFoodHash, favoriteFoodNorm, createdAt }
    s.users.push(user)
  })
  return user
}
export async function findAuthUserByUsername(username:string): Promise<AuthUser|null>{
  const lower=username.trim().toLowerCase()
  if(getMode()==="postgres"){
    await migrate()
    const rows=await pgQuery<any>('SELECT id, username, username_lower as "usernameLower", password_hash as "passwordHash", favorite_food_hash as "favoriteFoodHash", favorite_food_norm as "favoriteFoodNorm", created_at as "createdAt" FROM auth_user WHERE username_lower=$1 LIMIT 1',[lower])
    return rows[0] as AuthUser || null
  }
  const s=await readLocal() as any
  return s.users.find((u:any)=> u.usernameLower===lower) || null
}
export async function findAuthUserById(id:string): Promise<AuthUser|null>{
  if(getMode()==="postgres"){
    await migrate()
    const rows=await pgQuery<any>('SELECT id, username, username_lower as "usernameLower", password_hash as "passwordHash", favorite_food_hash as "favoriteFoodHash", favorite_food_norm as "favoriteFoodNorm", created_at as "createdAt" FROM auth_user WHERE id=$1 LIMIT 1',[id])
    return rows[0] as AuthUser || null
  }
  const s=await readLocal() as any
  return s.users.find((u:any)=> u.id===id) || null
}
export async function verifyAuthUser(username:string, password:string): Promise<AuthUser|null>{
  const u=await findAuthUserByUsername(username)
  if(!u) return null
  if(!verifyPassword(password, u.passwordHash)) return null
  return u
}
export async function verifyFavoriteFood(username:string, food:string): Promise<boolean>{
  const u=await findAuthUserByUsername(username)
  if(!u) return false
  return verifyFood(food, u.favoriteFoodHash, u.favoriteFoodNorm)
}
export async function resetAuthPassword(username:string, newPassword:string): Promise<void>{
  const pwErr = isStrongPassword(newPassword)
  if (pwErr) throw new Error(pwErr)
  const hash=hashPassword(newPassword)
  if(getMode()==="postgres"){
    await migrate()
    await pgQuery('UPDATE auth_user SET password_hash=$2 WHERE username_lower=$1',[username.trim().toLowerCase(), hash])
    return
  }
  await withLocalLock(async (s:any)=>{
    const u=s.users.find((x:any)=> x.usernameLower===username.trim().toLowerCase())
    if(u) u.passwordHash=hash
  })
}
export async function createSession(userId:string): Promise<AuthSession>{
  const token=randomBytes(32).toString('hex')
  const createdAt=new Date().toISOString()
  const expiresAt=new Date(Date.now()+ 30*24*3600*1000).toISOString()
  const sess:AuthSession={ token, userId, createdAt, expiresAt }
  if(getMode()==="postgres"){
    await migrate()
    await pgQuery('INSERT INTO auth_session (token, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4)',[token, userId, createdAt, expiresAt])
    return sess
  }
  await withLocalLock(async (s:any) => {
    s.sessions.push(sess)
    s.sessions=s.sessions.slice(-500)
  })
  return sess
}
export async function getSession(token:string): Promise<AuthSession|null>{
  if(!token) return null
  if(getMode()==="postgres"){
    await migrate()
    const rows=await pgQuery<any>('SELECT token, user_id as "userId", created_at as "createdAt", expires_at as "expiresAt" FROM auth_session WHERE token=$1 LIMIT 1',[token])
    const r=rows[0] as AuthSession
    if(!r) return null
    if(new Date(r.expiresAt) < new Date()){ await pgQuery('DELETE FROM auth_session WHERE token=$1',[token]); return null }
    return r
  }
  const s=await readLocal() as any
  const sess=s.sessions.find((x:any)=> x.token===token) as AuthSession|null
  if(!sess) return null
  if(new Date(sess.expiresAt) < new Date()){ s.sessions=s.sessions.filter((x:any)=> x.token!==token); await writeLocal(s); return null }
  return sess
}
export async function deleteSession(token:string): Promise<void>{
  if(getMode()==="postgres"){ await migrate(); await pgQuery('DELETE FROM auth_session WHERE token=$1',[token]); return }
  await withLocalLock(async (s:any)=>{
    s.sessions=s.sessions.filter((x:any)=> x.token!==token)
  })
}
export async function getUserFromToken(token:string): Promise<AuthUser|null>{
  const sess=await getSession(token)
  if(!sess) return null
  return findAuthUserById(sess.userId)
}
export async function getSave(userId:string, gameId:string): Promise<GameSave|null>{
  if(getMode()==="postgres"){
    await migrate()
    const rows=await pgQuery<any>('SELECT user_id as "userId", game_id as "gameId", data, updated_at as "updatedAt" FROM game_save WHERE user_id=$1 AND game_id=$2 LIMIT 1',[userId, gameId])
    return rows[0] as GameSave||null
  }
  const s=await readLocal() as any
  return s.saves.find((x:any)=> x.userId===userId && x.gameId===gameId) || null
}
export async function setSave(userId:string, gameId:string, data:string): Promise<GameSave>{
  const updatedAt=new Date().toISOString()
  const save:GameSave={ userId, gameId, data: data.slice(0, 500_000), updatedAt }
  if(getMode()==="postgres"){
    await migrate()
    await pgQuery('INSERT INTO game_save (user_id, game_id, data, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, game_id) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at',[userId, gameId, save.data, updatedAt])
    return save
  }
  await withLocalLock(async (s:any) => {
    const idx=s.saves.findIndex((x:any)=> x.userId===userId && x.gameId===gameId)
    if(idx>=0) s.saves[idx]=save
    else s.saves.push(save)
    if(s.saves.length>5000) s.saves=s.saves.slice(-5000)
  })
  return save
}
export async function listSaves(userId:string): Promise<GameSave[]>{
  if(getMode()==="postgres"){
    await migrate()
    return pgQuery<any>('SELECT user_id as "userId", game_id as "gameId", updated_at as "updatedAt" FROM game_save WHERE user_id=$1 ORDER BY updated_at DESC',[userId]) as Promise<GameSave[]>
  }
  const s=await readLocal() as any
  return s.saves.filter((x:any)=> x.userId===userId).map((x:any)=> ({ userId:x.userId, gameId:x.gameId, updatedAt:x.updatedAt }))
}

export async function listRequests(): Promise<GameRequest[]> {
  if (getMode() === "postgres") {
    try{
      return await pgQuery<GameRequest>(
        'SELECT "id","title","icon","status","createdAt",COALESCE("votes",1) as "votes" FROM "game_request" ORDER BY COALESCE("votes",0) DESC, "createdAt" DESC',
      );
    }catch{
      return pgQuery<GameRequest>('SELECT "id","title","icon","status","createdAt" FROM "game_request" ORDER BY "createdAt" DESC').then(rs=> rs.map(r=> ({...r, votes:1})));
    }
  }
  const s = await readLocal();
  return s.requests
    .map(({ html: _h, ...rest }) => ({...rest, votes: (rest as any).votes||1}))
    .sort((a, b) => ((b as any).votes||0) - ((a as any).votes||0) || (a.createdAt < b.createdAt ? 1 : -1));
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
  await withLocalLock(async (s) => {
    const r = s.requests.find((x) => x.id === id);
    if (r) r.status = status;
  });
}

export async function deleteRequest(id: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery('DELETE FROM "game_request" WHERE "id"=$1', [id]);
    return;
  }
  await withLocalLock(async (s) => {
    s.requests = s.requests.filter((x) => x.id !== id);
  });
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
    await withLocalLock(async (s) => {
      s.games = s.games.filter((g) => g.id !== id);
      s.games.push({ id, title, icon, html, createdAt });
    });
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
  await withLocalLock(async (s) => {
    s.games = s.games.filter((g) => g.id !== id);
  });
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
