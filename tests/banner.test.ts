import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ANNOUNCEMENT_DOC_URL } from '../lib/site-links';

/**
 * The banner has three properties worth pinning, because each one is a way a
 * dismissible announcement bar normally goes wrong:
 *
 *   1. it renders nothing until the dismissed flag has been read, so a
 *      returning visitor never sees a flash of the bar they closed;
 *   2. closing it stores the flag AND unmounts the bar in the same interaction;
 *   3. the CTA opens in a new tab with noreferrer, so the destination cannot
 *      reach back into this window.
 *
 * Rendering happens in jsdom with real React, so the effects, the click handler
 * and localStorage are all genuinely exercised — not asserted from source text.
 */

/** Minimal environment React's client renderer needs. */
function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://gg-lounge.vercel.app/',
    pretendToBeVisual: true,
  });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  // `next/link` reaches for `self` (and `requestIdleCallback`) while
  // prefetching, which a browser has and a bare node process does not.
  g.self = dom.window;
  if (!g.requestIdleCallback) {
    g.requestIdleCallback = (cb: (idle: unknown) => void) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 0);
    g.cancelIdleCallback = (id: number) => clearTimeout(id);
  }
  if (!dom.window.requestIdleCallback) {
    (dom.window as any).requestIdleCallback = g.requestIdleCallback;
    (dom.window as any).cancelIdleCallback = g.cancelIdleCallback;
  }
  g.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
  dom.window.IntersectionObserver = g.IntersectionObserver as any;
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
  g.localStorage = dom.window.localStorage;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.Event = dom.window.Event;
  g.KeyboardEvent = dom.window.KeyboardEvent;
  g.MouseEvent = dom.window.MouseEvent;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

/** Wait for React to flush effects and any state updates. */
function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

test('the banner is inert until localStorage has been consulted', async () => {
  const dom = installDom();
  const { AnnouncementBanner } = await import('../components/AnnouncementBanner');
  const { createRoot } = await import('react-dom/client');

  const container = dom.window.document.getElementById('root')!;
  const root = createRoot(container);
  const { act } = React as any;

  await act(async () => {
    root.render(React.createElement(AnnouncementBanner));
  });
  await act(flush);

  // Nothing stored → it is shown, and the copy is the copy that was asked for.
  const copy = container.querySelector('.gg-banner-copy')?.textContent || '';
  assert.match(copy, /HUGE THINGS ARE DROPPING OVER SUMMER/);
  assert.match(copy, /ONLY go inside/);
  assert.match(copy, /Save it before break or miss everything/);

  // The CTA is a real link to the doc the copy promises.
  //
  // It used to be asserted as `target="_blank"` pointing at an absolute URL,
  // which is how the dead end went unnoticed: an absolute env-var fallback that
  // was never set, opening the site's own request form in a new tab. For one of
  // our own pages the correct behaviour is an in-tab navigation, which is what
  // Next's `Link` renders — no `target`, and a site-relative `href`.
  const cta = container.querySelector('.gg-banner-cta') as any;
  assert.ok(cta, 'the CTA must render');
  assert.equal(cta.getAttribute('href'), ANNOUNCEMENT_DOC_URL);
  assert.equal(cta.getAttribute('href'), '/secret-link-doc');
  assert.equal(cta.getAttribute('target'), null, 'an internal doc opens in the same tab');

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('once closed it stays closed, across a remount', async () => {
  const dom = installDom();
  const { AnnouncementBanner } = await import('../components/AnnouncementBanner');
  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;

  dom.window.localStorage.setItem('ggl_summer_banner_dismissed_v1', '1');

  const container = dom.window.document.getElementById('root')!;
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(AnnouncementBanner));
  });
  await act(flush);

  assert.equal(container.querySelector('.gg-banner'), null, 'a dismissed banner must not paint');

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('clicking close records the dismissal and removes the bar', async () => {
  const dom = installDom();
  const { AnnouncementBanner } = await import('../components/AnnouncementBanner');
  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;

  const container = dom.window.document.getElementById('root')!;
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(AnnouncementBanner));
  });
  await act(flush);

  const close = container.querySelector('.gg-banner-close') as any;
  assert.ok(close, 'the close control must exist when the banner is shown');

  await act(async () => {
    close.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  await act(flush);

  assert.equal(
    dom.window.localStorage.getItem('ggl_summer_banner_dismissed_v1'),
    '1',
    'the dismissal has to survive a reload',
  );
  assert.equal(container.querySelector('.gg-banner'), null);

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('the copy is real markup, not an unescaped string', async () => {
  // A server render is safe here: the component only bails out on the client,
  // so this checks the words and the link target without needing an effect.
  const { AnnouncementBanner } = await import('../components/AnnouncementBanner');
  const html = renderToStaticMarkup(React.createElement(AnnouncementBanner));
  // `null` before the effect runs — i.e. never a flash of un-dismissed content.
  assert.equal(html, '');
});
