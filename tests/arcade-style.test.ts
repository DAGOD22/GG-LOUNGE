import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Two guarantees about the arcade chrome's CSS, plus the header nav rules the
 * old lab style test already carried.
 *
 * 1. The Arcade Lab was deleted. Its CSS must actually be gone, not just its
 *    component — dead rules are how stylesheets rot.
 * 2. What replaced it (the rewind overlay, the co-op bubble, the secret
 *    layer's overlays and the vault page) ships with a stylesheet: every class
 *    those components use is defined, because "unstyled floating chrome" was
 *    literally how the lab shipped the first time.
 */

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}
const code = stripComments(css);

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = code.match(new RegExp(`^[ \\t]*${escaped}\\s*\\{([\\s\\S]*?)\\n[ \\t]*\\}`, 'm'));
  assert.ok(match, `no rule found for ${selector}`);
  return match![1];
}

test('the Arcade Lab is gone from the stylesheet, not only from the tree', () => {
  assert.doesNotMatch(code, /\.gglab/, 'dead lab rules must not linger in globals.css');
  const tsx = execFileSync('bash', ['-c', 'grep -rl "gglab" --include="*.tsx" --include="*.ts" components/ lib/ app/ || true'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
  });
  assert.equal(tsx.trim(), '', `these files still reference the lab: ${tsx.trim()}`);
});

test('every class the secret layer and rewind use is actually styled', () => {
  const used = new Set(
    execFileSync(
      'bash',
      ['-c', 'grep -rhoE "(gg-rewind|gg-bubble|gg-runner|gg-secret|gg-spotlight|gg-timewarp|gg-retro|vault)-?[a-z-]*" --include="*.tsx" components/live/ | sort -u'],
      { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean),
  );
  assert.ok(used.size >= 20, 'the scan found the component classes');
  const styled = new Set(css.match(/(?:gg-rewind|gg-bubble|gg-runner|gg-secret|gg-spotlight|gg-timewarp|gg-retro|vault)-?[a-z-]*/g) ?? []);
  const missing = [...used].filter(name => !styled.has(name));
  assert.deepEqual(missing, [], `these classes have no CSS: ${missing.join(', ')}`);
});

test('the rewind overlay covers the frame and never blocks it', () => {
  const layer = block('.gg-rewind-layer');
  assert.match(layer, /position:\s*absolute/, 'it lives inside .frame-wrap');
  assert.match(layer, /inset:\s*0/, 'it covers the whole frame');

  const screen = block('.gg-rewind-screen');
  assert.match(screen, /pointer-events:\s*none/, 'the tape must not steal clicks from the game');

  const hud = block('.gg-rewind-hud');
  assert.match(hud, /position:\s*relative/, 'the HUD sits above the tape canvas');
  assert.match(hud, /border:/, 'and reads as a control surface');
});

test('the rewind button matches the launcher pill it replaced', () => {
  const toggle = block('.rewind-toggle');
  assert.match(toggle, /border-radius:\s*999|border-radius:\s*99/, 'a pill, like the split button');
  assert.match(toggle, /display:\s*flex/, 'icon and label on one line');
});

test('the secret overlays can never eat a click or shift the layout', () => {
  const canvas = block('.gg-secret-canvas');
  assert.match(canvas, /position:\s*fixed/);
  assert.match(canvas, /pointer-events:\s*none/);
  assert.match(canvas, /z-index:/);

  const spotlight = block('.gg-spotlight');
  assert.match(spotlight, /pointer-events:\s*none/);
  const toastStack = block('.gg-secret-toast-stack');
  assert.match(toastStack, /position:\s*fixed/);
});

test('the vault page styles exist and keep the game visible', () => {
  const stage = block('.gg-runner-stage');
  assert.match(stage, /aspect-ratio:\s*480\s*\/\s*260/, 'the canvas scales without stretching');
  assert.match(stage, /touch-action:\s*manipulation/, 'a tap jumps, it does not double-tap-zoom');
  const grid = block('.vault-grid');
  assert.match(grid, /repeat\(auto-fill,\s*minmax\(/, 'the cards wrap on a phone');
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
  assert.match(drawer, /position:\s*absolute/);
  assert.match(drawer, /top:\s*100%/, 'not a hard-coded pixel offset');
});

test('the nav drops to its own line rather than shrinking, below the one-row breakpoint', () => {
  const nav = block('.header-nav');
  assert.match(nav, /width:\s*100%/);
  assert.match(nav, /order:\s*3/);
  assert.match(nav, /flex:\s*1 1 auto/);

  const wide = css.slice(css.indexOf('@media (min-width: 1180px)'));
  const rule = wide.slice(wide.indexOf('.header-nav {'), wide.indexOf('.header-nav {') + 200);
  assert.match(rule, /order:\s*0/, 'a wide screen restores the single-row order');
  assert.match(rule, /width:\s*auto/);
});

test('a header item is never the thing that gives way', () => {
  const item = block('.header-nav > *');
  assert.match(item, /flex:\s*0 0 auto/);
  assert.match(item, /white-space:\s*nowrap/);
});
