/**
 * The health endpoint has to be able to say "this database is out of date".
 *
 * That answer did not exist while prod was failing: every route reported a
 * generic "server unavailable", so a broken database and a broken deploy looked
 * identical from outside.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { newDb } from "pg-mem";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CORE_TABLES } from "../lib/db/schema-check";
import { SCHEMA_STATEMENTS, REPAIR_STATEMENTS } from "../lib/db/connection";

const source = readFileSync(path.join(process.cwd(), "lib/db/connection.ts"), "utf8");

test("every core table is actually created by the migration", () => {
  // A table listed here but never created would make the health check lie.
  for (const table of CORE_TABLES) {
    assert.match(
      SCHEMA_STATEMENTS,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`),
      `${table} is in CORE_TABLES but the migration never creates it`,
    );
  }
});

test("every table the migration creates is checked", () => {
  // The other direction: a new table nobody watches is drift nobody sees.
  const created = [...SCHEMA_STATEMENTS.matchAll(/CREATE TABLE IF NOT EXISTS "([a-z_]+)"/g)].map(m => m[1]);
  assert.ok(created.length > 15, `only found ${created.length} tables in the migration`);
  for (const table of created) {
    assert.ok(
      (CORE_TABLES as readonly string[]).includes(table),
      `${table} is created by the migration but missing from CORE_TABLES`,
    );
  }
});

test("the columns the room and chat code query are back-filled", () => {
  // These are the ones production was missing. Every one must have a repair.
  const repairs = REPAIR_STATEMENTS.join("\n");
  for (const [table, column] of [
    ["chat_message", "room"],
    ["chat_message", "media"],
    ["chat_message", "media_name"],
    ["coop_room", "touched_at"],
    ["coop_room", "offer"],
    ["chat_room", "last_at"],
  ]) {
    assert.match(
      repairs,
      new RegExp(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}"`),
      `${table}.${column} has no back-fill, so an old database stays broken`,
    );
  }
});

test("the schema check finds a missing table and passes a complete one", async () => {
  // Exercise the same query the health check runs, against pg-mem.
  const db = newDb();
  db.public.none(`CREATE TABLE "coop_room" ("code" TEXT PRIMARY KEY); CREATE TABLE "chat_message" ("id" BIGSERIAL PRIMARY KEY)`);
  const pool = new (db.adapters.createPg().Pool)();

  const check = async () => {
    const rows = await pool.query(
      `SELECT "table_name" FROM "information_schema"."tables" WHERE "table_schema" = 'public'`,
    );
    const present = new Set(rows.rows.map((r: { table_name: string }) => r.table_name));
    return CORE_TABLES.filter(table => !present.has(table));
  };

  const missing = await check();
  assert.ok(missing.includes("coop_relay"), "a missing table must be reported");
  assert.ok(!missing.includes("coop_room"), "a present table must not be reported");

  // Create everything and it comes back clean.
  for (const table of CORE_TABLES) {
    if (table === "coop_room" || table === "chat_message") continue;
    db.public.none(`CREATE TABLE "${table}" ("id" TEXT)`);
  }
  assert.deepEqual(await check(), []);
});

test("the migration source has no unguarded index over a repairable column", () => {
  // The original bug: an index inside the create batch, over a column an old
  // table might not have, aborting everything after it in one transaction.
  const createBlock = source.slice(
    source.indexOf("export const SCHEMA_STATEMENTS"),
    source.indexOf("export const REPAIR_STATEMENTS"),
  );
  // Only the columns that an older build may lack. "seen_at" on live_presence
  // and "last_at" on upvote_cooldown are safe in the create block: those tables
  // have only ever been created with them.
  for (const column of ["room", "touched_at", "created_by", "topic", "media_name"]) {
    assert.doesNotMatch(
      createBlock,
      new RegExp(`CREATE INDEX[^;]*\\("${column}"`),
      `an index over "${column}" is in the create block; it belongs in REPAIR_STATEMENTS`,
    );
  }
});
