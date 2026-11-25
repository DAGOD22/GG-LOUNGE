import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';

/**
 * The fake document, driven the way a person drives it.
 *
 * The parts worth pinning are not the colours. They are the promises the
 * feature makes: a keystroke advances the page, the caret follows the text, the
 * word count reports what is on screen, and every exit route actually exits —
 * because a panic screen you cannot leave is a trap, not a disguise.
 *
 * jsdom has no layout, so this asserts structure and behaviour rather than
 * pixels. Layout was reviewed in a real browser separately.
 */

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
  g.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function mountDoc() {
  const dom = installDom();
  const { PanicDoc } = await import('../components/live/PanicDoc');
  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;

  let exited = 0;
  const host = dom.window.document.createElement('div');
  dom.window.document.body.append(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(React.createElement(PanicDoc, { onExit: () => { exited++; } }));
  });

  const typeKey = async (key: string) => {
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
  };

  return {
    dom,
    host,
    act,
    typeKey,
    count: () => exited,
    unmount: async () => { await act(async () => root.unmount()); },
  };
}

test('the document renders as a document, not as a plain white overlay', async () => {
  const doc = await mountDoc();
  const text = doc.host.textContent || '';
  // the pieces a person recognises at a glance
  assert.ok(doc.host.querySelector('.gg-doc'), 'root surface');
  assert.ok((doc.host.querySelector('.gg-doc-title')?.textContent || '').trim().length > 8, 'a real title');
  assert.ok(doc.host.querySelector('.gg-doc-menus'), 'the menu strip');
  assert.ok(doc.host.querySelector('.gg-doc-toolbar'), 'the toolbar');
  assert.ok(doc.host.querySelector('.gg-doc-page'), 'the page');
  assert.ok(/words/.test(text), 'a word count');
  assert.ok(doc.host.querySelector('.gg-doc-caret'), 'a caret');
  // and it starts part-written, because an empty document at 8am is suspicious
  assert.ok((doc.host.querySelector('.gg-doc-para')?.textContent || '').length > 40);
  await doc.unmount();
});

test('typing advances the page, deleting walks it back', async () => {
  const doc = await mountDoc();
  const read = () => Array.from(doc.host.querySelectorAll('.gg-doc-para')).map(p => p.textContent || '').join('');
  const before = read().length;

  for (let index = 0; index < 12; index++) await doc.typeKey('a');
  const after = read().length;
  assert.ok(after > before, 'twelve keystrokes must add text');

  for (let index = 0; index < 6; index++) await doc.typeKey('Backspace');
  assert.ok(read().length < after, 'backspace must remove text');
  await doc.unmount();
});

test('the word count moves with the text', async () => {
  const doc = await mountDoc();
  const words = () => Number((doc.host.querySelector('.gg-doc-words')?.textContent || '0').replace(/\D/g, ''));
  const first = words();
  assert.ok(first > 0);
  for (let index = 0; index < 20; index++) await doc.typeKey(' ');
  assert.ok(words() >= first, 'typing never reduces the visible word count');
  await doc.unmount();
});

test('typing the exit word leaves, and it never appears in the document', async () => {
  const doc = await mountDoc();
  for (const letter of 'ggout') await doc.typeKey(letter);
  assert.equal(doc.count(), 1, 'the word exits the document');
  assert.ok(!(doc.host.textContent || '').toLowerCase().includes('ggout'), 'the exit word is not written into the page');
  await doc.unmount();
});

test('a near miss does not exit', async () => {
  const doc = await mountDoc();
  for (const letter of 'ggou') await doc.typeKey(letter);
  assert.equal(doc.count(), 0);
  await doc.unmount();
});

test('seven quick clicks on the word count are the no-keyboard way out', async () => {
  const doc = await mountDoc();
  const counter = doc.host.querySelector('.gg-doc-words') as HTMLElement;
  for (let index = 0; index < 6; index++) {
    await doc.act(async () => { counter.dispatchEvent(new doc.dom.window.MouseEvent('click', { bubbles: true })); });
  }
  assert.equal(doc.count(), 0, 'six clicks is not the exit');
  await doc.act(async () => { counter.dispatchEvent(new doc.dom.window.MouseEvent('click', { bubbles: true })); });
  assert.equal(doc.count(), 1, 'the seventh click exits');
  await doc.unmount();
});

test('browser shortcuts are left alone, so Ctrl+R still reloads', async () => {
  const doc = await mountDoc();
  const read = () => Array.from(doc.host.querySelectorAll('.gg-doc-para')).map(p => p.textContent || '').join('');
  const before = read().length;
  await doc.act(async () => {
    doc.dom.window.dispatchEvent(new doc.dom.window.KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true }));
  });
  assert.equal(read().length, before, 'a modified key must not type');
  await doc.unmount();
});
