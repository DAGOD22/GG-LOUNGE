/**
 * The migration has to survive a database that predates it.
 *
 * Production showed "The room server is unavailable: column \"room\" does not
 * exist" for a whole day. The cause was not the room code: the schema was sent
 * as one multi-statement query, Postgres runs that as a single implicit
 * transaction, and a stale `CREATE INDEX ... ("room","id")` on an old
 * `chat_message` aborted everything after it. Every table declared below that
 * index was silently never created.
 *
 * These tests run the *real* exported SQL against pg-mem (an in-memory Postgres)
 * with deliberately wrong legacy tables in the way.
 *
 * pg-mem is a parser with gaps, so a handful of tables are pre-created with
 * their final shape via its native API where it cannot parse our DDL. That does
 * not weaken what is being tested: the question is whether the statements that
 * touch old, malformed tables can run without taking the schema down.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { newDb, type IMemoryDb } from "pg-mem";
import {
  SCHEMA_STATEMENTS,
  REPAIR_STATEMENTS,
  LEGACY_ROOM_ID_STATEMENTS,
  splitStatements,
  runStatements,
} from "../lib/db/connection";

type Failure = { statement: string; message: string };

/** pg-mem's lexer is ASCII-only; the real Postgres is not. */
function portable(sql: string): string {
  return sql.replace(/[^\x00-\x7F]/g, "-");
}

/**
 * Run exactly what migrate() runs, in the same order.
 *
 * `allow` names statements that may legitimately fail on this harness because
 * pg-mem itself cannot execute them; those are filtered out of the result so a
 * real regression still shows up as a failure.
 */
async function applyMigration(
  db: IMemoryDb,
  allow: (statement: string) => boolean = () => false,
): Promise<Failure[]> {
  const pool = new (db.adapters.createPg().Pool)();
  const query = (sql: string) => pool.query(portable(sql));
  const failures: Failure[] = [];

  const record = (failed: Failure[]) => {
    for (const failure of failed) {
      if (!allow(failure.statement)) failures.push(failure);
    }
  };

  record((await runStatements(query, SCHEMA_STATEMENTS)).failed);
  for (const statement of REPAIR_STATEMENTS) {
    record((await runStatements(query, statement)).failed);
  }
  for (const statement of LEGACY_ROOM_ID_STATEMENTS) {
    try {
      await query(statement);
    } catch {
      /* no room_id column on this database */
    }
  }
  return failures;
}

function baseDb(): IMemoryDb {
  const db = newDb();
  // pg-mem 3 cannot parse these three CREATE TABLEs (it rejects them as
  // "parts not read by the query planner"), so they are created natively with
  // the same final shape our DDL would produce. Everything the migration then
  // does to them — the indexes over their timestamp columns — still has to run.
  db.public.none(`
    CREATE TABLE "auth_user" (
      "id" TEXT PRIMARY KEY,
      "username" TEXT NOT NULL,
      "username_lower" TEXT UNIQUE NOT NULL,
      "password_hash" TEXT NOT NULL,
      "favorite_food_hash" TEXT NOT NULL,
      "favorite_food_norm" TEXT NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE "live_presence" (
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
    CREATE TABLE "live_event" (
      "id" BIGSERIAL PRIMARY KEY,
      "kind" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "game" TEXT,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  return db;
}

/**
 * pg-mem cannot re-parse CREATE TABLE against a table that already exists, and
 * chokes on three of our DDLs. Those statements are skipped, never replaced: if
 * the real statement would have failed in Postgres, the tests that assert on
 * the resulting columns still catch it.
 */
function pgMemCantRecreate(statement: string): boolean {
  return /CREATE TABLE IF NOT EXISTS "(auth_user|live_presence|live_event|chat_message|coop_room|coop_relay|chat_room|chat_presence|chat_media)"/.test(
    statement,
  );
}

function columns(db: IMemoryDb, table: string): string[] {
  const rows = db.public.many(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`,
  ) as Array<{ column_name: string }>;
  return rows.map((row) => row.column_name);
}

test("splitStatements ignores semicolons inside comments and keeps every statement", () => {
  const statements = splitStatements(`
    /* a comment; with a semicolon */
    CREATE TABLE "a" ("id" TEXT);
    -- trailing comment; also has one
    CREATE TABLE "b" ("id" TEXT);
  `);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /CREATE TABLE "a"/);
  assert.match(statements[1], /CREATE TABLE "b"/);
});

