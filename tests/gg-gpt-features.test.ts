import test from "node:test";
import assert from "node:assert/strict";
import { games } from "../lib/games";
import {
  detectFeature, tasteCard, compareGames, sessionPlanner, catalogueQuiz,
  discoveryChallenge, genreExplainer, backlogTriage, progressReport,
} from "../lib/gg-gpt/features";

const ALL = games.map(g => ({ id: g.id, title: g.title, genre: g.genre, tone: g.tone, description: g.description, proxy: g.proxy }));
const STATE = { playCounts: { "doom-js13k": 12, quake: 5, suika: 2 }, favorites: ["quake"], recentlyPlayed: ["doom-js13k", "suika"] };

test("detects each of the ten feature requests", () => {
  const cases: Array<[string, string]> = [
    ["what kind of player am I", "taste-card"],
    ["compare Doom (13 KB) and Quake", "compare"],
    ["what should I play with 20 minutes", "backlog-triage"],
    ["what is a puzzle game", "genre-explainer"],
    ["how do I play Suika controls", "controls-help"],
    ["quiz me on the catalogue", "catalogue-quiz"],
    ["plan a 45 minute session", "session-planner"],
    ["give me my progress report", "progress-report"],
    ["challenge me with something new", "discovery-challenge"],
    ["which achievement is closest", "achievement-coach"],
  ];
  for (const [msg, id] of cases) assert.equal(detectFeature(msg)?.feature, id, msg);
});

test("ordinary chat is not hijacked by a feature", () => {
  assert.equal(detectFeature("what is a quokka"), null);
  assert.equal(detectFeature("what is the latest news about ISRO"), null);
});

test("taste card reports real numbers, not adjectives", () => {
  const r = tasteCard(STATE, ALL);
  assert.match(r.text, /19 launches across 3 games/);
  assert.match(r.text, /Shooter/);
  assert.match(r.text, /% of everything you play/);
});

test("taste card handles an empty history honestly", () => {
  const r = tasteCard({ playCounts: {}, favorites: [], recentlyPlayed: [] }, ALL);
  assert.match(r.text, /nothing to read yet/);
});

test("compare only reports catalogue truth", () => {
  const r = compareGames("doom-js13k", "quake", ALL, STATE);
  assert.match(r.text, /Doom \(13 KB\)/);
  assert.match(r.text, /Your launches/);
});

test("compare of a made-up game refuses instead of inventing", () => {
  const r = compareGames("halo 9", "doom-js13k", ALL);
  assert.match(r.text, /could not find/);
});

test("session planner respects the time budget and never repeats a game", () => {
  for (const budget of [12, 20, 45, 90]) {
    const r = sessionPlanner(budget, ALL);
    const ids = [...r.text.matchAll(/\/g\/([\w-]+)/g)].map(m => m[1]);
    assert.ok(ids.length >= 2, `${budget} min should schedule a game`);
    assert.equal(new Set(ids).size, ids.length, "no game twice in one session");
    const total = [...r.text.matchAll(/\((\d+) min\)/g)].reduce((a, x) => a + Number(x[1]), 0);
    assert.ok(total <= budget, `${budget} min budget scheduled ${total} min`);
  }
});

test("quiz options are distinct genres with exactly one correct answer", () => {
  for (let run = 0; run < 5; run++) {
    const r = catalogueQuiz(ALL, 3);
    const answers = (r.data as { answers: string[] }).answers;
    assert.equal(answers.length, 3);
    const blocks = r.text.split(/\*\*Q\d\.\*\*/).slice(1);
    for (const b of blocks) {
      // Only the option line, never the answers block at the end.
      const line = b.split("\n").find(l => /^a\)/.test(l.trim())) ?? "";
      const opts = [...line.matchAll(/([a-d])\) ([A-Za-z/ ]+?)(?=\s{2,}|$)/g)].map(m => m[2].trim());
      assert.equal(opts.length, 4, `four options, got ${opts.join(", ")}`);
      assert.equal(new Set(opts).size, 4, `options must be distinct, got ${opts.join(", ")}`);
    }
    for (const a of answers) assert.match(a, /^\d: [a-d]\) /);
  }
});

test("discovery challenge and genre explainer use real ids", () => {
  const ids = new Set(ALL.map(g => g.id));
  assert.ok(ids.has((discoveryChallenge(STATE, ALL).data as { pick: string }).pick));
  assert.match(genreExplainer("Puzzle", ALL, STATE).text, /\/g\//);
});

test("backlog triage and progress report are grounded in the history", () => {
  assert.match(backlogTriage(STATE, ALL, 30).text, /30 minutes/);
  assert.match(progressReport(STATE, ALL).text, /19/);
});
