/**
 * Does the database actually have the schema this build expects?
 *
 * A missing column took the room API down for a day and every request reported
 * it as a generic "server is unavailable". Nothing in the app could answer the
 * simple question "is this database upgraded?", so nobody could tell a broken
 * deploy from a broken database without reading the source.
 *
 * This asks the one question worth asking from outside: are all the tables
 * here? It is deliberately cheap — one `information_schema` query — because it
 * runs on every health check.
 */
import { getMode, pgQuery } from "./connection";

/**
 * Every table the app reads or writes.
 *
 * Kept as a literal list rather than derived from the migration script on
 * purpose: if a table is added to the migration but not here, the health check
 * says nothing about it, and if it is here but missing from the database, that
 * is exactly the drift worth reporting.
 */
export const CORE_TABLES = [
  "banned_user",
  "visits",
  "game_request",
  "published_game",
  "upload_parts",
  "reports",
  "auth_user",
  "auth_session",
  "game_save",
  "user_achievement",
  "user_game_stats",
  "gate_state",
  "upvote_cooldown",
  "live_presence",
  "live_event",
  "live_budget",
  "coop_room",
  "coop_relay",
  "chat_room",
  "chat_message",
  "chat_presence",
  "chat_media",
] as const;

export type SchemaStatus = {
  /** 'postgres' or 'local'; the check only means something for postgres. */
  mode: "postgres" | "local";
  /** True when every table in CORE_TABLES exists. Always true for local. */
  ok: boolean;
  /** Table names that are missing. Empty when ok. */
  missing: string[];
  /** Set when the check itself could not run. */
  error?: string;
};

export async function schemaStatus(): Promise<SchemaStatus> {
  const mode = getMode();
  if (mode !== "postgres") return { mode: "local", ok: true, missing: [] };

  try {
    // Listing the schema and filtering here rather than filtering in SQL keeps
    // this working on every Postgres and on the in-memory one the tests use,
    // where `= ANY($1)` is not supported. The table count is in the dozens, so
    // the extra rows cost nothing.
    const rows = await pgQuery<{ table_name: string }>(
      `SELECT "table_name" FROM "information_schema"."tables" WHERE "table_schema" = 'public'`,
    );
    const present = new Set(rows.map(row => row.table_name));
    const missing = CORE_TABLES.filter(table => !present.has(table));
    return { mode: "postgres", ok: missing.length === 0, missing };
  } catch (error) {
    // The check must never take the health endpoint down with it.
    return {
      mode: "postgres",
      ok: false,
      missing: [],
      error: (error as Error)?.message ?? "schema check failed",
    };
  }
}