test("one broken statement does not stop the rest", async () => {
  const seen: string[] = [];
  const { failed, ran } = await runStatements(async (sql) => {
    seen.push(sql);
    if (sql.includes('"broken"')) throw new Error('column "room" does not exist');
  }, 'CREATE TABLE "ok" ("id" TEXT); CREATE INDEX "broken" ON "x" ("room"); CREATE TABLE "after" ("id" TEXT);');

  assert.equal(ran, 2);
  assert.equal(failed.length, 1);
  assert.match(failed[0].message, /column "room" does not exist/);
  assert.match(seen.at(-1)!, /CREATE TABLE "after"/, "the statement after the failure still ran");
});

test("a fresh database gets the full schema", async () => {
  const db = baseDb();
  const failures = await applyMigration(db, pgMemCantRecreate);
  assert.deepEqual(failures, [], `unexpected failures: ${JSON.stringify(failures, null, 2)}`);

  // The tables the room and chat code stand on all exist.
  for (const table of ["coop_room", "coop_relay", "chat_room", "chat_message", "chat_presence", "chat_media"]) {
    assert.ok(columns(db, table).length > 0, `${table} was not created`);
  }
});

test("an old chat_message with room_id is repaired, not fatal", async () => {
  // Exactly the production shape: no "room", no "media", no "media_name".
  const db = baseDb();
  db.public.none(`CREATE TABLE "chat_message" (
    "id" BIGSERIAL PRIMARY KEY,
    "room_id" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  db.public.none(`INSERT INTO "chat_message" ("room_id","author","body") VALUES ('abc123','ghost','old message')`);

  const failures = await applyMigration(db, pgMemCantRecreate);
  assert.deepEqual(failures, [], `migration still failing: ${JSON.stringify(failures, null, 2)}`);

  const names = columns(db, "chat_message");
  for (const required of ["room", "author", "body", "media", "media_name", "at"]) {
    assert.ok(names.includes(required), `chat_message is missing ${required}: ${names.join(",")}`);
  }

  // Old rows move across to the column the app actually queries.
  const rows = db.public.many(`SELECT "room","body" FROM "chat_message"`) as Array<{ room: string; body: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].room, "abc123", "room_id values were not copied into room");
});

test("the broken index from production now runs", async () => {
  // The exact statement that failed, on the exact table shape that broke it.
  const db = baseDb();
  db.public.none(`CREATE TABLE "chat_message" ("id" BIGSERIAL PRIMARY KEY, "room_id" TEXT NOT NULL, "author" TEXT NOT NULL, "body" TEXT NOT NULL DEFAULT '', "at" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

  const failures = await applyMigration(db, pgMemCantRecreate);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));

  // And the app's own query — the one that produced the error message — works.
  const rows = db.public.many(`SELECT "id","room","author","body" FROM "chat_message" WHERE "room" = 'abc123'`);
  assert.deepEqual(rows, []);
});

test("an old coop_room missing its columns is repaired", async () => {
  const db = baseDb();
  db.public.none(`CREATE TABLE "coop_room" ("code" TEXT PRIMARY KEY)`);

  const failures = await applyMigration(db, pgMemCantRecreate);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));

  const names = columns(db, "coop_room");
  for (const required of ["offer", "answer", "host_name", "guest_name", "status", "touched_at"]) {
    assert.ok(names.includes(required), `coop_room is missing ${required}: ${names.join(",")}`);
  }
  // Signalling works against the upgraded table.
  db.public.none(`INSERT INTO "coop_room" ("code","offer","status") VALUES ('ABC123','v=0','waiting')`);
  const [row] = db.public.many(`SELECT "code","status" FROM "coop_room" WHERE "code" = 'ABC123'`);
  assert.equal(row.status, "waiting");
});

