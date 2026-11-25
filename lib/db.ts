/**
 * GG-Lounge storage layer — public entry point.
 *
 * The implementation is split by concern under ./db/ and re-exported here so
 * existing `import { … } from "@/lib/db"` sites keep working:
 *
 *   core           types, byte limits, rate limiting
 *   connection     Postgres URL discovery, schema migration, pgQuery
 *   local-store    JSON file fallback used when no DATABASE_URL is set
 *   bans           bans, site password gate, escalating IP lockouts
 *   visits         visit log
 *   requests       game requests, upvotes, reports
 *   saves-auth     accounts, sessions, per-user state, game saves
 *   published-games request admin, publishing, published catalog
 *   uploads        chunked HTML upload assembly
 *   achievements   achievement progress and play stats
 *
 * Postgres is used when DATABASE_URL (or a Vercel/Neon variant) is present;
 * otherwise a local JSON file store is used, which is what dev and any
 * self-hosted instance fall back to.
 */
export * from "./db/core";
export * from "./db/connection";
export * from "./db/bans";
export * from "./db/visits";
export * from "./db/requests";
export * from "./db/saves-auth";
export * from "./db/published-games";
export * from "./db/uploads";
export * from "./db/achievements";
