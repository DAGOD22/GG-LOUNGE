'use client';

/**
 * The behaviour warps — where the site's actual machinery gets rewired.
 *
 * These are mounted by the WarpLayer exactly like the screen overlays, but
 * they mostly render nothing, or a small pill in a corner. Their job is in
 * their effects: intercepting launches, speaking, writing diaries, holding
 * wake locks, scrolling the page by itself. Mount = on, unmount = off, and
 * every listener cleans up after itself.
 *
 * Two of them (Incognito, and the pieces that need the launcher) are wired
 * directly inside app/page.tsx — a component cannot re-roll a launch it is
 * never told about. Everything that can live as a mounted listener does.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { CircleDot, StickyNote } from 'lucide-react';
import { games } from '@/lib/games';
import { isToggled, type SecretId } from '@/lib/secrets';

/**
 * The launcher event the home page already listens for (the co-op room uses
 * the same door): dispatch it and the named game opens, no page reload.
 */
function launchGame(id: string | undefined) {
  if (!id) return;
  window.dispatchEvent(new CustomEvent('ggl:launch-game', { detail: { gameId: id } }));
}

/* -------------------------------------------------------------- resume ---- */

const LAST_KEY = 'ggl_recent';

export function ResumePill() {
  const [last, setLast] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(LAST_KEY) || '[]');
        const id = Array.isArray(parsed) ? parsed.find(entry => typeof entry === 'string') : null;
        const game = games.find(entry => entry.id === id);
        setLast(game ? { id: game.id, title: game.title } : null);
      } catch {
        setLast(null);
      }
    };
    read();
    // Opening something changes the "last game": keep the pill honest.
    const timer = window.setInterval(read, 4000);
    return () => window.clearInterval(timer);
  }, []);

  if (!last) return null;
  return (
    <button type="button" className="gg-pill gg-pill-resume" onClick={() => launchGame(last.id)}>
      ▶ Continue: {last.title}
    </button>
  );
}

/* ------------------------------------------------------------- hotkeys ---- */

export function NumberKeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (!/^[1-9]$/.test(event.key)) return;
      // Typing "3" in a message or the search box is not a launch order.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const pick = games[Number(event.key) - 1];
      if (pick) {
        event.preventDefault();
        launchGame(pick.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}

/* --------------------------------------------------------------- talk ----- */

export function TalkingSite() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    let lastSpoken = '';
    const onOver = (event: PointerEvent) => {
      const card = (event.target as HTMLElement | null)?.closest?.('[data-game-title]');
      if (!card) return;
      const title = card.getAttribute('data-game-title') || '';
      if (!title || title === lastSpoken) return;
      lastSpoken = title;
      window.setTimeout(() => {
        if (!isToggled('talk')) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(title);
        utterance.rate = 1.05;
        utterance.volume = 0.9;
        window.speechSynthesis.speak(utterance);
      }, 160);
    };
    document.addEventListener('pointerover', onOver, true);
    return () => {
      document.removeEventListener('pointerover', onOver, true);
      window.speechSynthesis.cancel();
    };
  }, []);
  return null;
}

/* ---------------------------------------------------------------- alibi --- */

const ALIBI_TITLES = [
  'Untitled document - Google Docs',
  'Homework - Notes',
  'Wikipedia — Study',
  'Weekly planner',
  'Reading list',
];
const ALIBI_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#ffffff"/><rect x="7" y="5" width="18" height="22" rx="2" fill="#4285f4" opacity="0.15"/><rect x="10" y="10" width="12" height="1.8" fill="#5f6368"/><rect x="10" y="14" width="12" height="1.8" fill="#5f6368"/><rect x="10" y="18" width="8" height="1.8" fill="#5f6368"/></svg>',
  );

export function AlibiTab() {
  useEffect(() => {
    const originalTitle = document.title;
    const originalIcon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? '';
    let index = 0;
    document.title = ALIBI_TITLES[0];
    const setIcon = (href: string) => {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = href;
    };
    setIcon(ALIBI_FAVICON);
    const timer = window.setInterval(() => {
      index = (index + 1) % ALIBI_TITLES.length;
      document.title = ALIBI_TITLES[index];
    }, 9000);
    return () => {
      window.clearInterval(timer);
      document.title = originalTitle;
      setIcon(originalIcon);
    };
  }, []);
  return null;
}

/* ---------------------------------------------------------------- pulse --- */

type PulseData = { ok: boolean; mode?: string; games?: number };

export function PulsePill() {
  const [state, setState] = useState<PulseData | null>(null);

  const read = useCallback(async () => {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json();
      const db = data?.checks?.['db:postgres'] ?? {};
      setState({
        ok: Boolean(data?.ok) && db.ok !== false,
        mode: data?.checks?.['db:schema']?.mode ?? db.mode ?? '',
        games: Number(data?.gamesCount ?? data?.checks?.games?.count ?? 0) || undefined,
      });
    } catch {
      setState({ ok: false });
    }
  }, []);

  useEffect(() => {
    void read();
    const timer = window.setInterval(read, 45000);
    return () => window.clearInterval(timer);
  }, [read]);

  return (
    <button type="button" className="gg-pill gg-pill-pulse" onClick={() => void read()} title="Site heartbeat — click to re-check">
      <CircleDot size={11} className={state?.ok ? 'gg-pulse-ok' : 'gg-pulse-down'} />
      {state === null
        ? 'checking…'
        : state.ok
          ? `${state.mode || 'db'} ok${state.games ? ` · ${state.games} games` : ''}`
          : 'site is struggling'}
    </button>
  );
}

