import test from "node:test";
import assert from "node:assert/strict";
import { gameUrl, gameFromLocation, pathGameId } from "../lib/use-game-url";
import { absoluteGameUrl } from "../lib/game-url";

test("every launch uses the query form, proxied or local", () => {
  // One shape for both kinds of game: the earlier split (path for proxied,
  // query for local) is what made a copied link to a local title dead-end.
  assert.equal(gameUrl({ id: "krunker", proxy: true }), "?game=krunker");
  assert.equal(gameUrl({ id: "doom-js13k" }), "?game=doom-js13k");
});

test("the deep link a share button hands out is absolute and query based", () => {
  assert.equal(
    absoluteGameUrl({ id: "suika" }, "https://gg-lounge.vercel.app"),
    "https://gg-lounge.vercel.app/?game=suika",
  );
});

test("ids are encoded so odd ids cannot break the URL", () => {
  assert.equal(gameUrl({ id: "a b/c" }), "?game=a%20b%2Fc");
});

test("reads both the new and legacy query parameters", () => {
  assert.deepEqual(gameFromLocation("?game=suika"), { id: "suika", fromPath: "query" });
  assert.deepEqual(gameFromLocation("?play=suika"), { id: "suika", fromPath: "query" });
  assert.equal(gameFromLocation(""), null);
});

test("parses /play/<id> paths and ignores others", () => {
  assert.equal(pathGameId("/play/krunker"), "krunker");
  assert.equal(pathGameId("/play/krunker/"), "krunker");
  assert.equal(pathGameId("/"), null);
  assert.equal(pathGameId("/play"), null);
  assert.equal(pathGameId("/play/a/b"), null);
});
