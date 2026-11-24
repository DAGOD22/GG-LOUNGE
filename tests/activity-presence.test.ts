/**
 * What other players are told about you.
 *
 * Presence used to carry a cursor and, at most, a game id. The roster and ghost
 * tags needed more than that — "in the proxy on youtube.com" — and the moment a
 * feature broadcasts *where* somebody is, the interesting question stops being
 * "does it work" and becomes "what exactly goes out". So these tests are mostly
 * about the negative space: the search term that must not appear, the path that
 * must not appear, the tool name that is only published because the registry
 * already publishes it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { activityLine, activityVerb, rosterKey, type PresencePeer } from '../lib/presence';
import { cleanActivity, hostOnly } from '../lib/db/presence';
import { hostOnly as hostOnlyClient } from '../lib/proxy-client';
import { activityFor } from '../components/live/ActivityReporter';
import { games } from '../lib/games';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

/* ------------------------------- the lines ------------------------------- */

test('an activity reads as a sentence, never as a raw field', () => {
  assert.equal(activityLine({ kind: 'game', label: 'Slope', game: 'slope' }), 'playing Slope');
  assert.equal(activityLine({ kind: 'proxy', label: 'youtube.com', game: null }), 'in the proxy on youtube.com');
  assert.equal(activityLine({ kind: 'page', label: 'the apps page', game: null }), 'on the apps page');
  assert.equal(activityLine({ kind: 'tools', label: 'the tools page', game: null }), 'using the tools page');

  // Nothing to say is not the same as saying "idle on null".
  assert.equal(activityLine(null), null);
  assert.equal(activityLine({ kind: 'idle', label: '', game: null }), null);
});

test('the verb matches the activity, so a proxy visit is not "launched"', () => {
  assert.equal(activityVerb({ kind: 'game', label: 'Slope', game: 'slope' }), 'launched');
  assert.equal(activityVerb({ kind: 'proxy', label: 'youtube.com', game: null }), 'browsing');
  assert.equal(activityVerb({ kind: 'app', label: 'GG-GPT', game: null }), 'opened');
  assert.equal(activityVerb(null), 'is on');
});

/* ------------------------------ the sanitising --------------------------- */

test('cleanActivity keeps a known kind and drops an invented one', () => {
  const kept = cleanActivity({ kind: 'proxy', label: 'youtube.com' });
  assert.deepEqual(kept, { kind: 'proxy', label: 'youtube.com', game: null });

  // A kind is not free text: an unknown one is not echoed back, it is refused.
  assert.equal(cleanActivity({ kind: 'shopping', label: 'amazon.com' }), null);
  // `idle` is not an activity to broadcast — absence is.
  assert.equal(cleanActivity({ kind: 'idle', label: 'x' }), null);
  assert.equal(cleanActivity(null), null);
  assert.equal(cleanActivity('playing Slope'), null);
});

test('a proxy label is reduced to a hostname before it can leak a query', () => {
  const activity = cleanActivity({
    kind: 'proxy',
    label: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42',
  });
  assert.equal(activity?.label, 'youtube.com');
  assert.doesNotMatch(activity!.label, /watch|v=|dQw/);

  assert.equal(hostOnly('https://news.ycombinator.com/item?id=1'), 'news.ycombinator.com');
  // And the browser-side helper agrees, because the label is built there first.
  assert.equal(hostOnlyClient('https://www.youtube.com/watch?v=secret'), 'youtube.com');
  // A bare word is not a destination, so it is not broadcast as one.
  assert.equal(hostOnlyClient('not a url at all'), '');
  assert.equal(hostOnly('hello'), '');
  assert.equal(hostOnlyClient(''), '');
});

test('labels are capped and stripped of control characters', () => {
  const long = 'x'.repeat(200);
  const activity = cleanActivity({ kind: 'page', label: long });
  assert.ok(activity && activity.label.length <= 40, 'a long label is truncated, not truncated-ish');
  const dirty = cleanActivity({ kind: 'page', label: 'a\u0000b\u001fc\u200bd' });
  assert.ok(dirty);
  assert.doesNotMatch(dirty!.label, /[\u0000-\u001f\u200b]/);
});

/* --------------------------- the page mapping ---------------------------- */

test('a route becomes an activity only when we can name it', () => {
  const sx = (query: string) => new URLSearchParams(query);

  // A game, whether opened from the lounge or from its own page.
  const game = games[0];
  assert.deepEqual(activityFor('/', sx(`play=${game.id}`), ''), {
    kind: 'game',
    label: game.title,
    game: game.id,
  });
  assert.equal(activityFor(`/g/${game.id}`, sx(''), '')?.kind, 'game');
  // An id that is not in the catalogue is not a game, and must not be echoed.
  assert.equal(activityFor('/', sx('play=../../etc/passwd'), ''), null);

  // The lounge itself is not something to report.
  assert.equal(activityFor('/', sx(''), ''), null);

  // Pages we have a name for, and pages we do not.
  assert.equal(activityFor('/apps', sx(''), '')?.label, 'the apps page');
  assert.equal(activityFor('/gg-gpt', sx(''), '')?.label, 'GG-GPT');
  assert.equal(activityFor('/some/unlisted/route', sx(''), ''), null);
});

