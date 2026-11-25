/**
 * The banner's call to action, the presence room label, and the two floating
 * triggers in the bottom-left corner.
 *
 * Three separate bugs, all of them "the site says one thing and does another":
 *
 *   · the banner advertised a doc and linked to a form;
 *   · the live pill said "1 player online" to everyone, counting the visitor
 *     themselves, so it was permanently true and meant nothing;
 *   · "Play with a friend" and Customize sat within 2px of each other at
 *     different z-indexes, so the co-op button could not be clicked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

/* ------------------------------- the banner ------------------------------ */

test('the banner CTA points at the secret link directory, not at a form', () => {
  const links = read('lib/site-links.ts');
  assert.match(
    links,
    /export const SECRET_DOC_PATH = '\/secret-link-doc'/,
    'the secret doc path must be a single exported constant',
  );
  // The fallback is what ships, because the env var is not set anywhere.
  assert.match(
    links,
    /ANNOUNCEMENT_DOC_URL =\s*process\.env\.NEXT_PUBLIC_ANNOUNCEMENT_DOC_URL \|\| SECRET_DOC_PATH/,
    'the unset-env fallback must be the secret doc',
  );
  // The fallback line itself must not mention the request form. (The file's
  // comment explains the old behaviour on purpose, so only the code counts.)
  const code = links.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /request-game/, 'the banner must not fall back to the request form again');
});

test('the banner link is a real navigable link to an existing page', () => {
  const banner = read('components/AnnouncementBanner.tsx');
  // A router Link for our own paths, so it navigates in the same tab.
  assert.match(banner, /IS_INTERNAL = ANNOUNCEMENT_DOC_URL\.startsWith\('\/'\)/);
  assert.match(banner, /<Link className="gg-banner-cta" href=\{ANNOUNCEMENT_DOC_URL\}>/);
  // And the destination genuinely exists.
  const page = read('app/secret-link-doc/page.tsx');
  assert.match(page, /export default function SecretLinkDocPage/);
});

test('the secret page lists every game in all of its URL shapes', () => {
  const page = read('app/secret-link-doc/page.tsx');
  for (const shape of ['game.landing', 'game.play', 'game.player', 'game.raw']) {
    assert.ok(page.includes(shape), `the doc must render ${shape}`);
  }
  // Generated from the catalogue, not hand-written.
  assert.match(page, /const groups = gameGroups\(\)/);
});

/* ------------------------------- the room -------------------------------- */

test('the room label never counts the visitor themselves', async () => {
  const { roomLabel } = await import('@/lib/presence');
  assert.equal(roomLabel(0), null, 'a lone visitor is told nothing');
  assert.equal(roomLabel(1), '1 other player here');
  assert.equal(roomLabel(2), '2 other players here');
});

test('presence reports others separately from the total', () => {
  const route = read('app/api/presence/route.ts');
  assert.match(route, /const others = peers\.filter\(peer => peer\.id !== id\)/);
  assert.match(route, /others: others\.length/);
  // `online` still includes the caller, so it must never be used for the pill.
  assert.match(route, /online,/);
});

test('presence events carry the field name the client type declares', () => {
  const route = read('app/api/presence/route.ts');
  // The store speaks createdAt, PresenceEvent speaks at. Both go out so a
  // consumer cannot silently read undefined.
  assert.match(route, /at: event\.createdAt/);
  assert.match(route, /createdAt: event\.createdAt/);

  // The feed must not take an `online` prop at all: it renders `others`.
  // (`online: Users` in the icon map is a lucide icon name, not the count.)
  const feed = read('components/live/ActivityFeed.tsx');
  const code = feed.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /\bonline\s*[?:]\s*number/, 'the feed must not accept an online count');
  assert.doesNotMatch(code, /\bonline\s*[,}]/, 'the feed must not consume an online count');
  assert.match(code, /roomLabel\(others\)/);
});

test('the feed shows real recent history instead of an empty corner', () => {
  const feed = read('components/live/ActivityFeed.tsx');
  assert.match(feed, /gg-live-history/, 'the history block must be rendered');
  assert.match(feed, /const history = useMemo\(\(\) => events\.slice\(0, MAX_VISIBLE\), \[events\]\)/);
  const css = read('app/globals.css');
  assert.match(css, /\.gg-live-history \{/, 'the history block must be styled');
});

/* ---------------------------- the two buttons ---------------------------- */

/**
 * Pull a declaration block out of a stylesheet by selector, so the assertion
 * is about the properties actually shipped rather than about the whole file.
 */
function rule(css: string, selector: string): string {
  // Strip comments first: a declaration block may explain in prose what it
  // used to be ("it used to be bottom: 68px"), and an assertion about the
  // shipped value must not be satisfied or defeated by a comment.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // `globals.css` is written with a space before the brace and
  // `customization.css` is minified, so match either.
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`);
  const match = pattern.exec(clean);
  assert.ok(match, `${selector} must exist`);
  const start = match.index;
  const end = clean.indexOf('}', start);
  return clean.slice(start, end);
}

test('Customize and Play-with-a-friend do not occupy the same corner', () => {
  const custom = rule(read('app/customization.css'), '.gg-customize-trigger');
  const coop = rule(read('app/globals.css'), '.gg-coop-trigger');

  const customLeft = Number(/left:\s*(\d+)px/.exec(custom)?.[1]);
  const coopLeft = Number(/left:\s*(\d+)px/.exec(coop)?.[1]);
  assert.ok(Number.isFinite(customLeft), 'Customize must set a left offset');
  assert.ok(Number.isFinite(coopLeft), 'co-op must set a left offset');

  // Customize is ~150px wide at its widest, so anything under that overlaps.
  assert.ok(
    coopLeft >= customLeft + 140,
    `co-op starts at ${coopLeft}px but Customize occupies from ${customLeft}px`,
  );
});

test('the co-op panel stacks above the Customize trigger', () => {
  const css = read('app/globals.css');
  const panel = rule(css, '.gg-coop-panel');
  const panelZ = Number(/z-index:\s*(\d+)/.exec(panel)?.[1]);
  const custom = rule(read('app/customization.css'), '.gg-customize-trigger');
  const customZ = Number(/z-index:\s*(\d+)/.exec(custom)?.[1]);

  assert.ok(Number.isFinite(panelZ) && Number.isFinite(customZ));
  assert.ok(panelZ > customZ, `panel z-index ${panelZ} must exceed ${customZ}`);

  // And it must clear the trigger it opens from, not sit level with it.
  assert.match(panel, /bottom:\s*\d+px/);
  assert.doesNotMatch(panel, /bottom:\s*68px/);
});
