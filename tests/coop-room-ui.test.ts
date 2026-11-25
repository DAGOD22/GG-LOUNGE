import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import { readFileSync } from 'node:fs';

/**
 * The co-op panel, as a person meets it.
 *
 * The room code is the whole interface, so the test pins that: the panel opens
 * from one button, it asks for a code rather than a link or a QR, a typo in a
 * code is normalised before it goes anywhere, and the panic path closes the
 * panel and abandons the room rather than leaving it running.
 *
 * WebRTC itself is not exercised — jsdom has no RTCPeerConnection, and a real
 * peer needs a second browser. The handshake logic that can be tested without a
 * network lives in `tests/coop-live.test.ts`; this file covers the surface.
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
  g.CustomEvent = dom.window.CustomEvent;
  g.localStorage = dom.window.localStorage;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  // jsdom has no matchMedia; the provider asks it whether to honour the
  // reduced-motion preference. "No preference" is the honest answer here.
  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  g.matchMedia = dom.window.matchMedia;
  g.MutationObserver = dom.window.MutationObserver;
  g.requestAnimationFrame = (callback: FrameRequestCallback) => dom.window.setTimeout(() => callback(performance.now()), 16) as unknown as number;
  g.cancelAnimationFrame = (handle: number) => dom.window.clearTimeout(handle);
  g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

  // The panel polls and posts; nothing here should reach a real network.
  const calls: { url: string; body: unknown }[] = [];
  g.fetch = async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    return {
      ok: true,
      status: 200,
      json: async () => ({ open: false, status: null, events: [], peers: [], online: 0 }),
    };
  };
  return { dom, calls };
}

async function mountRoom() {
  const { dom, calls } = installDom();
  const { CoopRoom } = await import('../components/live/CoopRoom');
  // The panel reads the room's live settings (ghost/feed switches, panic mode);
  // mounting it without the provider would test a component the app never
  // renders in that state.
  const { CustomizationProvider } = await import('../components/customization/CustomizationProvider');
  const { createRoot } = await import('react-dom/client');
  const { act } = React as any;
  const host = dom.window.document.createElement('div');
  dom.window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(CustomizationProvider, null, React.createElement(CoopRoom)));
  });
  return {
    dom, calls, host, act,
    click: async (element: Element) => {
      await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    },
    unmount: async () => { await act(async () => root.unmount()); },
  };
}

test('one button opens the room, and it asks for a code', async () => {
  const room = await mountRoom();
  const trigger = room.host.querySelector('.gg-coop-trigger') as HTMLElement;
  assert.ok(trigger, 'the trigger is present on every page');
  assert.match(trigger.textContent || '', /Play with a friend/i);
  assert.equal(room.host.querySelector('.gg-coop-panel'), null, 'the panel starts closed');

  await room.click(trigger);
  const panel = room.host.querySelector('.gg-coop-panel') as HTMLElement;
  assert.ok(panel, 'the panel opens');
  const input = panel.querySelector('.gg-coop-join input') as HTMLInputElement | null;
  assert.ok(input, 'there is a code input');
  assert.match(`${input.placeholder} ${input.getAttribute('aria-label')}`, /room code/i, 'it names the room code');
  assert.equal(input.maxLength, 6, 'the code is six characters, as designed');
  // No QR code, per the brief: the room code is the only joining mechanism.
  assert.equal(panel.querySelector('canvas,svg[data-qr]'), null, 'no QR code');
  await room.unmount();
});

test('a typed code is normalised before it is used', async () => {
  const room = await mountRoom();
  await room.click(room.host.querySelector('.gg-coop-trigger') as HTMLElement);
  const input = room.host.querySelector('.gg-coop-join input') as HTMLInputElement;
  assert.ok(input);

  await room.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(room.dom.window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'ab-cd 3e');
    input.dispatchEvent(new room.dom.window.Event('input', { bubbles: true }));
  });

  // Whatever reaches the network must be a canonical code, never the raw text.
  await room.act(async () => {
    input.closest('form')?.dispatchEvent(new room.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });
  const posted = room.calls.filter(call => String(call.url).includes('/api/coop'));
  for (const call of posted) {
    const body = call.body as { code?: string } | undefined;
    if (body?.code) assert.match(body.code, /^[A-Z2-9]{6}$/, `code "${body.code}" must be canonical`);
  }
  await room.unmount();
});

test('the panic key closes the room and abandons it', async () => {
  const room = await mountRoom();
  await room.click(room.host.querySelector('.gg-coop-trigger') as HTMLElement);
  assert.ok(room.host.querySelector('.gg-coop-panel'), 'the panel is open');

  await room.act(async () => {
    room.dom.window.dispatchEvent(new room.dom.window.CustomEvent('ggl:panic'));
  });

  assert.equal(room.host.querySelector('.gg-coop-panel'), null, 'the panel is hidden');
  assert.equal(
    room.host.querySelector('.gg-coop-trigger')?.className.includes('is-live'),
    false,
    'the room is no longer advertised as live',
  );
  await room.unmount();
});

test('a room that cannot connect says so instead of pretending', async () => {
  const room = await mountRoom();
  // WebRTC is absent in jsdom; the honest response is a message, not a spinner.
  await room.click(room.host.querySelector('.gg-coop-trigger') as HTMLElement);
  const start = Array.from(room.host.querySelectorAll('button')).find(button =>
    /open a room|create/i.test(button.textContent || ''),
  ) as HTMLElement | undefined;
  if (start) {
    await room.click(start);
    const status = room.host.querySelector('.gg-live-status')?.textContent || '';
    const error = room.host.querySelector('[role="alert"]')?.textContent || '';
    assert.ok(status.length > 4 || error.length > 4, 'something is said about the state');
  }
  await room.unmount();
});

/**
 * The room offers two-player games, and the offer is honest.
 *
 * Before this, the panel's only game control was "send this game" for whatever
 * was already open — which is useless when the open game has one player in it.
 * These tests pin the picker: it appears while the room is still waiting for the
 * friend, it lists only verified two-player titles, its controls text is shown
 * (nobody should have to guess which half of the keyboard they own), and
 * choosing one asks the launcher to open it for both people.
 */
