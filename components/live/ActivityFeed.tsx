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
import { Sparkles, Trophy, Gamepad2, Users, Rocket, X } from 'lucide-react';
import type { PresenceEvent } from '@/lib/presence';

const KIND_ICON: Record<string, typeof Gamepad2> = {
  launch: Gamepad2,
  achievement: Trophy,
  online: Users,
  room: Rocket,
  join: Sparkles,
};

const TOAST_MS = 6200;
const MAX_VISIBLE = 3;

type Toast = PresenceEvent & { dying?: boolean };

export function ActivityFeed({
  events,
  online,
  enabled,
  onDismiss,
}: {
  events: PresenceEvent[];
  online: number;
  enabled: boolean;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState<Toast[]>([]);
  const seen = useRef<Set<number>>(new Set());
  const initialised = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setVisible([]);
      return;
    }
    // The first snapshot is history, not news: showing eight "just launched"
    // toasts the moment someone opens the site would be noise, so the existing
    // ids are marked read and only genuinely new ones become toasts.
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

  // The online count is derived, not stored: it is shown on the pill and
  // updated by the same poll that moves the ghosts.
  const pill = useMemo(() => (online > 0 ? `${online} player${online === 1 ? '' : 's'} online` : ''), [online]);

  if (!enabled) return null;

  return (
    <div className="gg-live-feed" role="status" aria-live="polite" aria-atomic="false">
      {pill && (
        <div className="gg-live-pill">
          <span className="gg-live-pulse" aria-hidden="true" />
          {pill}
          <button type="button" className="gg-live-hide" onClick={onDismiss} aria-label="Hide the live feed">
            <X size={11} />
          </button>
        </div>
      )}
      {visible.map(toast => {
        const Icon = KIND_ICON[toast.kind] ?? Sparkles;
        return (
          <div className="gg-live-toast" key={toast.id}>
            <span className="gg-live-icon" aria-hidden="true"><Icon size={13} /></span>
            <span className="gg-live-text">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
