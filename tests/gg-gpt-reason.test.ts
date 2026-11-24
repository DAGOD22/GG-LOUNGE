import test from "node:test";
import assert from "node:assert/strict";
import { critiqueAnswer, followUp, mergeFollowUp, plan } from "../lib/gg-gpt/reason";
import { detectIntent } from "../lib/gg-gpt/intent";

test("critique strips hedging openers and trailing filler", () => {
  const c = critiqueAnswer("Sure! Adelaide is 19 degrees. I hope this helps!", { hasLiveData: true, askedForLive: true });
  assert.match(c.repaired ?? "", /^Adelaide is 19 degrees\.$/);
  assert.equal(c.issues.length > 0, true);
});

test("critique flags a model denying data it was given", () => {
  const c = critiqueAnswer("I can't access live weather data, sorry.", { hasLiveData: true, askedForLive: true });
  assert.ok(c.issues.includes("denies having data it was given"));
});

test("critique leaves a good answer untouched", () => {
  const good = "The quokka is a small macropod native to south-western Australia.";
  const c = critiqueAnswer(good, { hasLiveData: false, askedForLive: false });
  assert.equal(c.repaired, null);
});

test("follow-ups carry the previous subject", () => {
  const f = followUp("and tomorrow?", "what is the weather in Adelaide");
  assert.equal(f.isFollowUp, true);
  assert.match(f.subject ?? "", /weather Adelaide/i);
  assert.match(mergeFollowUp("and tomorrow?", f.subject!), /weather Adelaide — tomorrow/i);
});

test("a fresh question is not treated as a follow-up", () => {
  assert.equal(followUp("who won the 1998 world cup", "what is a quokka").isFollowUp, false);
});

test("plan names the tools and demands only those facts", () => {
  const i = detectIntent("what is the weather in Adelaide");
  const p = plan(i, "what is the weather in Adelaide");
  assert.equal(p.steps[0].tool, "weather");
  assert.match(p.narrative, /weather/);
  assert.equal(p.needsVerification, false);
});

test("a plain question gets no fake plan", () => {
  const p = plan(detectIntent("hello there"), "hello there");
  assert.equal(p.steps.length, 0);
  assert.match(p.narrative, /already know/);
});
