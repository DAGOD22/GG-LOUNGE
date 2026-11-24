'use client';

/**
 * Who is online, and what each of them has open.
 *
 * The feed could only ever show *events*, and an event is a moment: it says
 * "Pix Fox launched Slope" at 20:14 and then nothing, forever. So the honest
 * answer to "who is here right now" was unavailable — a visitor saw a cursor
 * drift past and had no way to learn whose it was, or what they were on. The
 * user asked for exactly that, so this panel is the roster: a row per player,
 * live, with their current activity spelled out.
 *
 * Design constraints that decide most of what follows:
 *
 *   · **It is opt-in, not a pane.** A permanent sidebar would eat the screen on
 *     a phone and cover a game. It opens from the online pill and closes on
 *     Escape or on a click outside, and it is `role="dialog"` so that behaviour
 *     is announced instead of surprising.
 *
 *   · **One row per person, not per tab.** Presence ids are per-tab; two tabs
 *     of the same account are two peers and one person. `rosterKey` collapses
 *     them and the tab count is shown when it is more than one.
 *
 *   · **It never invents a sentence.** Rows are built from `activityLine`,
 *     the same helper the ghost tags use, so a row and a cursor can never
 *     disagree. A peer with no activity says "just here", which is true.
 *
 *   · **Your own row is labelled.** It is the only way to confirm that your
 *     activity is being published at all, which is the difference between
 *     "nobody is here" and "this is broken".
 */

import { useEffect, useMemo, useRef } from 'react';
import { Gamepad2, Globe, LayoutGrid, Wrench, MousePointer2, X, Users } from 'lucide-react';
import {
  activityLine,
  ghostName,
  rosterKey,
  type ActivityKind,
  type PresencePeer,
} from '@/lib/presence';

const KIND_ICON: Record<Exclude<ActivityKind, 'idle'>, typeof Gamepad2> = {
  game: Gamepad2,
  proxy: Globe,
  app: LayoutGrid,
  page: MousePointer2,
  tools: Wrench,
};

type Row = {
  key: string;
  name: string;
  activity: string;
  kind: Exclude<ActivityKind, 'idle'> | null;
  accent: string;
  tabs: number;
  self: boolean;
};

export function PresenceRoster({
  peers,
  selfId,
  open,
  onClose,
}: {
  peers: PresencePeer[];
  /** This client's own presence id, so its row can be labelled "you". */
  selfId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  /** Collapse tabs into people, keeping the most recent cursor's accent. */
  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, Row>();
    for (const peer of peers) {
      const key = rosterKey(peer);
      const existing = byKey.get(key);
      const kind =
        peer.activity && peer.activity.kind !== 'idle'
          ? (peer.activity.kind as Exclude<ActivityKind, 'idle'>)
          : null;
      if (existing) {
        existing.tabs += 1;
        // A named activity beats "just here": if either tab is doing something
        // specific, that is the more useful description of the person.
        if (kind && !existing.kind) {
          existing.kind = kind;
          existing.activity = activityLine(peer.activity) ?? 'just here';
        }
        if (peer.id === selfId) existing.self = true;
        continue;
      }
      byKey.set(key, {
        key,
        name: peer.name?.trim() || peer.username?.trim() || ghostName(peer.id),
        activity: activityLine(peer.activity) ?? 'just here',
        kind,
        accent: peer.cursor.accent,
        tabs: 1,
        self: peer.id === selfId,
      });
    }
    // You first, then whoever is doing something, then alphabetical — a stable
    // order, so a row does not jump while it is being read.
    return [...byKey.values()].sort((a, b) => {
      if (a.self !== b.self) return a.self ? -1 : 1;
      if (!!a.kind !== !!b.kind) return a.kind ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [peers, selfId]);

  // Escape closes it, and the click that closes it must not pass through to a
  // game behind the panel — hence the `pointer-events` scrim below.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus moves into the panel when it opens so a keyboard user is not left
  // tabbing through the page underneath it.
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  if (!open) return null;

  const total = rows.length;

  return (
    <>
      <button type="button" className="gg-roster-scrim" aria-label="Close the player list" onClick={onClose} />
      <div
        ref={panel}
        className="gg-roster"
        role="dialog"
        aria-modal="true"
        aria-label="Players in the lounge"
        tabIndex={-1}
      >
        <header className="gg-roster-head">
          <Users size={13} aria-hidden="true" />
          <strong>{total === 1 ? '1 player here' : `${total} players here`}</strong>
          <button type="button" className="gg-live-hide" onClick={onClose} aria-label="Close the player list">
            <X size={11} />
          </button>
        </header>

        <ul className="gg-roster-list">
          {rows.map(row => {
            const Icon = row.kind ? KIND_ICON[row.kind] : null;
            return (
              <li key={row.key} className="gg-roster-row">
                <span
                  className="gg-roster-dot"
                  aria-hidden="true"
                  style={{ background: row.accent, boxShadow: `0 0 0 3px ${row.accent}22` }}
                />
                <span className="gg-roster-text">
                  <span className="gg-roster-name">
                    {row.name}
                    {row.self && <em className="gg-roster-you">you</em>}
                    {row.tabs > 1 && <em className="gg-roster-tabs">{row.tabs} tabs</em>}
                  </span>
                  <span className="gg-roster-activity">
                    {Icon && <Icon size={10} aria-hidden="true" />}
                    {row.activity}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        {total === 0 && <p className="gg-roster-empty">Nobody else yet. Send someone a link.</p>}
      </div>
    </>
  );
}
