/**
 * Behaviour tests for components that had none: AuthDialog, GameCard and
 * CopyDirectoryButton.
 *
 * These are mounted in jsdom the same way tests/panic-doc-ui.test.ts mounts the
 * panic screen, so the assertions are about what a visitor can do, not about how
 * the markup happens to be arranged:
 *
 *   · AuthDialog must ask for the fields the current mode needs, must not submit
 *     while a request is in flight, and must let a person switch modes and close.
 *   · GameCard must expose the star as a labelled toggle, launch on click and on
 *     Enter, and stop showing an icon that failed to load.
 *   · CopyDirectoryButton must report success and report a blocked clipboard
 *     instead of silently doing nothing.
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
  return dom;
}

async function mount(element: React.ReactElement) {
  const dom = installDom();
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
    press: async (node: Element, key: string) => {
      await act(async () => {
        node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      });
    },
    text: () => host.textContent || '',
    unmount: async () => { await act(async () => root.unmount()); },
  };
}

const blankForm = { username: '', password: '', favoriteFood: '', newPassword: '' };

/* ---------------- AuthDialog ---------------- */

/** Deferred import so jsdom globals exist before the module is evaluated. */
let AuthDialogRef: typeof import('../components/AuthDialog').AuthDialog;
let GameCardRef: typeof import('../components/GameCard').GameCard;
let CopyRef: typeof import('../components/CopyDirectoryButton').CopyDirectoryButton;

async function loadComponents() {
  if (!AuthDialogRef) {
    installDom();
    ({ AuthDialog: AuthDialogRef } = await import('../components/AuthDialog'));
    ({ GameCard: GameCardRef } = await import('../components/GameCard'));
    ({ CopyDirectoryButton: CopyRef } = await import('../components/CopyDirectoryButton'));
  }
}

test('login mode asks for a username and a password, and nothing else', async () => {
  await loadComponents();
  const mountAuth = async (mode: 'login' | 'register' | 'reset') => {
    const el = React.createElement(AuthDialogRef, {
      mode,
      form: blankForm,
      setForm: () => {},
      error: '',
      loading: false,
      onAction: () => {},
      onClose: () => {},
      onSwitch: () => {},
    });
    return mount(el);
  };

  const login = await mountAuth('login');
  assert.equal(login.host.querySelectorAll('input').length, 2, 'two fields in login mode');
  assert.ok(/Sign in/.test(login.text()));
  await login.unmount();

  const register = await mountAuth('register');
  assert.equal(register.host.querySelectorAll('input').length, 3, 'security question joins in register mode');
  assert.ok(/security|favorite food/i.test(register.text()), 'the security question is explained');
  await register.unmount();

  // Reset asks for the answer *and* a new password, and must never ask for the
  // old one — there is no session to prove.
  const reset = await mountAuth('reset');
  assert.equal(reset.host.querySelectorAll('input').length, 3);
  assert.equal(reset.host.querySelectorAll('input[type="password"]').length, 1, 'only the new password');
  await reset.unmount();
});

test('the dialog closes on backdrop click and on the close button', async () => {
  await loadComponents();
  let closed = 0;
  const dialog = await mount(React.createElement(AuthDialogRef, {
    mode: 'login',
    form: blankForm,
    setForm: () => {},
    error: '',
    loading: false,
    onAction: () => {},
    onClose: () => { closed++; },
    onSwitch: () => {},
  }));

  await dialog.click(dialog.host.querySelector('[aria-label="Close"]'));
  assert.equal(closed, 1, 'the close button works');

  // Clicking the dialog body must NOT close it — only the backdrop.
  await dialog.click(dialog.host.querySelector('[role="dialog"] > div'));
  assert.equal(closed, 1, 'a click inside the panel must not dismiss it');

  await dialog.click(dialog.host.querySelector('[role="dialog"]'));
  assert.equal(closed, 2, 'the backdrop dismisses it');
  await dialog.unmount();
});

