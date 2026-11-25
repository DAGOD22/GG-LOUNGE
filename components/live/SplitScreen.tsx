'use client';

/**
 * Split screen: two games, one tab.
 *
 * The right pane is a second frame with its own game, its own mute and its own
 * source. The left pane stays the real launcher frame — the one the save
 * system, achievements and the pointer-lock handling already know about — so
 * adding a second pane cannot quietly break saves or the Most Played counter.
 *
 * The divider is a real ARIA separator: it can be dragged with a pointer and
 * moved with the arrow keys, because a control that only responds to dragging
 * is unusable for anyone who cannot drag.
 *
 * Muting is per pane and is applied through the frame's own document. Both
 * panes are same-origin (every local game is served from this origin), so a
 * `postMessage` handshake is not needed for the common case; a proxied game
 * gets a best-effort attempt and simply does not mute, which is honest.
 */

import { GAME_FRAME_SANDBOX } from '@/lib/frame-policy'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Columns2, Search, Volume2, VolumeX, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Game } from '@/lib/games';

export function SplitScreen({
  games,
  rightGame,
  split,
  onSplit,
  onPick,
  onClose,
}: {
  games: Game[];
  rightGame: Game | null;
  /** Percentage of the area given to the left pane; owned by the modal so the
   *  launcher's own frame can be sized from the same number. */
  split: number;
  onSplit: (percent: number) => void;
  onPick: (game: Game | null) => void;
  onClose: () => void;
}) {
  const setSplit = onSplit;
  const [picker, setPicker] = useState(!rightGame);
  const [query, setQuery] = useState('');
  const [rightMuted, setRightMuted] = useState(false);
  const rightFrame = useRef<HTMLIFrameElement>(null);
  const dragging = useRef(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return games.slice(0, 40);
    return games
      .filter(game => `${game.title} ${game.genre} ${game.tone}`.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [games, query]);

  /* ---- divider drag ---------------------------------------------------- */
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const area = (event.target as Element | null)?.closest('.gg-split-area')
        ?? document.querySelector('.gg-split-area');
      if (!area) return;
      const rect = area.getBoundingClientRect();
      const percent = ((event.clientX - rect.left) / rect.width) * 100;
      setSplit(Math.max(22, Math.min(78, percent)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.classList.remove('gg-split-dragging');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [onSplit]);

  const nudge = (delta: number) => setSplit(Math.max(22, Math.min(78, split + delta)));

  /* ---- keyboard for the right pane -------------------------------------
   *
   * The left pane gets its keystrokes from the modal's own touch pad and from
   * the frame having focus. The right pane had neither: on a phone in split
   * screen the second game could be seen but not played. These helpers push the
   * same synthetic events into the right frame that the modal pushes into the
   * left one, so both panes are playable from one control cluster.
   */
  const press = useCallback((code: string, type: 'keydown' | 'keyup') => {
    const frame = rightFrame.current;
    const win = frame?.contentWindow as (Window & typeof globalThis) | null;
    const doc = frame?.contentDocument;
    if (!win || !doc) return;
    const options = { key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code, code, bubbles: true, cancelable: true } as KeyboardEventInit;
    try { win.dispatchEvent(new KeyboardEvent(type, options)); } catch { /* frame replaced */ }
    try { doc.dispatchEvent(new KeyboardEvent(type, options)); } catch { /* frame replaced */ }
  }, []);
  const tap = useCallback((code: string) => {
    press(code, 'keydown');
    setTimeout(() => press(code, 'keyup'), 160);
  }, [press]);

  /* ---- per-pane mute --------------------------------------------------- */
  const applyMute = useCallback((frame: HTMLIFrameElement | null, muted: boolean) => {
    if (!frame) return;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      for (const element of doc.querySelectorAll<HTMLMediaElement>('audio,video')) element.muted = muted;
    } catch {
      // A cross-origin frame cannot be reached; the button stays available so
      // the attempt is visible rather than silently disabled.
    }
  }, []);

  useEffect(() => {
    applyMute(rightFrame.current, rightMuted);
  }, [rightMuted, applyMute, rightGame?.id]);

  /* Escaping the pane picker should not close the game behind it. */
  useEffect(() => {
    if (!picker) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (rightGame) setPicker(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [picker, rightGame]);

  return (
    <div
      className="gg-split"
      data-split={Math.round(split)}
      // One variable drives the grid tracks, the divider and the handle, so the
      // three can never disagree about where the seam is.
      style={{ ['--gg-split' as string]: `${split}%` }}
    >
      <div className="gg-split-divider" />

      {/* the divider handle sits above both panes and is the drag target */}
      <div
        className="gg-split-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the split"
        aria-valuenow={Math.round(split)}
        aria-valuemin={22}
        aria-valuemax={78}
        tabIndex={0}
        onPointerDown={event => {
          event.preventDefault();
          dragging.current = true;
          document.body.classList.add('gg-split-dragging');
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            nudge(-4);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            nudge(4);
          }
          if (event.key === 'Home') {
            event.preventDefault();
            setSplit(22);
          }
          if (event.key === 'End') {
            event.preventDefault();
            setSplit(78);
          }
        }}
      >
        <span />
      </div>

      {/* right pane controls live in the modal bar; the pane itself is just
          the frame so nothing overlaps the game's own UI */}
      {rightGame ? (
        <div className="gg-split-pane gg-split-right">
          <div className="gg-split-bar">
            <span className="gg-split-name">{rightGame.title}</span>
            <button
              type="button"
              onClick={() => setRightMuted(value => !value)}
              aria-pressed={rightMuted}
              aria-label={rightMuted ? `Unmute ${rightGame.title}` : `Mute ${rightGame.title}`}
              title={rightMuted ? 'Unmute this pane' : 'Mute this pane'}
            >
              {rightMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
            <button type="button" onClick={() => setPicker(true)} aria-label="Change the right pane game">
              <ChevronRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => {
                onPick(null);
                onClose();
              }}
              aria-label="Close split screen"
            >
              <X size={13} />
            </button>
          </div>
          <iframe
            ref={rightFrame}
            className="gg-split-frame"
            src={rightGame.proxy ? `/play/${rightGame.id}` : rightGame.path}
            title={`${rightGame.title} — right pane`}
            allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write; encrypted-media"
            sandbox={GAME_FRAME_SANDBOX}
            allowFullScreen
            onLoad={() => applyMute(rightFrame.current, rightMuted)}
          />
          <div className="gg-split-touch" role="group" aria-label={`Controls for ${rightGame.title}`}>
            {([
              ['ArrowUp', '▲'],
              ['ArrowLeft', '◀'],
              ['ArrowDown', '▼'],
              ['ArrowRight', '▶'],
            ] as const).map(([code, glyph]) => (
              <button
                key={code}
                type="button"
                aria-label={code.replace('Arrow', '')}
                onTouchStart={event => { event.preventDefault(); tap(code); }}
                onMouseDown={() => tap(code)}
                onContextMenu={event => event.preventDefault()}
              >
                {glyph}
              </button>
            ))}
            <button type="button" className="gg-split-touch-space" onTouchStart={event => { event.preventDefault(); tap('Space'); }} onMouseDown={() => tap('Space')}>
              SPACE
            </button>
          </div>
        </div>
      ) : (
        <div className="gg-split-pane gg-split-right gg-split-empty">
          <button type="button" className="gg-secondary" onClick={() => setPicker(true)}>
            <Columns2 size={14} /> Pick a game for the right pane
          </button>
        </div>
      )}

      {picker && (
        <div className="gg-split-picker" role="dialog" aria-label="Choose a second game">
          <header>
            <strong>Right pane</strong>
            <button type="button" onClick={() => (rightGame ? setPicker(false) : onClose())} aria-label="Close picker">
              <X size={15} />
            </button>
          </header>
          <label className="gg-split-search">
            <Search size={13} />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search 250 games"
              aria-label="Search games"
            />
          </label>
          <ul>
            {filtered.map(game => (
              <li key={game.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(game);
                    setPicker(false);
                  }}
                >
                  <span className={`game-badge ${game.color}`} style={{ width: 26, height: 26, fontSize: 9 }}>
                    {game.mark}
                  </span>
                  <span className="gg-split-pick-text">
                    <strong>{game.title}</strong>
                    <small>{game.genre} · {game.tone}</small>
                  </span>
                  {game.id === rightGame?.id && <span className="gg-split-current"><ChevronLeft size={12} /> in use</span>}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="gg-help">No game matches that.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
