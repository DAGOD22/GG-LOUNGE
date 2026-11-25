import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Two things rendered badly and both were CSS, not logic.
 *
 * 1. The Arcade Lab shipped with 110 class names and no stylesheet at all. It
 *    rendered as browser default chrome — serif text, grey system buttons, an
 *    unbordered canvas — floating over the game. "Ugly" was the absence of a
 *    design, not a bad one.
 *
 * 2. The header nav used `flex-wrap: nowrap` plus `overflow: hidden`. Once the
 *    ten items (Library, Apps, GG-GPT, Proxy, Tools, Achievements, Studio,
 *    Request a game, Admin) no longer fitted, the ones at the end were clipped
 *    with no scrollbar, no ellipsis and no drawer. They were not hard to read;
 *    they were gone.
 */
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

/**
 * The body of one top-level rule, anchored so a descendant selector cannot match.
 *
 * Comments are stripped first. A grep over raw CSS cannot tell a declaration
 * from prose that mentions one, and this file is heavily commented on purpose —
 * without stripping, the assertion "the nav has no `overflow: hidden`" failed on
 * the comment that explains why it must not have one.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}
const code = stripComments(css);

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Indented rules (inside @media) count too, since the drawer lives in one.
  const match = code.match(new RegExp(`^[ \\t]*${escaped}\\s*\\{([\\s\\S]*?)\\n[ \\t]*\\}`, 'm'));
  assert.ok(match, `no rule found for ${selector}`);
  return match![1];
}

test('every class the Arcade Lab uses is actually styled', async () => {
  const { execFileSync } = await import('node:child_process');
  const used = new Set(
    execFileSync('bash', ['-c', 'grep -rhoE "gglab[a-z-]*" --include="*.tsx" components/'], {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean),
  );
  const styled = new Set(css.match(/gglab[a-z-]*/g) ?? []);
  const missing = [...used].filter(name => !styled.has(name));
  assert.deepEqual(missing, [], `these Lab classes have no CSS: ${missing.join(', ')}`);
  assert.ok(used.size >= 25, 'the scan found the component classes');
});

test('the Lab popover is a real surface, not default browser chrome', () => {
  const panel = block('.gglab-panel-box');
  assert.match(panel, /position: absolute/, 'it floats over the game');
  assert.match(panel, /background:/, 'it has its own surface');
  assert.match(panel, /border:/, 'and an edge, so it reads as a panel');
  assert.match(panel, /box-shadow:/, 'and lifts off the game');
  assert.match(panel, /max-height:/, 'and cannot grow past the viewport');
  assert.match(panel, /overflow: hidden/, 'and clips its own children');
});

test('Lab controls are pills on one accent, like the rest of the site', () => {
  const trigger = block('.gglab-trigger');
  assert.match(trigger, /border-radius: 999px/);
  assert.match(trigger, /height: 34px/);
  // The active state is one accent, and it is the site's accent.
  const active = block('.gglab-trigger.on');
  assert.match(active, /var\(--lime\)/);
});

test('the Lab is usable on a phone, where a right-anchored popover overflows', () => {
  const phone = css.slice(css.indexOf('@media (max-width: 560px)', css.indexOf('.gglab-panel-box')));
  assert.match(phone.slice(0, 600), /\.gglab-panel-box[\s\S]{0,300}position: fixed/, 'it becomes a sheet');
});

test('the header nav can never silently clip its items', () => {
  const nav = block('.header-nav');
  assert.doesNotMatch(nav, /overflow:\s*hidden/, 'clipped items are deleted items');
  assert.match(nav, /flex-wrap:\s*wrap/, 'it wraps rather than hiding entries');
  assert.match(nav, /overflow:\s*visible/);
  // Items must not be allowed to vanish by shrinking to nothing either.
  const item = block('.header-nav > *');
  assert.match(item, /flex:\s*0 0 auto/, 'nav items keep their width');
});

test('the header grows with a wrapped nav instead of cutting it off', () => {
  const header = block('.site-header');
  assert.doesNotMatch(header, /^\s*height:\s*\d+px;/m, 'a fixed height clips a second row');
  assert.match(header, /min-height:/, 'it has a floor, not a ceiling');
  assert.match(header, /flex-wrap:\s*wrap/);
});

test('the mobile drawer hangs off the header whatever height it is', () => {
  const drawer = block('.header-nav.mobile-open');
  assert.match(drawer, /position: absolute/);
  assert.match(drawer, /top: 100%/, 'not a hard-coded pixel offset');
});

test('the nav drops to its own line rather than shrinking, below the one-row breakpoint', () => {
  const nav = block('.header-nav');
  // `min-width: 0` plus an unconstrained flex basis was how the nav collapsed
  // and clipped. It now claims the full width and an order after the actions.
  assert.match(nav, /width: 100%/);
  assert.match(nav, /order: 3/);
  assert.match(nav, /flex: 1 1 auto/);

  const wide = css.slice(css.indexOf('@media (min-width: 1180px)'));
  const rule = wide.slice(wide.indexOf('.header-nav {'), wide.indexOf('.header-nav {') + 200);
  assert.match(rule, /order: 0/, 'a wide screen restores the single-row order');
  assert.match(rule, /width: auto/);
});

test('a header item is never the thing that gives way', () => {
  const item = block('.header-nav > *');
  assert.match(item, /flex: 0 0 auto/);
  assert.match(item, /white-space: nowrap/);
});
