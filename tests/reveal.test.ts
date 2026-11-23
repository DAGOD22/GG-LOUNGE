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
 * A shipped regression: the deployed page rendered "-697 games" — the counter
 * had been reset and was mid-animation when the HTML was serialised. The
 * server render (and any snapshot taken before the effect runs) must be the
 * real number, and the reset to 0 must happen inside the observer callback.
 */
test('CountUp initialises to the real value', async () => {
  const src = await readFile(new URL('../components/CountUp.tsx', import.meta.url), 'utf8');
  assert.match(src, /useState\(value\)/, 'initial state must be the real value');
  assert.equal(/setShown\(0\)/.test(src), false, 'must not reset to 0 during render or on mount');
  const observer = src.indexOf('new IntersectionObserver');
  const reset = src.indexOf('const tick = (now: number)');
  assert.ok(observer !== -1 && reset !== -1 && observer < reset, 'counting must start inside the observer');
});

/**
 * Second shipped regression, same component: production showed "-915 games".
 * The rAF timestamp is the frame's start, which can precede the now() taken
 * when the loop was scheduled, so `(now - start)` went negative on the first
 * frame and the eased curve produced a negative count. The baseline must be
 * the first frame's own timestamp, and progress must be clamped.
 */
test('CountUp can never render a value outside 0..value', async () => {
  const src = await readFile(new URL('../components/CountUp.tsx', import.meta.url), 'utf8');
  assert.equal(/const start = performance\.now\(\)/.test(src), false, 'must not baseline on a pre-frame timestamp');
  assert.match(src, /if \(start === null\) start = now/, 'baseline on the first frame');
  assert.match(src, /Math\.max\(0, \(now - start\) \/ duration\)/, 'progress must be clamped to >= 0');
});