test("no index is declared inside the create block", () => {
  // Guards the original bug: an index in that batch is what failed and what
  // silently skipped every table below it.
  assert.doesNotMatch(
    SCHEMA_STATEMENTS,
    /CREATE INDEX[\s\S]*?"chat_message"\s*\("room"/,
    "the chat_message room index must live in REPAIR_STATEMENTS, after the back-fills",
  );
  assert.ok(
    REPAIR_STATEMENTS.some((sql) => /chat_message_room_idx/.test(sql)),
    "the index is missing from the repair list, so it would never be created",
  );
});

test("columns are back-filled before the indexes that depend on them", () => {
  const firstAlter = REPAIR_STATEMENTS.findIndex((sql) => /ALTER TABLE/.test(sql));
  const firstIndex = REPAIR_STATEMENTS.findIndex((sql) => /CREATE INDEX/.test(sql));
  assert.ok(firstAlter >= 0 && firstIndex > firstAlter, "indexes must come after the column repairs");
});

test("the room API's own queries run against a repaired legacy database", async () => {
  // The end of the story the user saw: not just "the column exists", but
  // create → read back → upsert, exactly as lib/db/coop.ts issues them.
  const db = baseDb();
  db.public.none(`CREATE TABLE "coop_room" ("code" TEXT PRIMARY KEY)`);

  const failures = await applyMigration(db, pgMemCantRecreate);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));

  const pool = new (db.adapters.createPg().Pool)();
  const now = new Date().toISOString();

  // The upsert every "Create a room" issues — it names every column.
  await pool.query(
    `INSERT INTO "coop_room" ("code","offer","answer","host_name","guest_name","status","created_at","touched_at")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT ("code") DO UPDATE SET
       "offer"=EXCLUDED."offer", "answer"=EXCLUDED."answer",
       "host_name"=EXCLUDED."host_name", "guest_name"=EXCLUDED."guest_name",
       "status"=EXCLUDED."status", "touched_at"=EXCLUDED."touched_at"`,
    ["ABC123", "v=0", "", "host", "", "waiting", now, now],
  );

  // The poll the guest runs.
  const read = await pool.query(
    `SELECT "code","offer","answer","host_name","guest_name","status",
            "created_at" AS "created_at","touched_at" AS "touched_at"
       FROM "coop_room" WHERE "code" = $1`,
    ["ABC123"],
  );
  assert.equal(read.rows.length, 1);
  assert.equal(read.rows[0].offer, "v=0");

  // The answer half of the handshake.
  await pool.query(`UPDATE "coop_room" SET "answer" = $1, "guest_name" = $2 WHERE "code" = $3`, [
    "v=0-answer",
    "guest",
    "ABC123",
  ]);
  const [row] = (
    await pool.query(`SELECT "answer","guest_name" FROM "coop_room" WHERE "code" = 'ABC123'`)
  ).rows;
  assert.equal(row.answer, "v=0-answer");
  assert.equal(row.guest_name, "guest");
});

test("a message written through the repaired chat table is readable", async () => {
  const db = baseDb();
  db.public.none(`CREATE TABLE "chat_message" ("id" BIGSERIAL PRIMARY KEY, "room_id" TEXT NOT NULL, "author" TEXT NOT NULL, "body" TEXT NOT NULL DEFAULT '', "at" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  db.public.none(`CREATE TABLE "chat_room" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL)`);

  const failures = await applyMigration(db, pgMemCantRecreate);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));

  const pool = new (db.adapters.createPg().Pool)();
  // postMessage's insert.
  await pool.query(
    `INSERT INTO "chat_message" ("room","author","body","media","media_name") VALUES ($1,$2,$3,$4,$5)`,
    ["abc123", "ghost", "hello after the fix", "", ""],
  );
  // The message count listRooms runs (uncorrelated here: pg-mem cannot plan a
  // correlated subquery, which is a harness limit and not a schema question).
  const [counted] = (
    await pool.query(
      `SELECT COUNT(*)::text AS "messages" FROM "chat_message" m WHERE m."room" = 'abc123'`,
    )
  ).rows;
  assert.equal(counted.messages, "1");

  // readMessages' select.
  const messages = await pool.query(
    `SELECT "id"::text AS "id","room","author","body","media","media_name","at"
       FROM "chat_message" WHERE "room" = $1 AND "id" > $2 ORDER BY "id" ASC LIMIT $3`,
    ["abc123", 0, 10],
  );
  assert.equal(messages.rows.length, 1);
  assert.equal(messages.rows[0].body, "hello after the fix");
});
