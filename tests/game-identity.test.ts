import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalGameTitle, dedupeGames, mergeDuplicateRequests } from '../lib/game-identity';
import { catalogGames, games, proxyGames, unavailableGames } from '../lib/games';
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
  // Locally hosted games must have a real entry point on disk. Games hosted on
  // a remote site through the proxy (hosted:'remote') deliberately have none —
  // their availability is a network property, not a file property.
  for(const game of games) if(game.hosted!=='remote') assert.ok(existsSync('public'+game.path),game.id);
  assert.equal(dedupeGames(games).length,games.length);
  const local=dedupeGames(catalogGames);
  assert.equal(games.filter(g=>g.hosted!=='remote').length+unavailableGames.length,local.length);
  assert.ok(games.some(game=>game.id==='minecraft-classic'));
});

test('remote games are real sites streamed through the proxy, never local fakes', () => {
  assert.ok(proxyGames.length>0);
  for(const game of proxyGames){
    assert.equal(game.hosted,'remote',game.id);
    assert.ok(game.remoteUrl && /^https:\/\//.test(game.remoteUrl), game.id);
    // The launch path must point at the lounge's own remote host, with the
    // destination passed as an encoded parameter rather than an open redirect.
    assert.match(game.path,/^\/remote\?url=/,game.id);
    const encoded=new URLSearchParams(game.path.split('?')[1]).get('url');
    assert.equal(encoded,game.remoteUrl,game.id);
    // And it must never be counted as an installed local game.
    assert.ok(!catalogGames.some(local=>local.id===game.id),game.id);
  }
  const monkeytype=proxyGames.find(g=>g.id==='monkeytype');
  assert.ok(monkeytype);
  assert.equal(new URL(monkeytype.remoteUrl!).hostname,'monkeytype.com');
});

test('every advertised game is either audited locally or explicitly remote-hosted', () => {
  for(const game of games){
    const local=catalogGames.find(entry=>entry.id===game.id);
    if(local) assert.ok(existsSync('public'+local.path),game.id);
    else assert.equal(game.hosted,'remote',game.id);
  }
});
