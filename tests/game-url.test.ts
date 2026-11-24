import test from "node:test";
import assert from "node:assert/strict";
import { gameUrl, gameFromLocation, pathGameId } from "../lib/use-game-url";

test("proxied games get the shareable path form", () => {
  assert.equal(gameUrl({ id: "krunker", proxy: true }), "/play/krunker");
});

test("local games fall back to the query form", () => {
  assert.equal(gameUrl({ id: "doom-js13k" }, true), "?game=doom-js13k");
});

test("ids are encoded so odd ids cannot break the URL", () => {
  assert.equal(gameUrl({ id: "a b/c" }), "/play/a%20b%2Fc");
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
