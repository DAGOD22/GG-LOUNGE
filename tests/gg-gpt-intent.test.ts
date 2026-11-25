import test from "node:test";
import assert from "node:assert/strict";
import { detectIntent } from "../lib/gg-gpt/intent";

test("a factual 'what is X' becomes a sourced lookup", () => {
  for (const q of ["what is a quokka", "who is Ada Lovelace?", "what's the Eiffel Tower"]) {
    const i = detectIntent(q);
    assert.ok(i.topic, `${q} should ask Wikipedia`);
    assert.ok(!i.search, `${q} should not search news`);
  }
});

test("recency questions stay in search, not lookup", () => {
  const i = detectIntent("what is the latest news about ISRO");
  assert.equal(i.topic, undefined);
  assert.ok(i.search);
});

test("game recommendations never turn into encyclopedia lookups", () => {
  const i = detectIntent("what is a good game to play");
  assert.equal(i.topic, undefined);
  assert.ok(i.catalogue);
});
