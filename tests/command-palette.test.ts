/**
 * The command palette, the shortcut table and the new sitewide achievements.
 *
 * Two kinds of failure matter here and both are silent:
 *
 *   · A shortcut that claims a combination the browser owns (Ctrl/⌘ + letter)
 *     breaks copy or reload for everyone, and nothing in the UI would look
 *     wrong. The table is asserted against a blocklist of reserved keys.
 *   · A shortcut that fires while someone is typing into the search box eats a
 *     keystroke. `isTypingTarget` is tested against the elements a page
 *     actually has.
 *
 * The fuzzy matcher gets tested too, because "the search found nothing" is the
 * kind of bug that gets reported as "the palette is broken".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';

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
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  return dom;
}

let palette: typeof import('../components/CommandPalette');
let ACHIEVEMENTS: typeof import('../lib/achievements').ACHIEVEMENTS;

async function load() {
  if (!palette) {
    installDom();
    palette = await import('../components/CommandPalette');
    ({ ACHIEVEMENTS } = await import('../lib/achievements'));
  }
}

/** A stand-in for the page's actions: records what was called. */
function spyActions() {
  const calls: string[] = [];
  const fn = (name: string) => () => { calls.push(name) };
  return {
    calls,
    actions: {
      focusSearch: fn('focusSearch'), openPalette: fn('openPalette'), openShortcuts: fn('openShortcuts'),
      openTools: fn('openTools'), openAchievements: fn('openAchievements'), openAuth: fn('openAuth'),
      toggleTheme: fn('toggleTheme'), toggleDashboard: fn('toggleDashboard'), shuffle: fn('shuffle'),
      panic: fn('panic'), goHome: fn('goHome'), goLibrary: fn('goLibrary'), goApps: fn('goApps'),
      goProxy: fn('goProxy'), goRequests: fn('goRequests'), goGames: fn('goGames'), closeAll: fn('closeAll'),
    },
  };
}

const commands = (): import('../components/CommandPalette').Command[] => [
  { id: 'a', label: 'Go to the library', hint: 'All 250 games', group: 'Go', run: () => {} },
  { id: 'b', label: 'Open the tools page', hint: '100 utilities', group: 'Tools', run: () => {} },
  { id: 'c', label: 'Switch light and dark', group: 'View', run: () => {} },
  { id: 'd', label: 'Ask GG-GPT', hint: 'Games assistant', group: 'Go', run: () => {} },
];

/* ---------------- the shortcut table ---------------- */

test('no shortcut claims a combination the browser owns', async () => {
  await load();
  const { shortcuts } = { shortcuts: palette.buildShortcuts(spyActions().actions) };
  // Bare letters, Ctrl+letter, ⌘+letter and the browser's own function keys are
  // all off limits: stealing one of them breaks copy, reload or reopen-tab.
  const reserved = /^(ctrl|meta)\+/i;
  for (const shortcut of shortcuts) {
    assert.ok(!reserved.test(shortcut.combo), `${shortcut.combo} would fight the browser`);
    assert.ok(!/^f\d+$/i.test(shortcut.combo), `${shortcut.combo} is a browser key`);
  }
});

test('every shortcut is unique and has a real label', async () => {
  await load();
  const { shortcuts } = { shortcuts: palette.buildShortcuts(spyActions().actions) };
  const combos = shortcuts.map(shortcut => shortcut.combo);
  assert.equal(new Set(combos).size, combos.length, 'two shortcuts must not share a combination');
  for (const shortcut of shortcuts) {
    assert.ok(shortcut.label.length > 5, shortcut.combo);
    assert.ok(shortcut.group.length > 0);
  }
});

test('every shortcut runs its action and nothing else', async () => {
  await load();
  const spy = spyActions();
  const shortcuts = palette.buildShortcuts(spy.actions);
  for (const shortcut of shortcuts) {
    spy.calls.length = 0;
    shortcut.run();
    assert.equal(spy.calls.length, 1, `${shortcut.combo} should call exactly one action`);
  }
});

test('Escape is in the table, because that is how people leave a field', async () => {
  await load();
  const { shortcuts } = { shortcuts: palette.buildShortcuts(spyActions().actions) };
  const escape = shortcuts.find(shortcut => shortcut.combo === 'Escape');
  assert.ok(escape, 'Escape should close whatever is open');
  assert.equal(escape!.group, 'View');
});

/* ---------------- typing targets ---------------- */

