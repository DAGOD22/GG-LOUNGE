'use client';

/**
 * The live activity feed.
 *
 * Bottom-right, three toasts at a time, each one fading itself out. Two rules
 * shape it:
 *
 *   · **It never covers a control.** The feed sits above the safe-area inset
 *     and is `pointer-events: none` except on its own toasts, so a click aimed
 *     at the page behind it still lands.
 *   · **It announces, it does not narrate.** New items are added to an
 *     `aria-live="polite"` region so a screen-reader user hears "Pix Fox just
 *     launched Slope" once, rather than being read the whole history on load.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Trophy, Gamepad2, Users, Rocket, X, Globe, Wrench, LayoutGrid, MousePointer2 } from 'lucide-react';
import { activityLine, ghostName, roomLabel, type PresenceEvent, type PresencePeer } from '@/lib/presence';
import { PresenceRoster } from './PresenceRoster';

const KIND_ICON: Record<string, typeof Gamepad2> = {
  launch: Gamepad2,
  achievement: Trophy,
  online: Users,
  room: Rocket,
  join: Sparkles,
  // Added with the activity work: the feed used to icon anything unrecognised
  // as a launch, which made a proxy visit look like a game.
  visited: LayoutGrid,
  browsing: Globe,
  tool: Wrench,
  page: MousePointer2,
};

const TOAST_MS = 6200;
const MAX_VISIBLE = 3;

type Toast = PresenceEvent & { dying?: boolean };

export function ActivityFeed({
  events,
  others,
  enabled,
  onDismiss,
  peers,
  selfId,
  selfCursor,
  selfActivity,
}: {
  events: PresenceEvent[];
  others: number;
  enabled: boolean;
  onDismiss: () => void;
  peers: PresencePeer[];
  selfId: string | null;
  selfCursor: PresencePeer['cursor'] | null;
  selfActivity: PresencePeer['activity'] | null;
}) {
  const [visible, setVisible] = useState<Toast[]>([]);
  const [rosterOpen, setRosterOpen] = useState(false);
  const seen = useRef<Set<number>>(new Set());
  const initialised = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setVisible([]);
      return;
    }
    // The first snapshot is the *existing* feed: it is real history, but
    // replaying it as eight simultaneous "just launched" toasts the moment
    // someone opens the site is noise. Mark it read so only genuinely new
    // events become toasts — the history itself is shown in the panel below.
    if (!initialised.current) {
      initialised.current = true;
      for (const event of events) seen.current.add(event.id);
      return;
    }
    const fresh = events.filter(event => !seen.current.has(event.id));
    if (!fresh.length) return;
    for (const event of fresh) seen.current.add(event.id);
    setVisible(current => [...fresh.slice(0, MAX_VISIBLE), ...current].slice(0, MAX_VISIBLE));
  }, [events, enabled]);

  useEffect(() => {
    if (!visible.length) return;
    const timers = visible.map(toast =>
      setTimeout(() => {
        setVisible(current => current.filter(item => item.id !== toast.id));
      }, TOAST_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  // Only *other* players count. Showing `online` here meant every visitor was
  // told "1 player online" — themselves — which read as fake because it was
  // permanent and said nothing. A lone visitor now gets no pill at all.
  const pill = useMemo(() => roomLabel(others), [others]);

  /**
   * Your own row, then everyone else's.
   *
   * The endpoint deliberately excludes the caller from `peers` — a ghost of
   * your own cursor would fight the real one — but a roster without you in it
   * cannot answer "is my activity being published?". So this client's row is
   * rebuilt from its own settings and prepended.
   */
  const roster = useMemo<PresencePeer[]>(() => {
    const mine: PresencePeer[] = [];
    if (selfId && selfCursor) {
      mine.push({
        id: selfId,
        name: 'You',
        username: null,
        cursor: selfCursor,
        game: null,
        // The server publishes this same value, so the row matches what other
        // players see of you rather than a local guess.
        activity: selfActivity ?? undefined,
        // Unused for your own row, and `Date.now()` during render is impure.
        seen: 0,
      });
    }
    return [...mine, ...peers];
  }, [peers, selfId, selfCursor, selfActivity]);

  /**
   * A one-line answer to "what is everyone doing".
   *
   * One other player gets a sentence with their name in it, because a single
   * "playing Slope" in the corner is a riddle. A crowd gets a count and the
   * most common activity, which is the only honest way to summarise six people
   * in one line. Either way this is a preview: the roster is one click away.
   */
  const summary = useMemo(() => {
    const doing = peers.filter(peer => activityLine(peer.activity));
    if (!doing.length) return '';
    if (peers.length === 1) {
      const [peer] = peers;
      const name = peer.name?.trim() || peer.username?.trim() || ghostName(peer.id);
      const line = activityLine(peer.activity);
      return line ? `${name} is ${line}` : '';
    }
    const counts = new Map<string, number>();
    for (const peer of doing) {
      const line = activityLine(peer.activity) as string;
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
    const [first, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const other = peers.length - count;
    const head = count > 1 ? `${count} × ${first}` : `${nameOf(peers, first)} is ${first}`;
    return other > 0 ? `${head} · +${other} more` : head;
  }, [peers]);

  // The newest few real events, for the case where nothing has happened since
  // this visitor arrived.
  const history = useMemo(() => events.slice(0, MAX_VISIBLE), [events]);

  if (!enabled) return null;

  return (
    <div className="gg-live-feed" role="status" aria-live="polite" aria-atomic="false">
      {pill && (
        <div className="gg-live-pill">
          <button
            type="button"
            className="gg-live-who"
            onClick={() => setRosterOpen(open => !open)}
            aria-expanded={rosterOpen}
            aria-haspopup="dialog"
            title="Who is here, and what they have open"
          >
            <span className="gg-live-pulse" aria-hidden="true" />
            {pill}
          </button>
          <button type="button" className="gg-live-hide" onClick={onDismiss} aria-label="Hide the live feed">
            <X size={11} />
          </button>
        </div>
      )}

      {/* One line of the room, so the corner answers "what is everyone on"
          without a click. */}
      {pill && !rosterOpen && summary && <p className="gg-live-summary">{summary}</p>}

      <PresenceRoster
        peers={roster}
        selfId={selfId}
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
      />
      {visible.map(toast => {
        const Icon = KIND_ICON[toast.kind] ?? Sparkles;
        return (
          <div className="gg-live-toast" key={toast.id}>
            <span className="gg-live-icon" aria-hidden="true"><Icon size={13} /></span>
            <span className="gg-live-text">{toast.message}</span>
          </div>
        );
      })}

      {/*
        The recent-activity list.
        Toasts only fire for events that arrive *after* you open the page, so a
        visitor who landed a minute after everyone else saw a permanently empty
        corner and concluded the feed was fake. This shows the server's actual
        last few events, which are real and already filtered server-side.
      */}
      {!visible.length && history.length > 0 && (
        <div className="gg-live-history">
          <p className="gg-live-history-head">
            <span className="gg-live-pulse" aria-hidden="true" /> Recent
            <button type="button" className="gg-live-hide" onClick={onDismiss} aria-label="Hide the live feed">
              <X size={11} />
            </button>
          </p>
          <ul>
            {history.map(event => {
              const Icon = KIND_ICON[event.kind] ?? Sparkles;
              return (
                <li key={event.id}>
                  <span className="gg-live-icon" aria-hidden="true"><Icon size={11} /></span>
                  <span className="gg-live-text">{event.message}</span>
                  <time dateTime={new Date(event.at).toISOString()}>{sinceLabel(event.at)}</time>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The display name of whoever owns an activity line, for the one-line summary. */
function nameOf(peers: PresencePeer[], line: string): string {
  const owner = peers.find(peer => activityLine(peer.activity) === line);
  if (!owner) return 'someone';
  return owner.name?.trim() || owner.username?.trim() || ghostName(owner.id);
}

/** "just now" / "4m" — the feed is short-lived, so coarse is enough. */
function sinceLabel(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}
