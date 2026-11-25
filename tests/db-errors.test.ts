/**
 * What a player sees when the database misbehaves.
 *
 * The screenshot that started this was a raw Postgres message rendered at 24px
 * across the room panel: 'The room server is unavailable: column "room" does
 * not exist'. Accurate, unactionable, and unbounded in length.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { describeDbError } from "../lib/db/errors";

test("schema drift is described as ours to fix, and flagged", () => {
  const info = describeDbError(new Error('column "room" does not exist'));
  assert.equal(info.schema, true);
  assert.match(info.message, /database needs upgrading/i);
  assert.doesNotMatch(info.message, /column|room"|SQL/i, "no SQL jargon in the user-facing sentence");
});

test("a missing relation counts as drift too", () => {
  for (const message of [
    'relation "coop_room" does not exist',
    'column "touched_at" of relation "coop_room" does not exist',
  ]) {
    assert.equal(describeDbError(new Error(message)).schema, true, message);
  }
});

test("connection trouble is not blamed on the schema", () => {
  for (const message of [
    "connect ETIMEDOUT",
    "Connection terminated due to connection timeout",
    "ECONNREFUSED 10.0.0.1:5432",
    "sorry, too many clients already",
  ]) {
    const info = describeDbError(new Error(message));
    assert.equal(info.schema, false, message);
    assert.match(info.message, /try again/i, message);
  }
});

test("an unrecognised error never leaks SQL to the browser", () => {
  const info = describeDbError(
    new Error('syntax error at or near "INSERT INTO "chat_message" ("room","author")"'),
  );
  assert.doesNotMatch(info.message, /INSERT|syntax|chat_message/i);
  assert.match(info.message, /problem with that request/i);
  // The detail is kept, bounded, for the server log.
  assert.match(info.detail, /INSERT/);
  assert.ok(info.detail.length <= 300);
});

test("the detail is clipped even when the message is enormous", () => {
  const info = describeDbError(new Error("x".repeat(10_000)));
  assert.ok(info.detail.length <= 300, `detail was ${info.detail.length} chars`);
});

test("a non-Error throw does not crash the handler", () => {
  assert.equal(typeof describeDbError("plain string").message, "string");
  assert.equal(typeof describeDbError(undefined).message, "string");
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(typeof describeDbError(cyclic).message, "string");
});
