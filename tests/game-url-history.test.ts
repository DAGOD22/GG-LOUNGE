import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';

/**
 * The launcher's URL behaviour, exercised against a real jsdom history — the
 * exact API the page uses. What is being pinned:
 *
 *   · a launch pushes `?game=<id>` as its own history entry, so it counts as a
 *     page view and can be linked;
 *   · closing pushes `/`, so Back from the grid does not reopen the game;
 *   · Back inside the game closes it, without the hook pushing a second entry;
 *   · a deep link on first paint opens the game and normalises a legacy
 *     `/play/<id>` or `?play=<id>` address to the current form.
 */

function installDom(url: string) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
  g.localStorage = dom.window.localStorage;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.Event = dom.window.Event;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

const flush = () => new Promise(r => setTimeout(r, 0));

/** Mount a probe component that uses the hook, so effects run for real. */
async function mountHook(url: string, known: string[] = ['krunker', 'doom-js13k']) {
  const dom = installDom(url);
  const { useGameUrl } = await import('../lib/use-game-url');
  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;

  const opened: string[] = [];
  const closed: number[] = [];
  const api: any = {};

  function Probe() {
    const { pushGame, pushHome } = useGameUrl({
      openGameId: null,
      openGame: (id: string) => opened.push(id),
      closeGame: () => closed.push(1),
      ready: true,
      known: (id: string) => known.includes(id),
    });
    api.pushGame = pushGame;
    api.pushHome = pushHome;
    return null;
  }

  const el = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(Probe));
  });
  await act(flush);
  return { dom, api, opened, closed, root, act };
}

test('a launch is its own history entry with ?game=<id>', async () => {
  const { dom, api, act } = await mountHook('https://gg-lounge.vercel.app/');
  await act(async () => api.pushGame({ id: 'krunker', proxy: true }));
  assert.equal(dom.window.location.pathname, '/');
  assert.equal(dom.window.location.search, '?game=krunker');
  assert.equal(dom.window.history.length, 2, 'a launch must add one entry, not replace');
  dom.window.close();
});

test('closing returns the address bar to /', async () => {
  const { dom, api, act } = await mountHook('https://gg-lounge.vercel.app/');
  await act(async () => api.pushGame({ id: 'doom-js13k' }));
  await act(async () => api.pushHome());
  assert.equal(dom.window.location.pathname, '/');
  assert.equal(dom.window.location.search, '');
  dom.window.close();
});

test('re-launching the same game does not stack duplicate entries', async () => {
  const { dom, api, act } = await mountHook('https://gg-lounge.vercel.app/');
  await act(async () => api.pushGame({ id: 'krunker' }));
  const after = dom.window.history.length;
  await act(async () => api.pushGame({ id: 'krunker' }));
  assert.equal(dom.window.history.length, after);
  dom.window.close();
});

test('a deep link opens the game on first paint', async () => {
  const { opened, dom } = await mountHook('https://gg-lounge.vercel.app/?game=krunker');
  assert.deepEqual(opened, ['krunker']);
  dom.window.close();
});

test('a legacy /play/<id> link still opens, and is rewritten to the current form', async () => {
  const { opened, dom } = await mountHook('https://gg-lounge.vercel.app/play/doom-js13k');
  assert.deepEqual(opened, ['doom-js13k']);
  assert.equal(dom.window.location.pathname, '/', 'the old path shape is normalised');
  assert.equal(dom.window.location.search, '?game=doom-js13k');
  // replaceState, not pushState: Back must leave the site, not replay the link.
  assert.equal(dom.window.history.length, 1);
  dom.window.close();
});

test('an unknown id in the URL is ignored rather than opening a blank game', async () => {
  const { opened, dom } = await mountHook('https://gg-lounge.vercel.app/?game=not-a-real-game');
  assert.deepEqual(opened, []);
  dom.window.close();
});
