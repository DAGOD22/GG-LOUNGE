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

        /* ---- live presence ----------------------------------------------
           Ghost cursors and the activity feed. Both tables are written to on
           nearly every page view, so they are kept deliberately small: a
           presence row is replaced wholesale rather than appended to, and the
           feed is capped below. seen_at is indexed because every read is
           "who was here in the last N seconds". */
        CREATE TABLE IF NOT EXISTS "live_presence" (
          "id" TEXT PRIMARY KEY,
          "username" TEXT,
          "x" REAL NOT NULL DEFAULT 50,
          "y" REAL NOT NULL DEFAULT 50,
          "cursor_preset" TEXT NOT NULL DEFAULT 'system',
          "cursor_image" TEXT NOT NULL DEFAULT '',
          "cursor_size" INTEGER NOT NULL DEFAULT 40,
          "accent" TEXT NOT NULL DEFAULT '#d7f34a',
          "game" TEXT,
          "seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "live_presence_seen_idx" ON "live_presence" ("seen_at" DESC);
        /* What a player is *doing*, not only which game they have open.
           "in the proxy, on youtube.com" and "reading /apps" are as
           interesting in the feed as a game launch, and without these the
           roster could only ever answer "which game". */
        ALTER TABLE "live_presence" ADD COLUMN IF NOT EXISTS "kind" TEXT;
        ALTER TABLE "live_presence" ADD COLUMN IF NOT EXISTS "label" TEXT;
        CREATE TABLE IF NOT EXISTS "live_event" (
          "id" BIGSERIAL PRIMARY KEY,
          "kind" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "message" TEXT NOT NULL,
          "game" TEXT,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        /* The feed shows "what they opened", so it carries the same kind/label
           pair the roster does, plus the destination for proxy visits. */
        ALTER TABLE "live_event" ADD COLUMN IF NOT EXISTS "target" TEXT;
        ALTER TABLE "live_event" ADD COLUMN IF NOT EXISTS "label" TEXT;
        CREATE INDEX IF NOT EXISTS "live_event_created_idx" ON "live_event" ("created_at" DESC);
        CREATE TABLE IF NOT EXISTS "live_budget" (
          "key" TEXT PRIMARY KEY,
          "count" INTEGER NOT NULL DEFAULT 0,
          "resetAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "live_budget_reset_idx" ON "live_budget" ("resetAt");
        /* ---- co-op signalling -------------------------------------------
           Six-character room codes are a lookup key for the WebRTC handshake,
           not the transport: the offer/answer is parked here for a couple of
           minutes, then the game traffic is peer to peer. Rows are deleted on
           join and aged out, so this never accumulates dead rooms. */
        CREATE TABLE IF NOT EXISTS "coop_room" (
          "code" TEXT PRIMARY KEY,
          "offer" TEXT NOT NULL DEFAULT '',
          "answer" TEXT NOT NULL DEFAULT '',
          "host_name" TEXT NOT NULL DEFAULT '',
          "guest_name" TEXT NOT NULL DEFAULT '',
          "status" TEXT NOT NULL DEFAULT 'waiting',
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "touched_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "coop_room_touched_idx" ON "coop_room" ("touched_at" DESC);

        /* ---- CHATVERSE --------------------------------------------------
           The private chat behind the admin door. Rooms and messages are
           separate tables so listing rooms stays one cheap query, and the
           message id is a BIGSERIAL because ordering is by id, not by time:
           two messages in the same millisecond must not be lost or doubled.
           Nothing seeds these tables — an empty room is an empty room. */
        CREATE TABLE IF NOT EXISTS "chat_room" (
          "id" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "topic" TEXT NOT NULL DEFAULT '',
          "created_by" TEXT NOT NULL DEFAULT '',
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "last_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "chat_room_last_idx" ON "chat_room" ("last_at" DESC);
        CREATE TABLE IF NOT EXISTS "chat_message" (
          "id" BIGSERIAL PRIMARY KEY,
          "room" TEXT NOT NULL,
          "author" TEXT NOT NULL,
          "body" TEXT NOT NULL DEFAULT '',
          "media" TEXT NOT NULL DEFAULT '',
          "media_name" TEXT NOT NULL DEFAULT '',
          "at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "chat_message_room_idx" ON "chat_message" ("room", "id");
        CREATE TABLE IF NOT EXISTS "chat_presence" (
          "room" TEXT NOT NULL,
          "who" TEXT NOT NULL,
          "seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("room", "who")
        );
        /* Uploaded screenshots. The bytes live in their own row so listing a
           room never drags image data along with it. */
        CREATE TABLE IF NOT EXISTS "chat_media" (
          "id" TEXT PRIMARY KEY,
          "room" TEXT NOT NULL DEFAULT '',
          "kind" TEXT NOT NULL DEFAULT 'image',
          "mime" TEXT NOT NULL,
          "bytes" BYTEA NOT NULL,
          "size" INTEGER NOT NULL,
          "name" TEXT NOT NULL DEFAULT '',
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "chat_media_created_idx" ON "chat_media" ("created_at" DESC);
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
