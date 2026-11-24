'use client';
/**
 * Keep the address bar in step with the game that is open.
 *
 * The product reason is simple: a game launch is a page view. If the URL never
 * changes, every session is one page view and the bounce rate is meaningless —
 * a visitor who plays five games looks identical to one who looked at the grid
 * and left. Pushing a real URL per launch fixes that for analytics, and it also
 * gives people something they actually want: a link they can share.
 *
 * Design notes that matter:
 *
 *   · `pushState`, not `replaceState` — Back must close the game, which means
 *     each launch has to be its own history entry.
 *   · `?game=<id>` for every launch, local or proxied. `/play/<id>` still
 *     resolves for links already shared, but not pushing it means one code path
 *     instead of two.
 *   · The history state carries a marker, so we only ever pop entries we made.
 *   · Deep links work on first paint, including the legacy `?play=` parameter
 *     and the path form that older /g/<id> landing pages emit.
 */

import { useCallback, useEffect, useRef } from 'react';
import { gameUrl, GAME_QUERY_KEY, type LaunchableGame } from './game-url';

/**
 * Absolute URLs for every history write.
 *
 * A relative `?game=x` is resolved by browsers against the *current* document,
 * which keeps a legacy `/play/<id>` path in place instead of returning to the
 * grid. Resolving it here removes that ambiguity — jsdom gets it wrong, and a
 * real browser only gets it right by accident.
 */
function hrefFor(target: string): string {
  try {
    return new URL(target, window.location.origin).toString();
  } catch {
    return target;
  }
}

export type { LaunchableGame };

export interface GameUrlOptions {
  /** The game currently open, or null when on the grid. */
  openGameId: string | null;
  /** Open a game without touching history (used when replaying popstate). */
  openGame: (id: string) => void;
  /** Close the open game without touching history. */
  closeGame: () => void;
  /** Resolve ids once community games finish loading. */
  ready: boolean;
  /** Games that can be deep-linked; guards against unknown ids. */
  known: (id: string) => boolean;
  /** Unused since every launch uses the query form; kept for call sites. */
  isProxy?: (id: string) => boolean;
}

const STATE_KEY = 'gglGame';

export { gameUrl };

/** Which game does this URL refer to, if any? */
export function gameFromLocation(search: string): { id: string; fromPath: string } | null {
  const params = new URLSearchParams(search);
  // `play` is the legacy parameter still used by /g/[id] landing pages.
  const id = params.get(GAME_QUERY_KEY) || params.get('play');
  return id ? { id, fromPath: 'query' } : null;
}

/** True when the current path is /play/<id>. */
export function pathGameId(pathname: string): string | null {
  const match = /^\/play\/([^/?#]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function useGameUrl({ openGameId, openGame, closeGame, ready, known }: GameUrlOptions) {
  /** Set while we are reacting to a popstate, so we don't push again. */
  const replaying = useRef(false);
  /** Set while we push, so the state-change effect ignores our own write. */
  const writing = useRef(false);

  /** Push the URL for a launch. Called by the page's launch(). */
  const pushGame = useCallback((game: LaunchableGame) => {
    if (replaying.current || typeof window === 'undefined') return;
    const target = gameUrl(game);
    const current = `${window.location.pathname}${window.location.search}`;
    // Already on this game's URL — a re-launch from the frame's own Play button
    // should not stack identical history entries.
    if (current === target || new URLSearchParams(window.location.search).get(GAME_QUERY_KEY) === game.id) {
      return;
    }
    writing.current = true;
    try {
      window.history.pushState({ [STATE_KEY]: game.id }, '', hrefFor(target));
    } finally {
      writing.current = false;
    }
  }, []);

  /** Push the grid URL when a game closes. */
  const pushHome = useCallback(() => {
    if (replaying.current || typeof window === 'undefined') return;
    if (window.location.pathname === '/' && !window.location.search) return;
    writing.current = true;
    try {
      window.history.pushState({ [STATE_KEY]: null }, '', hrefFor('/'));
    } finally {
      writing.current = false;
    }
  }, []);

  /* ---------- restore from the URL (first paint + refresh + shared link) ---------- */
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current) return;
    const fromPath = pathGameId(window.location.pathname);
    const found = fromPath ? { id: fromPath } : gameFromLocation(window.location.search);
    if (found && known(found.id)) {
      restored.current = true;
      replaying.current = true;
      openGame(found.id);
      replaying.current = false;
      // Normalise a legacy path or ?play= link to the current query form
      // without adding a history entry, so Back still leaves the site cleanly.
      if (window.location.pathname !== '/' || window.location.search.includes('play=')) {
        writing.current = true;
        try {
          window.history.replaceState({ [STATE_KEY]: found.id }, '', hrefFor(gameUrl(found)));
        } finally {
          writing.current = false;
        }
      }
    }
  }, [ready, known, openGame]);

  /* ---------- Back / Forward ---------- */
  useEffect(() => {
    const onPop = () => {
      const fromPath = pathGameId(window.location.pathname);
      const found = fromPath ? { id: fromPath } : gameFromLocation(window.location.search);
      replaying.current = true;
      if (found && known(found.id)) openGame(found.id);
      else closeGame();
      replaying.current = false;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [openGame, closeGame, known]);

  /* ---------- keep the URL honest if the game closes some other way ---------- */
  // ESC, the close button, and finishing a game all call closeGame(); none of
  // them go through popstate, so the URL would otherwise still name a game that
  // is no longer on screen.
  //
  // This must fire only on a real close, i.e. when the open game went from an
  // id to null. Effects in one commit all see the props of that commit, so a
  // deep link's restore effect calls openGame() and this effect still reads the
  // *previous* (null) id — and used to "clean up" the URL it had just been
  // handed, wiping the deep link before the game could render.
  const wasOpen = useRef<string | null>(null);
  useEffect(() => {
    const previously = wasOpen.current;
    wasOpen.current = openGameId;
    if (!openGameId) {
      if (!previously) return;
    } else {
      return;
    }
    if (writing.current) return;
    const fromPath = pathGameId(window.location.pathname);
    const found = fromPath ? { id: fromPath } : gameFromLocation(window.location.search);
    if (found) {
      writing.current = true;
      try {
        window.history.pushState({ [STATE_KEY]: null }, '', hrefFor('/'));
      } finally {
        writing.current = false;
      }
    }
  }, [openGameId]);

  return { pushGame, pushHome };
}
