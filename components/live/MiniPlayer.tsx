'use client';

/**
 * Pop the game out into a small always-on-top window.
 *
 * Two implementations, and the choice is made by the browser rather than by a
 * user-agent sniff:
 *
 *   · **Document Picture-in-Picture** (`documentPictureInPicture`) gives a real
 *     OS-level window. The game's iframe is *moved* into it — not duplicated —
 *     so the game keeps its state, its audio and its save writes. A duplicated
 *     iframe would restart the game and, worse, the two copies would fight over
 *     the same localStorage save.
 *   · **In-page fallback** for Firefox and Safari, which do not ship the API.
 *     A draggable, resizable panel over the page, with the same "move the
 *     iframe, keep everything alive" rule.
 *
 * Both paths close on the panic key: the frame is put back before the redirect
 * runs, so a panic never leaves a floating window playing behind a fake doc.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PictureInPicture2, X, Maximize2, Minimize2 } from 'lucide-react';

type DocumentPictureInPicture = {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window: Window | null;
};

function documentPip(): DocumentPictureInPicture | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;
  return candidate && typeof candidate.requestWindow === 'function' ? candidate : null;
}

const BUTTON_BASE = {
  width: 'auto',
  padding: '0 10px',
  fontSize: 11,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 999,
  cursor: 'pointer',
} as const;

export function MiniPlayer({ frameRef }: { frameRef: React.RefObject<HTMLIFrameElement | null> }) {
  const [mode, setMode] = useState<'closed' | 'pip' | 'inline'>('closed');
  const [supportsPip, setSupportsPip] = useState(true);
  const [box, setBox] = useState({ x: 24, y: 24, w: 420, h: 300 });
  const pipWindow = useRef<Window | null>(null);
  const marker = useRef<Comment | null>(null);
  const slot = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    setSupportsPip(Boolean(documentPip()));
  }, []);

  /** Put the frame back exactly where it came from. A comment node holds its
   *  place, so the modal's layout is restored rather than re-guessed. */
  const restoreFrame = useCallback(() => {
    const frame = frameRef.current;
    const node = marker.current;
    if (frame && node?.parentNode) {
      node.parentNode.insertBefore(frame, node);
      node.remove();
    }
    marker.current = null;
  }, [frameRef]);

  /** Detach the frame from the modal and note where it should return to. */
  const detachFrame = useCallback(() => {
    const frame = frameRef.current;
    if (!frame || marker.current) return frame;
    const node = document.createComment('ggl-mini-player');
    frame.parentNode?.insertBefore(node, frame);
    marker.current = node;
    return frame;
  }, [frameRef]);

  const close = useCallback(() => {
    try {
      pipWindow.current?.close();
    } catch {
      /* already gone */
    }
    pipWindow.current = null;
    restoreFrame();
    setMode('closed');
  }, [restoreFrame]);

  /* the panic key takes the mini player with it */
  useEffect(() => {
    const onPanic = () => close();
    window.addEventListener('ggl:panic', onPanic);
    return () => window.removeEventListener('ggl:panic', onPanic);
  }, [close]);

  useEffect(() => {
    return () => {
      try {
        pipWindow.current?.close();
      } catch {
        /* ignore */
      }
      restoreFrame();
    };
  }, [restoreFrame]);

  /** Move the frame into the inline panel once it exists. */
  useEffect(() => {
    if (mode !== 'inline') return;
    const frame = detachFrame();
    const host = slot.current;
    if (frame && host) host.append(frame);
  }, [mode, detachFrame]);

  const open = useCallback(async () => {
    const frame = frameRef.current;
    if (!frame) return;
    const pip = documentPip();
    if (!pip) {
      setMode('inline');
      return;
    }
    try {
      const win = await pip.requestWindow({ width: 480, height: 320 });
      pipWindow.current = win;
      detachFrame();

      const doc = win.document;
      doc.title = 'GG-LOUNGE mini player';
      const sheet = doc.createElement('style');
      sheet.textContent =
        ':root{color-scheme:dark}html,body{margin:0;height:100%;background:#07090e;overflow:hidden}' +
        'iframe{border:0;width:100%;height:100%;display:block;background:#07090e}';
      doc.head.append(sheet);
      doc.body.append(frame);
      setMode('pip');

      win.addEventListener('pagehide', () => {
        pipWindow.current = null;
        restoreFrame();
        setMode('closed');
      });
    } catch {
      // A dismissed or denied request is not an error worth a dialog.
      setMode('closed');
    }
  }, [detachFrame, frameRef, restoreFrame]);

  /* ---- inline fallback: drag + resize ---------------------------------- */
  useEffect(() => {
    if (mode !== 'inline') return;
    const onMove = (event: PointerEvent) => {
      const moving = drag.current;
      if (moving) {
        const x = Math.max(0, Math.min(window.innerWidth - 160, moving.left + event.clientX - moving.x));
        const y = Math.max(0, Math.min(window.innerHeight - 80, moving.top + event.clientY - moving.y));
        setBox(current => ({ ...current, x, y }));
        return;
      }
      const sizing = resizeStart.current;
      if (sizing) {
        setBox(current => ({
          ...current,
          w: Math.max(280, Math.min(window.innerWidth - 20, sizing.w + event.clientX - sizing.x)),
          h: Math.max(200, Math.min(window.innerHeight - 20, sizing.h + event.clientY - sizing.y)),
        }));
      }
    };
    const onUp = () => {
      drag.current = null;
      resizeStart.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [mode]);

  if (mode === 'closed') {
    return (
      <button
        onClick={open}
        title={supportsPip ? 'Pop out mini-player' : 'This browser has no Document PiP — opens a floating panel instead'}
        aria-label="Pop out mini-player"
        style={{ ...BUTTON_BASE, border: '1px solid var(--line)', background: 'rgba(255,255,255,.06)', color: 'var(--foreground)' }}
      >
        <PictureInPicture2 size={14} /> Mini-player
      </button>
    );
  }

  if (mode === 'pip') {
    return (
      <button
        onClick={close}
        title="Close the mini-player"
        aria-label="Close mini-player"
        style={{ ...BUTTON_BASE, border: '1px solid var(--lime)', background: 'var(--lime)', color: '#0b0d12' }}
      >
        <PictureInPicture2 size={14} /> In mini-player
      </button>
    );
  }

  return (
    <div
      className="gg-mini-player"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      role="dialog"
      aria-label="Floating mini-player"
    >
      <div
        className="gg-mini-player-bar"
        onPointerDown={event => {
          drag.current = { x: event.clientX, y: event.clientY, left: box.x, top: box.y };
        }}
      >
        <span>Mini-player</span>
        <span className="gg-mini-player-buttons">
          <button
            type="button"
            aria-label={box.w > 500 ? 'Shrink' : 'Enlarge'}
            onPointerDown={event => event.stopPropagation()}
            onClick={() => setBox(current => (current.w > 500 ? { ...current, w: 420, h: 300 } : { ...current, w: 720, h: 460 }))}
          >
            {box.w > 500 ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button type="button" aria-label="Close mini-player" onPointerDown={event => event.stopPropagation()} onClick={close}>
            <X size={12} />
          </button>
        </span>
      </div>
      <div className="gg-mini-player-slot" ref={slot} />
      <span
        className="gg-mini-player-resize"
        aria-hidden="true"
        onPointerDown={event => {
          event.stopPropagation();
          resizeStart.current = { x: event.clientX, y: event.clientY, w: box.w, h: box.h };
        }}
      />
    </div>
  );
}
