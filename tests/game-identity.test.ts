import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalGameTitle, dedupeGames, mergeDuplicateRequests } from '../lib/game-identity';
import { catalogGames, games, unavailableGames } from '../lib/games';
import { existsSync } from 'node:fs';

test('normalizes requested duplicates and explicit aliases', () => {
  assert.equal(canonicalGameTitle(' Cat pizza! '), canonicalGameTitle('CAT PIZZA'));
  assert.equal(canonicalGameTitle('Geometry Dash Working'), canonicalGameTitle('Geometry Dash'));
  assert.equal(canonicalGameTitle('erraria'), canonicalGameTitle('Terraria'));
  assert.equal(canonicalGameTitle('Mr. Mine'), canonicalGameTitle('Mr mine'));
});
test('never merges sequels or unrelated Stack titles', () => {
  assert.notEqual(canonicalGameTitle('Duck Life 2'), canonicalGameTitle('Duck Life 3'));
  assert.notEqual(canonicalGameTitle('Stack'), canonicalGameTitle('Stack and the Grumblepuff from Above'));
  assert.equal(dedupeGames([{ id:'a',title:'Run 2' }, {id:'b',title:'Run 3'}]).length,2);
});
test('dedupes builtins and community copies by identity and by launch path', () => {
  const input=[{id:'gd',title:'Geometry Dash',path:'/games/gd/index.html'}, {id:'pub-x',title:'Geometry Dash Working',path:'/games/x'}, {id:'other',title:'A renamed copy',path:'/games/gd/'}];
  assert.deepEqual(dedupeGames(input),[input[0]]);
});
test('merges Cat Pizza votes, keeps oldest stable ID and does not mutate source rows', () => {
  const rows=[{id:'b',title:'Cat pizza',status:'pending',votes:2,createdAt:'2026-09-02'}, {id:'a',title:'Cat Pizza',status:'pending',votes:2,createdAt:'2026-09-01'}, {id:'c',title:'Cat Pizza',status:'published',votes:1,createdAt:'2026-08-01'}];
  const output=mergeDuplicateRequests(rows);
  assert.equal(output.length,2);assert.equal(output[0].id,'a');assert.equal(output[0].votes,4);assert.equal(rows[1].votes,2);
});
test('playable catalog never advertises a missing entry point or duplicates', () => {
  for(const game of games) assert.ok(existsSync('public'+game.path),game.id);
  assert.equal(dedupeGames(games).length,games.length);
  assert.equal(games.length+unavailableGames.length,dedupeGames(catalogGames).length);
  assert.ok(unavailableGames.some(game=>game.id==='geometry-dash'));
  assert.ok(games.some(game=>game.id==='minecraft-classic'));
});
