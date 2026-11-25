import test from "node:test";
import assert from "node:assert/strict";
import { searchQuery } from "../lib/gg-gpt/tools";

test("turns a question into a query an engine can answer", () => {
  assert.equal(
    searchQuery("what is the latest news about Indian Space Research Organisation"),
    "Indian Space Research Organisation latest news",
  );
  assert.equal(searchQuery("latest news on ISRO"), "ISRO latest news");
  assert.equal(searchQuery("tell me about the weather in Adelaide"), "weather Adelaide");
});

test("never returns an empty query", () => {
  for (const q of ["what?", "?", "the", "hi"]) assert.ok(searchQuery(q).length > 0, q);
});

test("keeps the subject, drops the scaffolding", () => {
  const q = searchQuery("who won the AFL grand final");
  assert.match(q, /AFL grand final/);
  assert.doesNotMatch(q, /^who /i);
});

test("strips invented citations without touching real text", async () => {
  const { sanitizeAnswer } = await import("../lib/gg-gpt/engine");
  assert.equal(
    sanitizeAnswer("ISRO launched a satellite 【1】 and it worked [2]."),
    "ISRO launched a satellite and it worked.",
  );
  assert.equal(sanitizeAnswer("Plain answer."), "Plain answer.");
});