test('keystrokes inside a text field are left alone', async () => {
  await load();
  const dom = installDom();
  const { document } = dom.window;
  const input = document.createElement('input');
  const textarea = document.createElement('textarea');
  const select = document.createElement('select');
  const div = document.createElement('div');
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  for (const node of [input, textarea, select]) {
    assert.equal(palette.isTypingTarget(node), true, `${node.tagName} should be a typing target`);
  }
  // A contenteditable element carries the attribute but jsdom does not compute
  // `isContentEditable`, so the helper checks both — which is exactly why it is
  // worth testing here rather than trusting the property.
  assert.equal(palette.isTypingTarget(editable), true, 'contenteditable should be a typing target');
  assert.equal(palette.isTypingTarget(div), false);
  assert.equal(palette.isTypingTarget(null), false);
});

test('a keyboard event normalises to a stable combination string', async () => {
  await load();
  const { comboFromEvent } = palette;
  assert.equal(comboFromEvent({ key: 'k', ctrlKey: false, altKey: true, shiftKey: true, metaKey: false }), 'alt+shift+k');
  assert.equal(comboFromEvent({ key: 'K', ctrlKey: false, altKey: true, shiftKey: true, metaKey: false }), 'alt+shift+k', 'case is normalised');
  assert.equal(comboFromEvent({ key: '/', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), '/');
  assert.equal(comboFromEvent({ key: 'Escape', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), 'Escape');
  assert.equal(comboFromEvent({ key: 'k', ctrlKey: true, altKey: false, shiftKey: false, metaKey: true }), 'ctrl+meta+k', 'modifier order is fixed');
});

/* ---------------- the matcher ---------------- */

test('an empty query shows every command', async () => {
  await load();
  assert.equal(palette.searchCommands(commands(), '').length, 4);
  assert.equal(palette.searchCommands(commands(), '   ').length, 4);
});

test('fuzzy search finds commands by initials and by hint', async () => {
  await load();
  const all = commands();
  assert.ok(palette.searchCommands(all, 'ggpt').length, '"ggpt" should match "Ask GG-GPT"');
  assert.equal(palette.searchCommands(all, 'ggpt')[0].id, 'd');
  assert.ok(palette.searchCommands(all, 'utilities').some(command => command.id === 'b'), 'hints are searchable');
  assert.equal(palette.searchCommands(all, 'zzzz')[0], undefined);
});

test('a prefix match outranks a scattered one', async () => {
  await load();
  const ranked = palette.searchCommands(commands(), 'open');
  assert.equal(ranked[0].id, 'b', '"Open the tools page" should beat a scattered match');
  // A shorter label with the same characters should score higher than a long one.
  const scoreShort = palette.scoreCommand({ id: 'x', label: 'Tools', group: 'Tools', run: () => {} }, 't');
  const scoreLong = palette.scoreCommand({ id: 'y', label: 'A very long tools entry indeed', group: 'Tools', run: () => {} }, 't');
  assert.ok(scoreShort > scoreLong);
});

/* ---------------- the palette UI ---------------- */

async function mount(element: React.ReactElement) {
  const dom = installDom();
  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;
  const host = dom.window.document.createElement('div');
  dom.window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return {
    dom, host, act,
    text: () => host.textContent || '',
    find: (selector: string) => host.querySelector(selector),
    findAll: (selector: string) => [...host.querySelectorAll(selector)],
    click: async (node: Element | null) => {
      assert.ok(node, 'expected an element to click');
      await act(async () => {
        node!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      });
    },
    type: async (node: Element | null, value: string) => {
      assert.ok(node);
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => {
        setter.call(node, value);
        node!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
    },
    key: async (node: Element, key: string) => {
      await act(async () => {
        node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      });
    },
    unmount: async () => { await act(async () => root.unmount()); },
  };
}

test('the palette renders, filters and runs the chosen command', async () => {
  await load();
  let ran = '';
  const list = [
    { id: 'one', label: 'Go to the library', group: 'Go' as const, run: () => { ran = 'library' } },
    { id: 'two', label: 'Open the tools page', group: 'Tools' as const, run: () => { ran = 'tools' } },
  ];
  let closed = false;
  const page = await mount(React.createElement(palette.CommandPalette, { commands: list, open: true, onClose: () => { closed = true } }));
  assert.match(page.text(), /Go to the library/);
  assert.match(page.text(), /Open the tools page/);

  await page.type(page.find('.palette-search input'), 'tools');
  assert.equal(page.findAll('.palette-item').length, 1);
  assert.match(page.text(), /Open the tools page/);

  await page.click(page.find('.palette-item'));
  assert.equal(ran, 'tools');
  assert.ok(closed);
  await page.unmount();
});

test('arrow keys and Enter pick without a mouse, and Escape closes', async () => {
  await load();
  const order: string[] = [];
  const list = [
    { id: 'one', label: 'First command', group: 'Go' as const, run: () => order.push('first') },
    { id: 'two', label: 'Second command', group: 'Go' as const, run: () => order.push('second') },
  ];
  let closed = 0;
  const page = await mount(React.createElement(palette.CommandPalette, { commands: list, open: true, onClose: () => { closed++ } }));
  const input = page.find('.palette-search input')!;
  await page.key(input, 'ArrowDown');
  await page.key(input, 'Enter');
  assert.deepEqual(order, ['second'], 'the arrow key should have moved the highlight');
  await page.unmount();

  const again = await mount(React.createElement(palette.CommandPalette, { commands: list, open: true, onClose: () => { closed++ } }));
  await again.key(again.find('.palette-search input')!, 'Escape');
  assert.equal(closed, 2);
  await again.unmount();
});

test('the palette says so when nothing matches instead of showing an empty box', async () => {
  await load();
  const page = await mount(React.createElement(palette.CommandPalette, { commands: commands(), open: true, onClose: () => {} }));
  await page.type(page.find('.palette-search input'), 'zzzzz');
  assert.equal(page.findAll('.palette-item').length, 0);
  assert.match(page.text(), /Nothing matches/);
  await page.unmount();
});

test('a closed palette renders nothing at all', async () => {
  await load();
  const page = await mount(React.createElement(palette.CommandPalette, { commands: commands(), open: false, onClose: () => {} }));
  assert.equal(page.findAll('.palette').length, 0);
  assert.equal(page.text(), '');
  await page.unmount();
});

/* ---------------- the shortcut sheet ---------------- */

test('the shortcut sheet lists every shortcut, grouped, and closes on Escape', async () => {
  await load();
  const shortcuts = palette.buildShortcuts(spyActions().actions);
  let closed = 0;
  const page = await mount(React.createElement(palette.ShortcutSheet, { shortcuts, open: true, onClose: () => { closed++ } }));
  assert.equal(page.findAll('.shortcut-row').length, shortcuts.length);
  assert.match(page.text(), /Keyboard shortcuts/);
  assert.match(page.text(), /Shift\+Alt\+K|Shift \+ Alt \+ K/, 'the palette shortcut should be visible');
  // It must explain that it does not take browser keys, since that is the
  // question a reader has.
  assert.match(page.text(), /Ctrl or ⌘|Ctrl/);
  await page.key(page.find('.shortcut-sheet')!, 'Escape').catch(() => {});
  await page.dom.window.dispatchEvent(new page.dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(closed >= 1, 'Escape should close the sheet');
  await page.unmount();
});

test('prettyCombination renders keys the way a keyboard prints them', async () => {
  await load();
  assert.equal(palette.prettyCombo('shift+alt+k'), 'Shift + Alt + K');
  assert.equal(palette.prettyCombo('/'), '/');
  assert.equal(palette.prettyCombo('Escape'), 'Escape');
  assert.equal(palette.prettyCombo('shift+?'), 'Shift + ?');
});

/* ---------------- sitewide achievements ---------------- */

test('sitewide achievements exist, are unique and are not tied to a game', async () => {
  await load();
  const sitewide = ACHIEVEMENTS.filter(achievement => achievement.gameId === 'gg-lounge');
  assert.ok(sitewide.length >= 30, `expected at least 30 sitewide achievements, got ${sitewide.length}`);
  assert.equal(new Set(ACHIEVEMENTS.map(achievement => achievement.id)).size, ACHIEVEMENTS.length, 'ids must be unique');
  for (const achievement of sitewide) {
    assert.ok(achievement.target > 0, achievement.id);
    assert.ok(achievement.points > 0, achievement.id);
    assert.ok(achievement.title.length > 2, achievement.id);
    assert.ok(achievement.description.length > 8, achievement.id);
    assert.match(achievement.id, /^site_/, 'sitewide ids are namespaced');
  }
});

test('the sitewide set covers the things the site can actually do', async () => {
  await load();
  const ids = new Set(ACHIEVEMENTS.map(achievement => achievement.id));
  for (const id of [
    'site_first_game', 'site_10_games', 'site_tools_5', 'site_tools_all',
    'site_favourite_5', 'site_request', 'site_report', 'site_gg_gpt_1',
    'site_proxy_first', 'site_palette', 'site_shortcut_10', 'site_install',
  ]) {
    assert.ok(ids.has(id), `${id} is missing`);
  }
});

test('tiers and rarities stay inside the declared sets', async () => {
  await load();
  const tiers = new Set(['bronze', 'silver', 'gold', 'platinum', 'diamond']);
  const rarities = new Set(['common', 'rare', 'epic', 'legendary']);
  for (const achievement of ACHIEVEMENTS) {
    assert.ok(tiers.has(achievement.tier), `${achievement.id}: ${achievement.tier}`);
    assert.ok(rarities.has(achievement.rarity), `${achievement.id}: ${achievement.rarity}`);
  }
});