test('the proxy labels the destination host and never the query', () => {
  const withTarget = activityFor('/proxy', new URLSearchParams('url=https://www.youtube.com/watch?v=hunter2'), '');
  assert.equal(withTarget?.kind, 'proxy');
  assert.equal(withTarget?.label, 'youtube.com');
  assert.doesNotMatch(JSON.stringify(withTarget), /hunter2/);

  // An empty proxy is still the proxy page, not "in the proxy on ".
  assert.deepEqual(activityFor('/proxy', new URLSearchParams(''), ''), {
    kind: 'page',
    label: 'the proxy',
    game: null,
  });
});

test('a tool is named from the registry, not from the hash', () => {
  // Unknown hash → the page, never the hash string itself.
  const unknown = activityFor('/tools', new URLSearchParams(''), '#<script>alert(1)</script>');
  assert.equal(unknown?.label, 'the tools page');
  assert.doesNotMatch(JSON.stringify(unknown), /script/);
});

/* ------------------------------- the roster ------------------------------ */

test('two tabs of one account are one roster row', () => {
  const peer = (id: string, name: string): PresencePeer => ({
    id,
    name,
    username: null,
    cursor: { x: 0, y: 0, preset: 'system', image: '', size: 40, accent: '#d7f34a' },
    game: null,
    seen: 0,
  });
  assert.equal(rosterKey(peer('a1', 'Pix Fox')), rosterKey(peer('a2', 'pix fox')));
  assert.notEqual(rosterKey(peer('a1', 'Pix Fox')), rosterKey(peer('b1', 'Nova')));
  // Two guests with the same generated name would merge; that is acceptable
  // (the name is what a person reads) and preferable to duplicate rows.
});

/* --------------------------- the wiring, statically ---------------------- */

test('the page reporter is mounted inside the presence provider', () => {
  const provider = read('components/live/PresenceProvider.tsx');
  assert.match(provider, /<ActivityReporter \/>/);
  // And the heartbeat actually carries it, or the server has nothing to store.
  assert.match(provider, /activity: activity\.current/);
});

test('the ghost tag carries the activity line', () => {
  const ghosts = read('components/live/GhostCursors.tsx');
  assert.match(ghosts, /activityLine\(peer\.activity\)/);
  assert.match(ghosts, /gg-ghost-action/);
  const css = read('app/globals.css');
  assert.match(css, /\.gg-ghost-action\s*\{/);
});

test('the feed can icon a proxy visit and a page visit', () => {
  const feed = read('components/live/ActivityFeed.tsx');
  for (const kind of ['visited', 'browsing', 'tool']) {
    assert.match(feed, new RegExp(`${kind}:`), `${kind} needs an icon, or it renders as a launch`);
  }
});

test('every kind the event route can send is a kind the store will keep', () => {
  // The store dropped "browsing" and "tool" silently — a 200 and no row — for
  // as long as it took to notice the feed never showed a proxy visit. Comparing
  // the two lists is the only way to keep them in step.
  const route = read('app/api/presence/event/route.ts');
  const store = read('lib/db/presence.ts');
  const routeKinds = [...route.matchAll(/^\s{2}(\w+):\s*\(?name/gm)].map(match => match[1]);
  const storeKinds = /const ALLOWED_KINDS = new Set\(\[([\s\S]*?)\]\)/.exec(store)?.[1] ?? '';
  const allowed = [...storeKinds.matchAll(/'([a-z]+)'/g)].map(match => match[1]);

  assert.ok(routeKinds.length >= 5, 'the route templates should have been found');
  for (const kind of routeKinds) {
    assert.ok(allowed.includes(kind), `${kind} is templated but never stored`);
  }
});

test('the proxy reports in-frame navigation, not just the first load', () => {
  const page = read('app/proxy/page.tsx');
  // The proxy is one route: clicking through a proxied site changes nothing in
  // the address bar, so `?url=` alone would leave the roster on the first host.
  assert.match(page, /setProxyDestination\(event\.url\)/);
  assert.match(read('components/live/ActivityReporter.tsx'), /subscribeProxyDestination/);
  assert.match(read('lib/proxy-activity.ts'), /export function setProxyDestination/);
});

test('the server refuses a page it cannot name', () => {
  const route = read('app/api/presence/event/route.ts');
  // The closed set of pages is what stops an arbitrary path reaching the feed.
  assert.match(route, /PAGE_LABELS/);
  assert.match(route, /if \(!target\) return NextResponse\.json\(\{ ok: false \}\)/);
  // A tool event must name a tool that exists.
  assert.match(route, /TOOL_NAMES/);
});