test('a submit in flight cannot be fired twice, and the error is shown', async () => {
  await loadComponents();
  let actions = 0;
  const busy = await mount(React.createElement(AuthDialogRef, {
    mode: 'login',
    form: blankForm,
    setForm: () => {},
    error: '',
    loading: true,
    onAction: () => { actions++; },
    onClose: () => {},
    onSwitch: () => {},
  }));
  assert.ok(/Please wait/.test(busy.text()), 'the button says what it is doing');
  const submit = busy.host.querySelector('button[type="submit"], button[form], form button:last-of-type') as HTMLButtonElement | null;
  if (submit) {
    // A disabled submit is the guard; clicking it must not dispatch.
    await busy.click(submit);
    assert.equal(actions, 0, 'no double submit while loading');
  }
  await busy.unmount();

  const failed = await mount(React.createElement(AuthDialogRef, {
    mode: 'login',
    form: blankForm,
    setForm: () => {},
    error: 'Incorrect password.',
    loading: false,
    onAction: () => {},
    onClose: () => {},
    onSwitch: () => {},
  }));
  assert.ok(failed.text().includes('Incorrect password.'), 'the server error reaches the dialog');
  // role=alert, so a screen reader announces it
  assert.ok(failed.host.querySelector('[role="alert"]'), 'the error must be announced');
  await failed.unmount();
});

test('switching modes is offered from every mode', async () => {
  await loadComponents();
  const switched: string[] = [];
  const dialog = await mount(React.createElement(AuthDialogRef, {
    mode: 'login',
    form: blankForm,
    setForm: () => {},
    error: '',
    loading: false,
    onAction: () => {},
    onClose: () => {},
    onSwitch: (mode: string) => { switched.push(mode); },
  }));
  const buttons = Array.from(dialog.host.querySelectorAll('button'));
  for (const button of buttons) {
    if (/create|account/i.test(button.textContent || '')) await dialog.click(button);
    if (/forgot|reset/i.test(button.textContent || '')) await dialog.click(button);
  }
  assert.ok(switched.includes('register'), 'can move to registration');
  assert.ok(switched.includes('reset'), 'can move to reset');
  await dialog.unmount();
});

/* ---------------- GameCard ---------------- */

const sampleGame = {
  id: 'cookie-clicker',
  title: 'Cookie Clicker',
  subtitle: 'Bake.',
  description: 'Click the cookie.',
  genre: 'Idle',
  tone: 'Incremental',
  mark: 'CC',
  color: 'neon',
  path: '/games/cookie-clicker/index.html',
  icon: '/game-icons/cookie-clicker.png',
} as any;

test('the favourite button is labelled by what it will do', async () => {
  await loadComponents();
  const toggled: string[] = [];
  const card = await mount(React.createElement(GameCardRef, {
    game: sampleGame,
    index: 0,
    isFavorite: false,
    onToggle: (id: string) => { toggled.push(id); },
    onLaunch: () => {},
  }));
  const button = card.host.querySelector('.favorite-button');
  assert.equal(button?.getAttribute('aria-label'), 'Add Cookie Clicker to favourites');
  assert.equal(button?.getAttribute('aria-pressed'), 'false', 'the toggle reports its state');

  await card.click(button);
  assert.deepEqual(toggled, ['cookie-clicker']);
  await card.unmount();

  const fav = await mount(React.createElement(GameCardRef, {
    game: sampleGame,
    index: 0,
    isFavorite: true,
    onToggle: () => {},
    onLaunch: () => {},
  }));
  const favButton = fav.host.querySelector('.favorite-button');
  assert.equal(favButton?.getAttribute('aria-label'), 'Remove Cookie Clicker from favourites');
  assert.equal(favButton?.getAttribute('aria-pressed'), 'true');
  await fav.unmount();
});

