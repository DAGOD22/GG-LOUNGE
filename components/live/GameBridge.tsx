'use client';

/**
 * The seam between the live layer and the game launcher.
 *
 * The co-op room needs to do three things the launcher owns: know what is
 * playing, open a game a friend picked, and push a remote player's keys into
 * the active frame. None of those belong in a roster widget, and the launcher
 * must not have to import the room. So the launcher registers itself here and
 * the live layer asks this context.
 *
 * Registration is optional: on `/privacy`, `/proxy` or the link directory there
 * is no launcher, and the room still opens, connects and chats — it just has
 * no game to drive.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { InputFrame } from '@/lib/coop';

export type GameBridge = {
  /** The game currently open in the launcher, if any. */
  activeGameId: () => string | null;
  /** Open a game by id — used when a friend presses "send this game". */
  launchGame: (gameId: string, reason?: string) => void;
  /** Deliver a remote key press to the active frame. */
  applyRemoteInput: (frame: InputFrame) => void;
  /** A friend started the same game; used for the room status line. */
  onPeerGame: (gameId: string) => void;
  /** The live `<iframe>` hosting the game, for modules that capture or filter
   *  it. Null when no game is open. */
  frame: () => HTMLIFrameElement | null;
};

type Registry = {
  bridge: GameBridge | null;
  register: (bridge: GameBridge | null) => void;
};

const BridgeContext = createContext<Registry>({ bridge: null, register: () => {} });

export function GameBridgeProvider({ children }: { children: ReactNode }) {
  const [bridge, setBridge] = useState<GameBridge | null>(null);
  const value = useMemo<Registry>(() => ({ bridge, register: setBridge }), [bridge]);
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

/** Null when there is no launcher on this page — callers must handle that. */
export function useOptionalGameBridge(): GameBridge | null {
  return useContext(BridgeContext).bridge;
}

/**
 * Used by the launcher to publish itself; one launcher per page.
 *
 * Registration happens in an effect rather than during render, because a
 * render can be thrown away — and a bridge registered from a discarded render
 * would point at state that never committed.
 */
export function useRegisterGameBridge(bridge: GameBridge | null): void {
  const { register } = useContext(BridgeContext);
  useEffect(() => {
    if (!bridge) return;
    register(bridge);
    return () => register(null);
  }, [bridge, register]);
}