test('the room lists two-player games before the friend has even joined', async () => {
  const room = await mountRoom();
  await room.click(room.host.querySelector('.gg-coop-trigger') as HTMLElement);
  await room.click([...room.host.querySelectorAll('button')].find(b => /Create a room/i.test(b.textContent || ''))!);
  // The create call is answered by the stubbed fetch, so a code comes back.
  await new Promise(resolve => setTimeout(resolve, 50));

  const tiles = [...room.host.querySelectorAll('.gg-coop-game')] as HTMLElement[];
  assert.ok(tiles.length >= 5, `the picker shows ${tiles.length} games, expected a real list`);

  // The controls line is the difference between a playable game and a guessing
  // game, so every tile must carry one.
  for (const tile of tiles) {
    assert.ok((tile.querySelector('span')?.textContent || '').length > 3, `${tile.textContent} has no controls hint`);
  }
  await room.unmount();
});

test('picking a two-player game asks the launcher to open it', async () => {
  const room = await mountRoom();
  const launched: string[] = [];
  const listener = (event: Event) => launched.push((event as CustomEvent<{ gameId: string }>).detail.gameId);
  room.dom.window.addEventListener('ggl:launch-game', listener as EventListener);

  await room.click(room.host.querySelector('.gg-coop-trigger') as HTMLElement);
  await room.click([...room.host.querySelectorAll('button')].find(b => /Create a room/i.test(b.textContent || ''))!);
  await new Promise(resolve => setTimeout(resolve, 50));

  const tile = [...room.host.querySelectorAll('.gg-coop-game')].find(t => /level devil/i.test(t.textContent || '')) as HTMLElement;
  assert.ok(tile, 'Level Devil is offered');
  await room.click(tile);

  assert.deepEqual(launched, ['level-devil'], 'the launcher is told exactly once, with the right id');
  assert.equal(tile.getAttribute('aria-pressed'), 'true', 'the chosen tile shows as chosen');
  room.dom.window.removeEventListener('ggl:launch-game', listener as EventListener);
  await room.unmount();
});

test('the seat toggle explains that a friend drives player two', async () => {
  // Deliberately a source assertion: the toggle lives behind a *connected* room,
  // and jsdom has no RTCPeerConnection, so a mounted test cannot reach it. What
  // must not regress is the wording — "send my keys to their game" did not say
  // whose character moved, which is exactly the confusion that made forwarding
  // look broken even when the transport was fine.
  const source = readFileSync(new URL('../components/live/CoopRoom.tsx', import.meta.url), 'utf8');
  assert.match(source, /I am player two/, 'the toggle says which seat you are taking');
  assert.match(source, /your presses arrive on player two/i, 'the room says where the keys land');
  assert.ok(!/>Send my keys to their game</.test(source), 'the ambiguous wording is gone');
});
