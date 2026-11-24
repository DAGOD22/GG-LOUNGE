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
 *   · `/play/<id>` is used for games the built-in browser can host, and
 *     `/?game=<id>` for everything else. `/play/<id>` already exists as a real
 *     route, so a shared link renders the game rather than 404ing.
 *   · One state key (`gglGame`) marks entries we created, so we never pop a
 *     history entry that was not ours.
 *   · deep links work on first paint, including `?play=` which older links in
 *     the wild already use.
 */

import { useCallback, useEffect, useRef } from 'react';

export type LaunchableGame = { id: string; proxy?: boolean };

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
  /** Whether a game renders standalone at /play/<id>. */
  isProxy: (id: string) => boolean;
}

const STATE_KEY = 'gglGame';

/** The canonical URL for a launched game. */
export function gameUrl(game: LaunchableGame, keepPath = false): string {
  if (keepPath) return `?game=${encodeURIComponent(game.id)}`;
  return `/play/${encodeURIComponent(game.id)}`;
}

/** Which game does this URL refer to, if any? */
export function gameFromLocation(search: string): { id: string; fromPath: string } | null {
  const params = new URLSearchParams(search);
  // `play` is the legacy parameter still used by /g/[id] landing pages.
  const id = params.get('game') || params.get('play');
  return id ? { id, fromPath: 'query' } : null;
}

/** True when the current path is /play/<id>. */
export function pathGameId(pathname: string): string | null {
  const match = /^\/play\/([^/?#]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function useGameUrl({ openGameId, openGame, closeGame, ready, known, isProxy }: GameUrlOptions) {
  /** Set while we are reacting to a popstate, so we don't push again. */
  const replaying = useRef(false);
  /** Set while we push, so the state-change effect ignores our own write. */
  const writing = useRef(false);

  /** Push the URL for a launch. Called by the page's launch(). */
  const pushGame = useCallback(
    (game: LaunchableGame) => {
      if (replaying.current || typeof window === 'undefined') return;
      const target = gameUrl(game, !isProxy(game.id));
      const current = `${window.location.pathname}${window.location.search}`;
      if (current === target) return;
      writing.current = true;
      try {
        window.history.pushState({ [STATE_KEY]: game.id }, '', target);
      } finally {
        writing.current = false;
      }
    },
    [isProxy],
  );

  /** Push the grid URL when a game closes. */
  const pushHome = useCallback(() => {
    if (replaying.current || typeof window === 'undefined') return;
    if (window.location.pathname === '/' && !window.location.search) return;
    writing.current = true;
    try {
      window.history.pushState({ [STATE_KEY]: null }, '', '/');
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
      // A /play/<id> URL is the standalone player's own route; only take it
      // over when the grid itself was asked for (query form) or the id is not
      // a proxy game.
      replaying.current = true;
      openGame(found.id);
      replaying.current = false;
      if (!fromPath) {
        // Normalise ?game=x to the canonical shape without adding history.
        writing.current = true;
        try {
          window.history.replaceState({ [STATE_KEY]: found.id }, '', gameUrl({ id: found.id }, !isProxy(found.id)));
        } finally {
          writing.current = false;
        }
      }
    }
  }, [ready, known, openGame, isProxy]);

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
  useEffect(() => {
    if (!restored.current && !openGameId) return;
    if (writing.current) return;
    if (openGameId) return;
    const fromPath = pathGameId(window.location.pathname);
    const found = fromPath ? { id: fromPath } : gameFromLocation(window.location.search);
    if (found) {
      writing.current = true;
      try {
        window.history.pushState({ [STATE_KEY]: null }, '', '/');
      } finally {
        writing.current = false;
      }
    }
  }, [openGameId]);

  return { pushGame, pushHome };
}
