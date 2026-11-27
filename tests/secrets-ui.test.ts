/**
 * The secret layer, mounted in jsdom.
 *
 * The pure matcher tests (secrets.test.ts) prove the codes are recognised;
 * these prove the layer actually reacts: a typed code flips its overlay on
 * and off, a discovery toast names the secret, the konami sequence fires its
 * own effect, and none of it can be triggered while someone is typing into a
 * real field.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';

import { SecretsProvider } from '../components/live/secrets/SecretsProvider';
import { isToggled, resetSecrets, discover } from '../lib/secrets';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gg-lounge.test/' });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
  // Browsers expose localStorage as a global; the secret store (and the rest
  // of the site) reads the bare identifier, so the shim has to be global too.
  g.localStorage = dom.window.localStorage;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.KeyboardEvent = dom.window.KeyboardEvent;
  g.MouseEvent = dom.window.MouseEvent;
  g.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function mount(dom: JSDOM, element: React.ReactElement) {
  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;
  const host = dom.window.document.createElement('div');
  dom.window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { host, act };
}

test('secrets: typing a code toggles its overlay and toasts the name', async () => {
  const dom = installDom();
  resetSecrets();
  const { act } = React as any;
  const { host } = await mount(dom, React.createElement(SecretsProvider));

  const typeWord = async (word: string) => {
    for (const char of word) {
      await act(async () => {
        dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: char, bubbles: true }));
      });
    }
  };

  assert.equal(host.querySelector('canvas.gg-secret-canvas'), null, 'nothing runs before a secret fires');

  await typeWord('matrix');
  assert.equal(isToggled('matrix'), true, 'the store flipped on');
  assert.ok(host.querySelector('canvas.gg-secret-canvas'), 'the code rain is on screen');
  const toast = host.querySelector('.gg-secret-toast');
  assert.ok(toast, 'a discovery toast appeared');
  assert.match(toast!.textContent ?? '', /Code Rain/);

  await typeWord('matrix');
  assert.equal(isToggled('matrix'), false, 'the same code switches it off');
  assert.equal(host.querySelector('canvas.gg-secret-canvas'), null, 'the overlay is gone');

  resetSecrets();
});

test('secrets: the konami sequence fires godmode from a fumbled attempt', async () => {
  const dom = installDom();
  resetSecrets();
  const { act } = React as any;
  const { host } = await mount(dom, React.createElement(SecretsProvider));

  const press = async (key: string) => {
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
    });
  };

  // A fumbled first arrow, then the real sequence: the matcher accepts the
  // suffix, because nobody plays perfectly.
  for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
    await press(key);
  }
  assert.equal(isToggled('konami'), true);
  assert.ok(host.querySelector('.gg-retro-veil'), 'the retro veil is on screen');
  assert.match(host.querySelector('.gg-secret-toast')?.textContent ?? '', /Arcade Godmode/);

  resetSecrets();
});

test('secrets: codes never fire while someone is typing into a field', async () => {
  const dom = installDom();
  resetSecrets();
  const { act } = React as any;
  const { host } = await mount(dom, React.createElement(SecretsProvider));

  const input = dom.window.document.createElement('input');
  dom.window.document.body.append(input);

  for (const char of 'matrix') {
    await act(async () => {
      input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: char, bubbles: true }));
    });
  }
  assert.equal(isToggled('matrix'), false, 'a search box is not a secret trigger');
  assert.equal(host.querySelector('canvas.gg-secret-canvas'), null);

  resetSecrets();
});

test('secrets: a secret discovered elsewhere still toasts here', async () => {
  const dom = installDom();
  resetSecrets();
  const { act } = React as any;
  const { host } = await mount(dom, React.createElement(SecretsProvider));

  assert.equal(host.querySelector('.gg-secret-toast'), null);

  // The vault page, the chat and the runner call `discover` from their own
  // components; the provider's subscription is the single toast path.
  await act(async () => {
    discover('chat');
  });
  const toast = host.querySelector('.gg-secret-toast');
  assert.ok(toast, 'discovery from another component is announced');
  assert.match(toast!.textContent ?? '', /Whisper Commands/);

  resetSecrets();
});
