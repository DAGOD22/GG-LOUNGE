/**
 * Behaviour tests for the tools page.
 *
 * The logic is covered in tests/tools-logic.test.ts and the encoder in
 * tests/qr.test.ts. What is left is the wiring, and the wiring is where this
 * page can fail quietly: a tool listed in the registry with no panel renders a
 * "still being built" card, and a hash that no longer matches a tool id leaves
 * someone on a page that ignores their link.
 *
 * So these tests mount the real component in jsdom and check the things a
 * visitor would notice:
 *
 *   · every one of the hundred tools has a real panel — no placeholders,
 *   · opening a tool from the rail swaps the panel and updates the hash,
 *   · a bad hash falls back to the default instead of a blank screen,
 *   · search and category filters narrow the list and can be cleared,
 *   · the QR panel regenerates when its text changes, and refuses text that is
 *     too long with a message rather than an empty box.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';

function installDom(hash = '') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: `https://gg-lounge.test/tools${hash}` });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.KeyboardEvent = dom.window.KeyboardEvent;
  g.MouseEvent = dom.window.MouseEvent;
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  // The page writes the selected tool into the hash; jsdom supports it, but the
  // components also scroll their panel into view, which jsdom does not.
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  return dom;
}

async function mount(element: React.ReactElement, hash = '') {
  const dom = installDom(hash);
  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;
  const host = dom.window.document.createElement('div');
  dom.window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return {
    dom,
    host,
    act,
    click: async (node: Element | null) => {
      assert.ok(node, 'expected an element to click');
      await act(async () => {
        node!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      });
    },
    type: async (node: Element | null, value: string, tag = 'HTMLInputElement') => {
      assert.ok(node, 'expected an input to type into');
      const prototype = tag === 'HTMLTextAreaElement' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
      // React tracks the previous value on the node, so setting `.value`
      // directly is ignored unless the native setter is used first.
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;
      await act(async () => {
        setter.call(node, value);
        node!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
    },
    text: () => host.textContent || '',
    find: (selector: string) => host.querySelector(selector),
    findAll: (selector: string) => [...host.querySelectorAll(selector)],
    unmount: async () => { await act(async () => root.unmount()); },
  };
}

let ToolsPageRef: typeof import('../components/tools/ToolsPage').ToolsPage;
let TOOLS: typeof import('../lib/tools/registry').TOOLS;
let missingPanels: typeof import('../components/tools/ToolsPage').missingPanels;

async function load() {
  if (!ToolsPageRef) {
    installDom();
    ({ ToolsPage: ToolsPageRef, missingPanels } = await import('../components/tools/ToolsPage'));
    ({ TOOLS } = await import('../lib/tools/registry'));
  }
}

test('every tool in the registry has a panel behind it', async () => {
  await load();
  assert.equal(TOOLS.length, 100);
  assert.deepEqual(missingPanels(), [], 'a tool without a panel would render a placeholder card');
});

test('the page renders the default tool, the full list and the directory', async () => {
  await load();
  const page = await mount(React.createElement(ToolsPageRef));
  const text = page.text();

  assert.match(text, /GG Tools/);
  // The default tool's panel is mounted, not just its title.
  assert.match(text, /Text or link/, 'the QR panel should be open by default');
  assert.match(text, /Error correction level M/);
  // The rail lists all hundred, and the directory repeats them as links.
  assert.equal(page.findAll('.tools-list-item').length, 100);
  assert.equal(page.findAll('.tools-directory-links a').length, 100);
  assert.match(text, /Tool 1 of 100/);
  await page.unmount();
});

test('opening a tool from the rail swaps the panel and the hash', async () => {
  await load();
  const page = await mount(React.createElement(ToolsPageRef));
  const target = page.findAll('.tools-list-item').find(node => node.textContent?.includes('Calculator'))!;
  await page.click(target);

  assert.equal(page.dom.window.location.hash, '#calculator');
  assert.ok(page.find('.calc-display'), 'the calculator input should be mounted');
  assert.equal(page.find('.calc-display')!.getAttribute('aria-label'), 'Calculator expression');
  assert.match(page.text(), /History/);
  assert.ok(!page.text().includes('Error correction level M'), 'the previously open panel should be gone');
  await page.unmount();
});

test('the calculator panel computes through its buttons', async () => {
  await load();
  const page = await mount(React.createElement(ToolsPageRef), '#calculator');

  // 7 × 8 = 56, pressed in order.
  const keys = page.findAll('.calc-key');
  const press = async (label: string) => {
    const key = keys.find(node => node.textContent?.trim() === label);
    await page.click(key ?? null);
  };
  await press('7');
  await press('×');
  await press('8');
  assert.match(page.text(), /= 56/, 'the live preview should show the running result');
  await page.unmount();
});

test('a hash that does not match a tool falls back to the default', async () => {
  await load();
  const page = await mount(React.createElement(ToolsPageRef), '#not-a-real-tool');
  assert.match(page.text(), /Text or link/, 'should show the default panel rather than nothing');
  assert.match(page.text(), /Tool 1 of 100/);
  await page.unmount();
});

test('search narrows the list and the clear button restores it', async () => {
  await load();
  const page = await mount(React.createElement(ToolsPageRef));
  const search = page.find('.tools-search input');
  await page.type(search, 'qr');
  assert.ok(page.findAll('.tools-list-item').length < 100, 'search should filter');
  assert.match(page.text(), /QR generator/);

  await page.type(search, '');
  assert.equal(page.findAll('.tools-list-item').length, 100);
  await page.unmount();
});

test('searching for something absent says so instead of showing everything', async () => {
  await load();
  const page = await mount(React.createElement(ToolsPageRef));
  await page.type(page.find('.tools-search input'), 'zzzz-no-such-tool');
  assert.equal(page.findAll('.tools-list-item').length, 0);
  assert.match(page.text(), /Nothing matches/);
  await page.unmount();
});

test('a category filter shows only that category', async () => {
  await load();
  const page = await mount(React.createElement(ToolsPageRef));
  const randomButton = page.findAll('.tools-category-row button').find(node => node.textContent?.startsWith('Random'))!;
  await page.click(randomButton);
  const shown = page.findAll('.tools-list-item').length;
  assert.equal(shown, TOOLS.filter(tool => tool.category === 'Random').length);
  assert.ok(shown > 0 && shown < 100);
  await page.unmount();
});

test('the QR panel regenerates when the text changes and reports oversize input', async () => {
  await load();
  const page = await mount(React.createElement(ToolsPageRef));
  const textarea = page.find('.tool-textarea');
  assert.ok(page.find('.tool-qr-preview svg'), 'a code should be rendered on load');

  await page.type(textarea, 'https://example.com/another-link', 'HTMLTextAreaElement');
  // The panel debounces by 120 ms before re-encoding.
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.ok(page.find('.tool-qr-preview svg'), 'a code should still be rendered after editing');

  await page.type(textarea, 'x'.repeat(400), 'HTMLTextAreaElement');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.match(page.text(), /too long/i, 'oversize text should be explained, not silently ignored');
  assert.equal(page.find('.tool-qr-preview svg'), null);
  await page.unmount();
});
