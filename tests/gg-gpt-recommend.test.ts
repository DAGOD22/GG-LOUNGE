import test from "node:test";
import assert from "node:assert/strict";
import { games } from "../lib/games";
import { recommend, renderRecommendation, type PlaySignal } from "../lib/gg-gpt/recommend";

const CATALOGUE = games.map(g => ({
  id: g.id,
  title: g.title,
  genre: g.genre,
  tone: g.tone,
  description: g.description,
}));

/** Someone who has put real hours into id Software shooters. */
const VETERAN: PlaySignal = {
  playCounts: { "doom-js13k": 12, quake: 8, wolfenstein: 3 },
  favorites: ["quake"],
  recentlyPlayed: ["doom-js13k"],
};

test("recommends only real catalogue games with working links", () => {
  const ids = new Set(CATALOGUE.map(g => g.id));
  const r = recommend("what should I play tonight?", CATALOGUE, null);
  assert.equal(r.picks.length, 4);
  for (const p of r.picks) {
    assert.ok(ids.has(p.id), `${p.id} must be a real game`);
    assert.ok(p.reason.length > 3, "every pick explains itself");
  }
  assert.match(renderRecommendation(r), / — \/g\/[a-z0-9-]+ \(/);
});

test("an explicit genre request beats play history", () => {
  // The failure this guards against: telling a Doom veteran who asks for
  // something relaxing to play another shooter.
  const r = recommend("recommend something relaxing", CATALOGUE, VETERAN);
  for (const p of r.picks) {
    assert.notEqual(p.genre, "Shooter", `${p.title} is a shooter and they asked to relax`);
  }
});

test("history steers the answer when the request is open-ended", () => {
  const r = recommend("recommend something to play", CATALOGUE, VETERAN);
  assert.ok(
    r.picks.some(p => p.genre === "Shooter"),
    "a shooter fan with an open request should get shooters",
  );
});

test("never recommends what the user already plays heavily", () => {
  const r = recommend("what should I play", CATALOGUE, VETERAN);
  const ids = r.picks.map(p => p.id);
  for (const played of ["doom-js13k", "quake"]) {
    assert.ok(!ids.includes(played), `${played} is already played to death`);
  }
});

test("copes with no history and no recognizable genre", () => {
  const r = recommend("surprise me", CATALOGUE, null);
  assert.equal(r.picks.length, 4);
  assert.ok(r.picks.every(p => p.id));
});
