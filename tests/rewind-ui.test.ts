/**
 * The Rewind surface, mounted in jsdom.
 *
 * The maths is covered by rewind.test.ts; this covers the paths a person
 * actually touches: the button, the overlay that must appear *inside the game
 * frame* (the whole point of the rewrite), the "nothing captured yet" honesty
 * when the buffer is empty, the two ways out — Escape and the same key that
 * opened it — and the rule that a new game starts a new tape.
 *
 * Every test unmounts its root and closes its window: the sampler's interval
 * is the component's own cleanup responsibility, and leaving it running would
 * keep the test process alive past the last assertion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';

import { REWIND_KEY, Rewind } from '../components/live/arcade/Rewind';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gg-lounge.test/' });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.KeyboardEvent = dom.window.KeyboardEvent;
  g.MouseEvent = dom.window.MouseEvent;
  g.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

test('rewind: the replay lives inside the game frame, with an honest empty state', async () => {
  const dom = installDom();
  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;

  // The frame wrap, exactly as GameModal renders it: position relative, and
  // the portal target the overlay must land in.
  const wrap = dom.window.document.createElement('div');
  wrap.className = 'frame-wrap';
  dom.window.document.body.append(wrap);

  const root = createRoot(wrap);
  await act(async () => {
    root.render(
      React.createElement(Rewind, {
        frame: () => null,
        wrap: () => wrap,
        gameId: '2048',
      }),
    );
  });

  try {
    const button = wrap.querySelector('button.rewind-toggle');
    assert.ok(button, 'the launcher shows a Rewind pill');
    assert.match(button!.getAttribute('title') ?? '', /`/, 'the key hint is on the button');

    await act(async () => {
      button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const layer = wrap.querySelector('.gg-rewind-layer');
    assert.ok(layer, 'the replay covers the game frame itself');
    // The empty state is a promise, not an error: recording has just begun.
    assert.match(layer!.textContent ?? '', /nothing captured yet/);
    assert.equal(wrap.querySelector('.gg-rewind-hud'), null, 'there is no scrubber until there are frames');

    // Escape is the way out, on the window — the layer is a portal, so its own
    // node never sees the keyboard.
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.equal(wrap.querySelector('.gg-rewind-layer'), null, 'Escape closes the replay');

    // Backquote opens it again: the button is a convenience, not the only door.
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: REWIND_KEY, bubbles: true, cancelable: true }));
    });
    assert.ok(wrap.querySelector('.gg-rewind-layer'), 'the rewind key reopens the replay');
  } finally {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
  }
});

test('rewind: with a readable canvas the HUD arrives, and a new game blanks the tape', async () => {
  const dom = installDom();
  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;
  const wrap = dom.window.document.createElement('div');
  dom.window.document.body.append(wrap);

  // jsdom has no canvas implementation — getContext returns null without the
  // native `canvas` package. The sampler only needs the calls to exist, so a
  // stub stands in for the 2d context here.
  const fakeContext = {
    drawImage: () => {},
    clearRect: () => {},
    fillRect: () => {},
    fillText: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  dom.window.HTMLCanvasElement.prototype.getContext = (() => fakeContext) as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;

  // A frame whose canvas is readable, so the sampler has something to eat.
  const iframe = dom.window.document.createElement('iframe');
  wrap.append(iframe);
  const canvas = iframe.contentDocument!.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  iframe.contentDocument!.body.append(canvas);

  const root = createRoot(wrap);
  const render = (gameId: string) =>
    act(async () => {
      root.render(
        React.createElement(Rewind, {
          frame: () => (iframe as unknown as HTMLIFrameElement) ?? null,
          wrap: () => wrap,
          gameId,
        }),
      );
    });

  try {
    await render('2048');
    // The sampler runs on a real 300 ms interval; two samples prove recording.
    await new Promise(resolve => setTimeout(resolve, 700));

    await act(async () => {
      wrap.querySelector('button.rewind-toggle')!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const hud = wrap.querySelector('.gg-rewind-hud');
    assert.ok(hud, 'with frames captured, the HUD is there');
    assert.ok(hud!.querySelector('input[type="range"]'), 'with a scrubber');
    assert.ok(wrap.querySelector('.gg-rewind-screen'), 'and the tape screen over the frame');
    assert.equal(wrap.querySelector('.gg-rewind-note'), null, 'no empty-state note once frames exist');

    // Switching games re-renders with a new id; reopening shows the empty
    // state again, because the previous game's frames must not leak into it.
    await render('superhot');
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: REWIND_KEY, bubbles: true, cancelable: true }));
    });
    await act(async () => {
      wrap.querySelector('button.rewind-toggle')!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const layer = wrap.querySelector('.gg-rewind-layer');
    assert.ok(layer, 'the replay reopens for the new game');
    assert.match(layer!.textContent ?? '', /nothing captured yet/, 'the tape is blank for a new game');
  } finally {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
  }
});
