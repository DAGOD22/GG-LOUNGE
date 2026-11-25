'use client';

/**
 * What this player is doing, reported from wherever they are.
 *
 * Presence used to know one thing about a player: which game the modal had
 * open, set by `GameModal`. Every other page — the tools page, the proxy, the
 * apps list, GG-GPT — reported nothing, so the roster said "online" and the
 * feed could only ever announce a game launch. The user's ask was the opposite:
 * see who is on, and what they opened.
 *
 * This component is mounted once per page and turns a route into an activity:
 *
 *   · `/`                     → idle on the lounge (cleared, not "the lounge")
 *   · `/apps`                 → on the apps page
 *   · `/tools#qr`             → using the QR generator
 *   · `/proxy?url=…`          → in the proxy on youtube.com
 *   · `/g/slope`, `/?play=…`  → playing Slope (the modal also sets this; the
 *                               lease is what makes a direct link work)
 *   · anything else           → the route's own title, or nothing
 *
 * Two rules it follows:
 *
 *   · **It reports `label`s, not URLs.** A proxy destination is reduced to
 *     `youtube.com` before it leaves the browser, so a search term typed into
 *     the proxied site never appears in another player's feed. The server
 *     re-checks this (hostOnly) rather than trusting the client.
 *   · **It is a lease.** The report is re-asserted every 20 s while the page is
 *     visible, because a client-side navigation can replace the route without
 *     unmounting anything, and a stale "playing Slope" is worse than no label.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { useLivePresence } from './PresenceProvider';
import { games } from '@/lib/games';
import { hostOnly } from '@/lib/proxy-client';
import { getProxyDestination, subscribeProxyDestination } from '@/lib/proxy-activity';
import type { Activity } from '@/lib/presence';

/** Pages that get a friendly name in the roster, keyed by pathname. */
const PAGE_NAMES: Record<string, string> = {
  '/apps': 'the apps page',
  '/proxy': 'the proxy',
  '/tools': 'the tools page',
  '/gg-gpt': 'GG-GPT',
  '/request-game': 'game requests',
  '/youtube': 'the YouTube player',
  '/customization': 'the theme editor',
};

/** How often a page re-asserts what it is, in ms. */
const LEASE_MS = 20_000;

/**
 * Tool id → name, filled lazily.
 *
 * The registry is imported dynamically because this component is mounted on
 * every page and the tools page's hundred entries have no business in the
 * bundle for a page that will never render one.
 */
let TOOL_LABELS: Record<string, string> = {};

const byId = new Map(games.map(game => [game.id, game]));

/**
 * Turn a location into an activity, or null when there is nothing to say.
 *
 * Pure and exported so the mapping can be tested without a DOM: this is the
 * part that decides what other players see, and getting it wrong is either a
 * privacy leak (a path, a query) or a lie (a label for a page that is not open).
 */
export function activityFor(
  pathname: string,
  search: URLSearchParams,
  hash: string,
  /** The proxy frame's live destination, when one is open in this tab. */
  frameDestination = '',
): Activity | null {
  // A game opened from the lounge (`?play=slope`) or from its landing page.
  const play = search.get('play');
  if (play && byId.has(play)) {
    return { kind: 'game', label: byId.get(play)!.title, game: play };
  }
  const gamePage = pathname.match(/^\/g\/([\w-]+)$/);
  if (gamePage && byId.has(gamePage[1])) {
    return { kind: 'game', label: byId.get(gamePage[1])!.title, game: gamePage[1] };
  }

  if (pathname === '/' || pathname === '') return null;

  if (pathname === '/proxy') {
    // The frame's own reported destination wins over `?url=`: the query string
    // is only where the *first* navigation is recorded, and it goes stale the
    // moment someone clicks a link inside the proxied page.
    const target = frameDestination || search.get('url') || '';
    const host = target ? hostOnly(target) : '';
    return host ? { kind: 'proxy', label: host, game: null } : { kind: 'page', label: 'the proxy', game: null };
  }

  if (pathname === '/tools') {
    // The hash is the open tool. It is only a label if we can name it, which
    // is what stops `#<arbitrary>` from reaching another player.
    const id = hash.replace(/^#/, '');
    const name = id ? TOOL_LABELS[id] : '';
    return name ? { kind: 'tools', label: name, game: null } : { kind: 'tools', label: 'the tools page', game: null };
  }

  const named = PAGE_NAMES[pathname];
  if (named) return { kind: 'page', label: named, game: null };

  return null;
}

export function ActivityReporter() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { setActivity, announce, ghostCursors } = useLivePresence();
  const lastKey = useRef('');
  // Bumped when the tool-name table arrives, so the effect re-runs and the
  // roster gets "#qr" rather than "the tools page".
  const [labelsVersion, setLabelsVersion] = useState(0);
  const [frameDestination, setFrameDestination] = useState('');

  // Names for `#tool` hashes, loaded once and only when a tools page is open.
  useEffect(() => {
    if (pathname !== '/tools' || Object.keys(TOOL_LABELS).length) return;
    import('@/lib/tools/registry')
      .then(({ TOOLS }) => {
        TOOL_LABELS = Object.fromEntries(TOOLS.map(tool => [tool.id, tool.name]));
        lastKey.current = '';
        setLabelsVersion(version => version + 1);
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (!ghostCursors) return;

    const report = () => {
      const query = search?.toString() ?? '';
      const hash = typeof window === 'undefined' ? '' : window.location.hash;
      const activity = activityFor(
        pathname ?? '/',
        new URLSearchParams(query),
        hash,
        getProxyDestination(),
      );
      const key = activity ? `${activity.kind}:${activity.label}:${activity.game ?? ''}` : '';
      if (key === lastKey.current) {
        // Same thing as last time, but the lease still has to be renewed or the
        // roster row ages out even though the player is still on the page.
        setActivity(activity);
        return;
      }
      lastKey.current = key;
      setActivity(activity);

      // Announcing is a separate decision from reporting. A page you land on
      // once is worth a line in the feed; re-asserting that lease every 20 s
      // is not, which is why the server also rate-limits each kind.
      if (!activity) return;
      if (activity.kind === 'proxy') {
        announce('browsing', { url: activity.label });
      } else if (activity.kind === 'page' || activity.kind === 'tools') {
        announce('visited', { page: pathname ?? '/' });
      }
      // A game announces itself from the modal, which has the achievement and
      // split-screen context; announcing here too would double every launch.
    };

    report();
    const timer = window.setInterval(() => {
      if (!document.hidden) report();
    }, LEASE_MS);

    // A hash change (picking another tool) is a real change of activity and
    // does not re-render this component.
    const onHash = () => {
      lastKey.current = '';
      report();
    };
    window.addEventListener('hashchange', onHash);
    // The proxy frame navigates without changing this route, so it has to tell
    // us. Clearing `lastKey` makes the next report a real change, which is what
    // puts each new destination in the feed rather than just in the roster.
    const unsubscribe = subscribeProxyDestination(next => {
      setFrameDestination(next);
      lastKey.current = '';
    });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('hashchange', onHash);
      unsubscribe();
    };
  }, [pathname, search, setActivity, announce, ghostCursors, labelsVersion, frameDestination]);

  return null;
}
