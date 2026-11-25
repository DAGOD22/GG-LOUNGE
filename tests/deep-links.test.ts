import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * Query-parameter entry points.
 *
 * The site tells search engines (`/?q=` in JSON-LD) and installed-app launchers
 * (`?customize=1`, `?coop=1` in the manifest) that these URLs do something. Two
 * of those three did nothing at all before this change, which is worse than not
 * advertising them: the promise is what makes it a bug.
 *
 * The parsing rules are extracted here because they are the whole contract —
 * the components only consume the result.
 */

/** What the page does with an incoming URL. Kept in step with app/page.tsx. */
function readEntryParam(search: string): { q?: string; customize?: boolean; coop?: boolean } {
  const params = new URLSearchParams(search);
  const out: { q?: string; customize?: boolean; coop?: boolean } = {};
  const q = params.get('q');
  // Trim before storing, not just before testing: a leading space would otherwise
  // reach the search box and match nothing, which looks like a broken link.
  if (q && q.trim()) out.q = q.trim().slice(0, 80);
  if (params.get('customize') === '1') out.customize = true;
  if (params.get('coop') === '1') out.coop = true;
  return out;
}

/** What the address bar should look like for a given search term. */
function withQuery(search: string, term: string): string {
  const url = new URL(`https://gg-lounge.test/${search}`);
  if (term.trim()) url.searchParams.set('q', term.trim());
  else url.searchParams.delete('q');
  return `${url.pathname}${url.search}`;
}

test('?q= pre-fills the search, which is what the JSON-LD SearchAction promises', () => {
  assert.equal(readEntryParam('?q=slope').q, 'slope');
  assert.equal(readEntryParam('?q=retro+bowl').q, 'retro bowl');
  assert.equal(readEntryParam('?q=%20%20slope%20').q, 'slope', 'surrounding space is trimmed');
  // `%20` between words, which is what a browser sends for a typed phrase
  assert.equal(readEntryParam('?q=geometry%20dash').q, 'geometry dash');
});

test('an absent or blank q does not open a filtered view', () => {
  assert.equal(readEntryParam('').q, undefined);
  assert.equal(readEntryParam('?q=').q, undefined);
  assert.equal(readEntryParam('?q=%20%20%20').q, undefined);
});

test('an absurdly long q is bounded instead of rendered', () => {
  const long = 'a'.repeat(500);
  assert.equal(readEntryParam(`?q=${long}`).q?.length, 80);
});

test('the manifest shortcuts are honoured', () => {
  assert.equal(readEntryParam('?customize=1').customize, true);
  assert.equal(readEntryParam('?coop=1').coop, true);
  // only the documented value, so a stray `?coop=0` does not open a panel
  assert.equal(readEntryParam('?customize=0').customize, undefined);
  assert.equal(readEntryParam('?coop=false').coop, undefined);
  assert.equal(readEntryParam('?coop').coop, undefined);
});

test('installed-app start_url (?source=pwa) adds nothing to the UI', () => {
  const parsed = readEntryParam('?source=pwa');
  assert.deepEqual(parsed, {}, 'tracking the launch must not change what is shown');
});

test('typing then clearing search keeps the URL honest', () => {
  assert.equal(withQuery('', 'slope'), '/?q=slope');
  assert.equal(withQuery('?q=slope', 'slope'), '/?q=slope', 'an unchanged term does not churn history');
  assert.equal(withQuery('?q=slope', ''), '/', 'clearing removes the parameter');
  assert.equal(withQuery('?q=slope', '   '), '/');
  assert.equal(withQuery('?game=slope', 'retro'), '/?game=slope&q=retro', 'the launcher keeps its own param');
  assert.equal(withQuery('?game=slope&q=retro', ''), '/?game=slope');
});

test('the query survives the trip through a real URL object', () => {
  const dom = new JSDOM('<!doctype html><html></html>', { url: 'https://gg-lounge.test/?q=geometry%20dash&game=slope' });
  const url = new dom.window.URL(dom.window.location.href);
  assert.equal(url.searchParams.get('q'), 'geometry dash');
  assert.equal(url.searchParams.get('game'), 'slope');
});