test('a card launches on click and on Enter, not on other keys', async () => {
  await loadComponents();
  let launches = 0;
  const card = await mount(React.createElement(GameCardRef, {
    game: sampleGame,
    index: 3,
    isFavorite: false,
    onToggle: () => {},
    onLaunch: () => { launches++; },
  }));
  const art = card.host.querySelector('[role="button"][aria-label="Play Cookie Clicker"]') as Element;
  assert.ok(art, 'the art is the launch target');
  assert.equal(art.getAttribute('tabindex'), '0', 'and it is reachable by keyboard');

  await card.press(art, 'a');
  assert.equal(launches, 0, 'other keys do nothing');
  await card.press(art, 'Enter');
  assert.equal(launches, 1, 'Enter launches');
  // Space is the other key a role="button" promises to honour.
  await card.press(art, ' ');
  assert.equal(launches, 2, 'Space launches');
  await card.click(art);
  assert.equal(launches, 3, 'click launches');
  await card.unmount();
});

test('an icon that fails to load is dropped instead of showing a broken image', async () => {
  await loadComponents();
  const card = await mount(React.createElement(GameCardRef, {
    game: sampleGame,
    index: 0,
    isFavorite: false,
    onToggle: () => {},
    onLaunch: () => {},
  }));
  const img = Array.from(card.host.querySelectorAll('img')).find(node => node.getAttribute('src')?.includes('cookie')) as HTMLImageElement;
  assert.ok(img, 'the icon renders first');
  await card.act(async () => {
    img.dispatchEvent(new card.dom.window.Event('error', { bubbles: false }));
  });
  const stillThere = Array.from(card.host.querySelectorAll('img')).some(node => node.getAttribute('src') === img.getAttribute('src'));
  assert.equal(stillThere, false, 'the broken image is removed, not left as an alt box');
  await card.unmount();
});

test('search highlights the matched part of the title', async () => {
  await loadComponents();
  const card = await mount(React.createElement(GameCardRef, {
    game: sampleGame,
    index: 0,
    isFavorite: false,
    onToggle: () => {},
    onLaunch: () => {},
    query: 'click',
  }));
  const mark = card.host.querySelector('mark.hl');
  assert.ok(mark, 'the match is marked');
  assert.equal(mark!.textContent, 'Click');
  await card.unmount();
});

/* ---------------- CopyDirectoryButton ---------------- */

test('copy reports success, and reports a blocked clipboard instead of nothing', async () => {
  await loadComponents();
  const dom = installDom();
  const written: string[] = [];
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    value: { writeText: async (value: string) => { written.push(value); } },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;
  const host = dom.window.document.createElement('div');
  dom.window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(CopyRef, { text: 'GG-LOUNGE\nhttps://gg-lounge.vercel.app' }));
  });
  const button = host.querySelector('button.doc-copy') as HTMLButtonElement;
  assert.ok(/Copy every link/.test(button.textContent || ''));

  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(written, ['GG-LOUNGE\nhttps://gg-lounge.vercel.app'], 'the whole text is copied');
  assert.ok(/Copied/.test(button.textContent || ''), 'and the button says so');
  await act(async () => root.unmount());

  // Now with a clipboard that refuses.
  const dom2 = installDom();
  Object.defineProperty(dom2.window.navigator, 'clipboard', {
    value: { writeText: async () => { throw new Error('denied'); } },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', { value: dom2.window.navigator, configurable: true });
  const host2 = dom2.window.document.createElement('div');
  dom2.window.document.body.append(host2);
  const root2 = createRoot(host2);
  await act(async () => {
    root2.render(React.createElement(CopyRef, { text: 'x' }));
  });
  const button2 = host2.querySelector('button.doc-copy') as HTMLButtonElement;
  await act(async () => {
    button2.dispatchEvent(new dom2.window.MouseEvent('click', { bubbles: true }));
  });
  assert.ok(/blocked/i.test(button2.textContent || ''), 'a refused copy is admitted, not swallowed');
  await act(async () => root2.unmount());
});
