'use client';

/**
 * The live layer: presence polling, ghost cursors, the activity feed and the
 * P2P co-op room, all mounted once at the top of the site.
 *
 * Presence is a heartbeat, not a socket, because the site runs on serverless
 * functions where a socket cannot outlive its request. That trade is made
 * visible here in one place:
 *
 *   · the pointer is sampled at most every `POINTER_MS` and only sent when it
 *     has actually moved, so an idle player costs nothing;
 *   · one POST both publishes and returns the room, so a 2.5 s cadence is a
 *     single request rather than a read and a write;
 *   · polling stops when the tab is hidden and resumes on focus, because a
 *     background tab should not look "online";
 *   · ghost rendering interpolates between samples, so the slower wire rate is
 *     invisible on screen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { GhostCursors } from './GhostCursors';
import { ActivityFeed } from './ActivityFeed';
import { CoopRoom } from './CoopRoom';
import { useCustomization } from '@/components/customization/CustomizationProvider';
import { cursorForPresence, type PresenceEvent, type PresencePeer } from '@/lib/presence';

const POLL_MS = 2500;
const POINTER_MS = 260;

type LiveContext = {
  peers: PresencePeer[];
  events: PresenceEvent[];
  /** Players here *excluding* this one. Zero means you are alone. */
  others: number;
  /** Total including this one. Never display this as "players online". */
  online: number;
  /** Announce an event to everyone else. Fire-and-forget by design. */
  announce: (kind: 'launch' | 'achievement' | 'room' | 'join', gameId: string) => void;
  /** Tell the room what this player is playing, for their ghost tag. */
  setActiveGame: (gameId: string | null) => void;
  ghostCursors: boolean;
  activityFeed: boolean;
  hideFeed: () => void;
};

const LivePresenceContext = createContext<LiveContext | null>(null);