/* ----------------------------------------------------------------- note --- */

const NOTE_KEY = 'ggl_note';

export function StickyNotePill() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    try {
      setText(localStorage.getItem(NOTE_KEY) || '');
    } catch {
      /* no storage, no note */
    }
  }, []);

  const save = (value: string) => {
    setText(value);
    try {
      localStorage.setItem(NOTE_KEY, value);
    } catch {
      /* nothing to do */
    }
  };

  const preview = text.trim().slice(0, 28) || 'write a note…';
  return (
    <div className="gg-pill-note-wrap">
      {open ? (
        <div className="gg-pill-note">
          <textarea
            value={text}
            onChange={event => save(event.target.value)}
            placeholder="Anything you want to keep…"
            aria-label="Your sticky note"
            rows={5}
            // The note owns the keyboard while it is open.
            onKeyDown={event => event.stopPropagation()}
          />
          <button type="button" onClick={() => setOpen(false)}>
            <StickyNote size={11} /> pin it
          </button>
        </div>
      ) : (
        <button type="button" className="gg-pill gg-pill-note-btn" onClick={() => setOpen(true)}>
          <StickyNote size={11} /> {preview}
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- lazy --- */

export function LazyRiver() {
  useEffect(() => {
    let raf = 0;
    let stopped = false;
    const step = () => {
      if (!stopped) window.scrollBy({ top: 0.6, behavior: 'instant' as ScrollBehavior });
      raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    const giveUp = () => {
      // One human touch and the river stops for good (until re-toggled).
      stopped = true;
      window.cancelAnimationFrame(raf);
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) {
        window.removeEventListener(type, giveUp, { capture: true } as AddEventListenerOptions);
      }
    };
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) {
      window.addEventListener(type, giveUp, { capture: true, passive: true } as AddEventListenerOptions);
    }
    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) {
        window.removeEventListener(type, giveUp, { capture: true } as AddEventListenerOptions);
      }
    };
  }, []);
  return null;
}

/* ---------------------------------------------------------------- awake --- */

type WakeLockSentinel = { release: () => Promise<void>; addEventListener: (type: string, listener: () => void) => void };

export function StayAwake() {
  useEffect(() => {
    type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> } };
    const nav = navigator as NavigatorWithWakeLock;
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      if (released || document.visibilityState !== 'visible') return;
      try {
        sentinel = await nav.wakeLock.request('screen');
        // Browsers drop the lock on tab switches: take it again on return.
        sentinel.addEventListener('release', () => {
          sentinel = null;
        });
      } catch {
        /* denied or unsupported — the secret simply does nothing here */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !sentinel) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, []);
  return null;
}

/* ------------------------------------------------------------- power menu - */

export function PowerMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; title: string } | null>(null);

  useEffect(() => {
    const onContext = (event: MouseEvent) => {
      const card = (event.target as HTMLElement | null)?.closest?.('[data-game-id]');
      if (!card) return;
      const id = card.getAttribute('data-game-id') || '';
      if (!id) return;
      event.preventDefault();
      setMenu({
        x: Math.min(event.clientX, window.innerWidth - 230),
        y: Math.min(event.clientY, window.innerHeight - 190),
        id,
        title: card.getAttribute('data-game-title') || id,
      });
    };
    // Dismiss on any press *outside* the menu — a press on the menu itself is
    // the user choosing an item, and must not close it before the click.
    const dismiss = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest?.('.gg-ctx-menu')) return;
      setMenu(null);
    };
    const onBlur = () => setMenu(null);
    document.addEventListener('contextmenu', onContext);
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('contextmenu', onContext);
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  if (!menu) return null;

  const close = () => setMenu(null);
  const hide = () => {
    import('@/lib/hidden-games')
      .then(({ hideGame }) => hideGame(menu.id))
      .catch(() => {});
    close();
  };

  return (
    <div className="gg-ctx-menu" style={{ left: menu.x, top: menu.y }} role="menu" aria-label={`Actions for ${menu.title}`}>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          launchGame(menu.id);
          close();
        }}
      >
        ▶ Play “{menu.title}”
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          window.open(`/?game=${encodeURIComponent(menu.id)}`, '_blank', 'noopener');
          close();
        }}
      >
        ↗ Open in a new tab
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          void navigator.clipboard?.writeText(`${window.location.origin}/?game=${encodeURIComponent(menu.id)}`).catch(() => {});
          close();
        }}
      >
        ⧉ Copy the link
      </button>
      <button type="button" role="menuitem" className="gg-ctx-danger" onClick={hide}>
        ✕ Hide from my home list
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ incognito --- */

/**
 * The local half of Incognito: when the switch flips on, the already-saved
 * history goes away right now. (app/page.tsx does the rest — it stops writing
 * new history and stops syncing to the account while the switch is on.)
 */
export function IncognitoEraser() {
  useEffect(() => {
    try {
      localStorage.removeItem('ggl_recent');
      localStorage.removeItem('ggl_playcounts');
    } catch {
      /* nothing to erase */
    }
  }, []);
  return null;
}

/* ------------------------------------------------------------ registry ---- */

/** Behaviour components the WarpLayer mounts, by secret id. */
export const BEHAVIOR_COMPONENTS: Partial<Record<SecretId, () => ReactElement | null>> = {
  resume: ResumePill,
  hotkeys: NumberKeys,
  talk: TalkingSite,
  alibi: AlibiTab,
  pulse: PulsePill,
  note: StickyNotePill,
  lazy: LazyRiver,
  awake: StayAwake,
  context: PowerMenu,
  incognito: IncognitoEraser,
};
