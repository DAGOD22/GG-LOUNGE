/**
 * Postgres connection, URL discovery, schema migration and the query helper.
 * Falls back to a local JSON store (see ./local-store) when no URL is present.
 */
import { Pool } from "pg";
import type { DbMode } from "./core";

/**
 * Connection string for the managed Postgres we run on.
 *
 * Vercel's Neon/Postgres integrations inject POSTGRES_URL (and friends) rather
 * than DATABASE_URL, so looking only at DATABASE_URL dropped every serverless
 * deployment onto the local JSON fallback — which is read-only on Vercel, making
 * sign-up/sign-in appear broken. Accept the integration names, and repair the
 * URL if the integration hands us one without a scheme or with a dbname that
 * the pooled endpoint does not accept.
 */
export function getDatabaseUrl(): string | null {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  ];
  for (const raw of candidates) {
    const value = raw?.trim();
    if (!value) continue;
    let url = value;
    if (!/^postgres(ql)?:\/\//i.test(url)) url = `postgresql://${url}`;
    try {
      const parsed = new URL(url);
      if (!parsed.searchParams.get("sslmode") && !/localhost|127\.0\.0\.1/.test(parsed.hostname)) {
        parsed.searchParams.set("sslmode", "require");
      }
      return parsed.href;
    } catch {
      continue;
    }
  }
  return null;
}

/** True when this process can't persist anything (serverless, no database). */
export function isEphemeralHost(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

export function getMode(): DbMode {
  return getDatabaseUrl() ? "postgres" : "local";
}

/* ---------------- Postgres ---------------- */

let pool: Pool | null = null;
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl() || undefined,
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
          "userId" TEXT REFERENCES "auth_user"("id") ON DELETE SET NULL,
          "username" TEXT
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
        CREATE TABLE IF NOT EXISTS "user_achievement" (
          "user_id" TEXT NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
          "game_id" TEXT NOT NULL,
          "achievement_id" TEXT NOT NULL,
          "progress" INTEGER NOT NULL DEFAULT 0,
          "unlocked" BOOLEAN NOT NULL DEFAULT FALSE,
          "unlocked_at" TIMESTAMPTZ,
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("user_id", "achievement_id")
        );
        CREATE INDEX IF NOT EXISTS "user_achievement_user_idx" ON "user_achievement" ("user_id");
        CREATE INDEX IF NOT EXISTS "user_achievement_game_idx" ON "user_achievement" ("game_id");
        CREATE TABLE IF NOT EXISTS "user_game_stats" (
          "user_id" TEXT NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
          "game_id" TEXT NOT NULL,
          "plays" INTEGER NOT NULL DEFAULT 0,
          "time_seconds" INTEGER NOT NULL DEFAULT 0,
          "last_played_at" TIMESTAMPTZ,
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("user_id", "game_id")
        );
        CREATE TABLE IF NOT EXISTS "gate_state" (
          "ip" TEXT PRIMARY KEY,
          "fails" INTEGER NOT NULL DEFAULT 0,
          "ban_level" INTEGER NOT NULL DEFAULT 0,
          "banned_until" TIMESTAMPTZ,
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS "upvote_cooldown" (
          "ip" TEXT NOT NULL,
          "request_id" TEXT NOT NULL,
          "last_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("ip", "request_id")
        );
        CREATE INDEX IF NOT EXISTS "upvote_cooldown_last_idx" ON "upvote_cooldown" ("last_at");
      `);
      // Tolerate tables created by older schemas.
      await p.query(`ALTER TABLE "banned_user" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ`);
      await p.query(`ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "userId" TEXT`);
      await p.query(`ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "username" TEXT`);
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

export async function pgQuery<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await migrate();
  const res = await getPool().query(text, params as never[]);
  return res.rows as T[];
}

export type { DbMode };