export function useLivePresence(): LiveContext {
  const context = useContext(LivePresenceContext);
  if (!context) throw new Error('PresenceProvider is missing.');
  return context;
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { settings, ready, update } = useCustomization();
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [events, setEvents] = useState<PresenceEvent[]>([]);
  const [online, setOnline] = useState(0);
  const [others, setOthers] = useState(0);

  const ghostCursors = settings.live.ghosts;
  const activityFeed = settings.live.feed;

  const pointer = useRef({ x: 50, y: 50 });
  const sent = useRef({ x: 50, y: 50 });
  const lastSend = useRef(0);
  const activeGame = useRef<string | null>(null);
  const guestToken = useRef('');
  const inFlight = useRef(false);
  const alive = useRef(true);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  /* ---- identity: the same signed guest token the rest of the site uses ---- */
  useEffect(() => {
    try {
      const id = localStorage.getItem('ggl_anon_id');
      const cached = localStorage.getItem('ggl_guest_token');
      if (id && cached?.startsWith(`${id}.`)) {
        guestToken.current = cached;
        return;
      }
      const anonId = id || `anon_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
      if (!id) localStorage.setItem('ggl_anon_id', anonId);
      fetch('/api/user-state/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ anonId }),
      })
        .then(response => (response.ok ? response.json() : null))
        .then((data: { token?: string } | null) => {
          if (data?.token) {
            guestToken.current = data.token;
            try {
              localStorage.setItem('ggl_guest_token', data.token);
            } catch {
              /* storage disabled — presence still works for this page view */
            }
          }
        })
        .catch(() => {});
    } catch {
      /* no storage: the tab simply will not appear to other players */
    }
  }, []);

  /* ---- pointer sampling, normalised to the viewport --------------------- */
  useEffect(() => {
    if (!ready || !settings.live.enabled) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      pointer.current = {
        x: Math.max(0, Math.min(100, (event.clientX / window.innerWidth) * 100)),
        y: Math.max(0, Math.min(100, (event.clientY / window.innerHeight) * 100)),
      };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [ready, settings.live.enabled]);

  const send = useCallback(async () => {
    if (!alive.current || inFlight.current) return;
    if (!settingsRef.current.live.enabled) return;
    inFlight.current = true;
    const current = settingsRef.current;
    const accent = current.theme.colors.accent;
    const cursor = {
      ...cursorForPresence(current.cursor, accent),
      x: Math.round(pointer.current.x * 10) / 10,
      y: Math.round(pointer.current.y * 10) / 10,
    };
    sent.current = { x: cursor.x, y: cursor.y };
    lastSend.current = performance.now();
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (guestToken.current) headers['x-gg-guest'] = guestToken.current;
      const response = await fetch('/api/presence', {
        method: 'POST',
        headers,
        body: JSON.stringify({ cursor, game: activeGame.current }),
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        online?: number;
        others?: number;
        peers?: PresencePeer[];
        events?: PresenceEvent[];
      };
      if (!alive.current) return;
      setPeers(data.peers ?? []);
      setOnline(data.online ?? 0);
      // Prefer the server's `others`. An older deployment does not send it, so
      // fall back to the peer count rather than to `online`, which includes us.
      setOthers(data.others ?? data.peers?.length ?? 0);
      if (data.events) setEvents(data.events);
    } catch {
      /* offline: keep the last known room rather than blanking the screen */
    } finally {
      inFlight.current = false;
    }
  }, []);

  /* ---- the heartbeat ---------------------------------------------------- */
  useEffect(() => {
    if (!ready || !settings.live.enabled) {
      setPeers([]);
      setOnline(0);
      setOthers(0);
      return;
    }
    alive.current = true;
    void send();
    let timer = window.setInterval(() => {
      if (document.hidden) return;
      // Skip a beat when the pointer has not moved and the roster was read last
      // time — there is nothing new to say, and idle players should be quiet.
      const moved =
        Math.abs(pointer.current.x - sent.current.x) > 0.4 ||
        Math.abs(pointer.current.y - sent.current.y) > 0.4;
      if (!moved && performance.now() - lastSend.current < POLL_MS * 2) return;
      void send();
    }, POLL_MS);

    const onVisible = () => {
      if (!document.hidden) void send();
    };
    const onLeave = () => {
      alive.current = false;
      try {
        navigator.sendBeacon?.('/api/presence');
      } catch {
        /* best effort */
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onLeave);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onLeave);
      timer = 0;
    };
  }, [ready, settings.live.enabled, send]);

  // A pointer moved recently changes the ghost; nudging the interval keeps a
  // fast-moving player smoothly tracked without polling harder for everyone.
  useEffect(() => {
    if (!ready || !settings.live.enabled) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const moved =
        Math.abs(pointer.current.x - sent.current.x) > 0.4 ||
        Math.abs(pointer.current.y - sent.current.y) > 0.4;
      if (moved && performance.now() - lastSend.current > POINTER_MS) void send();
    }, POINTER_MS);
    return () => window.clearInterval(id);
  }, [ready, settings.live.enabled, send]);

  const announce = useCallback((kind: 'launch' | 'achievement' | 'room' | 'join', gameId: string) => {
    if (!settingsRef.current.live.enabled) return;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (guestToken.current) headers['x-gg-guest'] = guestToken.current;
    fetch('/api/presence/event', {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind, gameId }),
    }).catch(() => {});
  }, []);

  const setActiveGame = useCallback((gameId: string | null) => {
    if (activeGame.current === gameId) return;
    activeGame.current = gameId;
    // Publish immediately: a ghost tag that says "playing Slope" should not
    // wait for the next idle beat.
    void send();
  }, [send]);

  const hideFeed = useCallback(() => {
    update(current => ({ ...current, live: { ...current.live, feed: false } }));
  }, [update]);

  const value = useMemo<LiveContext>(
    () => ({ peers, events, others, online, announce, setActiveGame, ghostCursors, activityFeed, hideFeed }),
    [peers, events, others, online, announce, setActiveGame, ghostCursors, activityFeed, hideFeed],
  );

  return (
    <LivePresenceContext.Provider value={value}>
      {children}
      {ready && settings.live.enabled && (
        <>
          <GhostCursors peers={peers} enabled={ghostCursors} />
          <ActivityFeed events={events} others={others} enabled={activityFeed} onDismiss={hideFeed} />
          <CoopRoom />
        </>
      )}
    </LivePresenceContext.Provider>
  );
}
