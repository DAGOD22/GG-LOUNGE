import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * The scroll-reveal must never be able to hide content from a reader who
 * cannot run the effect: the hidden state is applied to an extra class that
 * only exists after mount, and reduced-motion skips it entirely.
 */

const cssFile = new URL('../app/globals.css', import.meta.url);

async function read(): Promise<string> {
  return readFile(cssFile, 'utf8');
}

test('the reveal element is visible before any class is added', async () => {
  const css = await read();
  const base = css.match(/\.reveal \{([^}]*)\}/);
  assert.ok(base, '.reveal must exist');
  assert.equal(/opacity:\s*0/.test(base[1]), false, '.reveal must not start hidden');
});

test('the hidden state is scoped to an extra class', async () => {
  const css = await read();
  assert.match(css, /\.reveal-init \{[^}]*opacity: 0/, '.reveal-init is the hidden state');
  assert.match(css, /\.reveal-init\.reveal-in \{[^}]*opacity: 1/, 'reveal-in must override it');
});

test('reduced motion forces the element visible', async () => {
  const css = await read();
  const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.reveal-init \{([^}]*)\}/);
  assert.ok(block, 'reduced-motion override must exist');
  assert.match(block[1], /opacity: 1/);
  assert.match(block[1], /transform: none/);
});

test('Reveal does not add the hidden class when motion is reduced', async () => {
  const src = await readFile(new URL('../components/Reveal.tsx', import.meta.url), 'utf8');
  assert.match(src, /prefers-reduced-motion: reduce/);
  const guard = src.indexOf('prefers-reduced-motion');
  const addClass = src.indexOf("classList.add('reveal-init')");
  assert.ok(guard !== -1 && addClass !== -1 && guard < addClass, 'the reduced-motion check must come before the class is added');
});

/**
 * Two shipped regressions, both on the same hero number: production rendered
 * "-915 games" (an rAF timestamp earlier than the scheduler's now(), giving
 * negative progress) and then "0", because any snapshot taken mid-animation
 * captures an in-between value. Animating the digits at all is the hazard.
 * The stat may animate its scale/opacity; it may never animate its content.
 */
test('the hero stat animates presentation, never the number', async () => {
  const css = await read();
  assert.match(css, /@keyframes stat-pop \{[^@]*from \{[^}]*opacity: 0/, 'stat-pop animates opacity');

  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /<strong className="stat-pop">\{allGames.length\}<\/strong>/, 'the stat renders the real count directly');
  assert.equal(/CountUp/.test(page), false, 'no component may substitute a value into the digits');
});
