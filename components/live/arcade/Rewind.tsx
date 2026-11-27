'use client';

/**
 * Rewind — go back in time inside a game.
 *
 * While a game is open, its canvas is sampled three times a second into a
 * 30-frame ring buffer: nine seconds of history that costs one `drawImage` per
 * sample. Press the toolbar button (or the backquote key) and the last nine
 * seconds play back over the frame with a scrubber, a tape look and export
 * buttons — so "what just killed me" is one glance away.
 *
 * Why it is built the way it is:
 *
 *   · **Always recording, no setup.** The previous version hid behind a
 *     "record buffer" toggle inside a seven-tab panel, which meant it captured
 *     nothing until you found that toggle — by which point the moment you
 *     wanted was gone. Sampling at 3.3 fps is effectively free, so the buffer
 *     is always warm and rewind is always one press away.
 *
 *   · **A ring buffer must pre-allocate.** Every slot's surface is created
 *     once and reused while the game size stays the same. Allocating a fresh
 *     bitmap per sample hands the GC a nine-second pendulum of large objects,
 *     and the minor collections land as stutter — exactly what a rewind
 *     feature must not cause.
 *
 *   · **Same-origin only, honestly.** Reading a proxied game's canvas throws
 *     (cross-origin), so the module says so once, in words, instead of showing
 *     black frames or pretending nothing happened.
 *
 *   · **The replay covers the game.** The overlay is a portal into the frame
 *     wrap, not a strip inside a settings panel — the old version drew its
 *     replay into a 96px box under the toggles, which is the single biggest
 *     reason it did not feel like a working feature.
 *
 * The DOM-free maths lives in `rewind-core.ts` where node can test it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, History, Pause, Play, Video, X } from 'lucide-react';
// The `closest`-based guard, not CommandPalette's tag-name one: this handler
// sits on window and can legitimately see a non-element target (document,
// window itself), which the tag-name version dereferences unguarded.
import { isTypingTarget } from '@/lib/customization/settings';
import {
  BUFFER_SECONDS,
  FRAMES,
  REPLAY_STEP_MS,
  SAMPLE_MS,
  clipName,
  filledOrder,
  tapeLabel,
} from './rewind-core';

/** The key that toggles the replay: the backquote, left of "1". */
export const REWIND_KEY = '`';

type Slot = { surface: HTMLCanvasElement | null; at: number };

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function Rewind({
  frame,
  wrap,
  gameId,
}: {
  frame: () => HTMLIFrameElement | null;
  /** Lazy, for the same reason as `frame`: the element mounts after this one. */
  wrap: () => HTMLElement | null;
  /** A new game means a new tape — the previous game's frames must not leak. */
  gameId: string;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState('');
  const [error, setErrorState] = useState('');
  const [host, setHost] = useState<HTMLElement | null>(null);

  const slots = useRef<Slot[]>(Array.from({ length: FRAMES }, () => ({ surface: null, at: 0 })));
  const head = useRef(0);
  const countRef = useRef(0);
  const posRef = useRef(0);
  const overlay = useRef<HTMLCanvasElement>(null);

  const gameCanvas = useCallback(() => {
    try {
      const doc = frame()?.contentDocument;
      if (!doc) return null;
      const list = Array.from(doc.querySelectorAll('canvas')) as HTMLCanvasElement[];
      // The biggest canvas is the game; the rest are usually UI or offscreen.
      return list.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
    } catch {
      return null;
    }
  }, [frame]);

  /* ---- a new game rewinds the tape -------------------------------------- */
  useEffect(() => {
    for (const slot of slots.current) {
      slot.surface = null;
      slot.at = 0;
    }
    head.current = 0;
    countRef.current = 0;
    posRef.current = 0;
    setCount(0);
    setPos(0);
    setPlaying(false);
    setNote('');
    setErrorState('');
  }, [gameId]);

  /* ---- sampling: the tape is always rolling ------------------------------ */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const canvas = gameCanvas();
      if (!canvas || !canvas.width || !canvas.height) return;
      const slot = slots.current[head.current];
      // Reuse the slot's surface while the game size is unchanged.
      const surface =
        slot.surface && slot.surface.width === canvas.width && slot.surface.height === canvas.height
          ? slot.surface
          : Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
      const context = surface.getContext('2d');
      if (!context) return;
      try {
        context.drawImage(canvas, 0, 0, surface.width, surface.height);
      } catch {
        setErrorState('This game’s canvas cannot be read (it is served through the proxy). Rewind works on the lounge’s own games.');
        window.clearInterval(timer);
        return;
      }
      slot.surface = surface;
      slot.at = Date.now();
      head.current = (head.current + 1) % FRAMES;
      countRef.current = Math.min(FRAMES, countRef.current + 1);
      setCount(countRef.current);
    }, SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [gameCanvas]);

  /* ---- painting one frame of the tape into the overlay ------------------- */
  const paint = useCallback((index: number) => {
    const view = overlay.current;
    const order = filledOrder(head.current, countRef.current, FRAMES);
    const slot = slots.current[order[index]];
    if (!view || !slot?.surface) return;
    const width = slot.surface.width;
    const height = slot.surface.height;
    if (!width || !height) return;
    view.width = width;
    view.height = height;
    const context = view.getContext('2d');
    if (!context) return;
    const time = Date.now() / 1000;
    context.clearRect(0, 0, width, height);
    // VHS look: a touch of blur and a chroma split, then scanlines and noise.
    // Drawn here rather than as a CSS filter so the game's own canvas is
    // untouched and closing the replay is instant.
    context.filter = 'blur(0.6px) saturate(1.3) contrast(1.06)';
    context.drawImage(slot.surface, 0, 0, width, height);
    context.filter = 'none';
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = 0.22;
    context.drawImage(slot.surface, Math.sin(time * 9) * 2.2 + 1.6, 0, width, height);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    const lineHeight = Math.max(2, Math.round(height / 260));
    context.fillStyle = 'rgba(0,0,0,.22)';
    for (let y = 0; y < height; y += lineHeight * 2) context.fillRect(0, y, width, lineHeight);
    // A rolling bright band — the one everyone remembers from a worn tape.
    const band = ((time * 0.22) % 1) * height;
    const gradient = context.createLinearGradient(0, band - 40, 0, band + 40);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,.07)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, band - 40, width, 80);
    context.fillStyle = 'rgba(255,255,255,.16)';
    for (let i = 0; i < 90; i++) {
      context.fillRect(Math.random() * width, Math.random() * height, 1.4, 1.4);
    }
    // The tape clock, from the real scrub position — never a stale closure.
    context.fillStyle = 'rgba(0,0,0,.42)';
    context.fillRect(0, 0, width, 26);
    context.fillStyle = '#bef264';
    context.font = '700 13px ui-monospace, monospace';
    context.fillText(`⏪ ${tapeLabel(index, countRef.current)}`, 10, 18);
  }, []);

  /* ---- keep the screen in step with the scrubber ------------------------- */
  useEffect(() => {
    posRef.current = pos;
    if (open) paint(pos);
  }, [pos, open, paint]);

  /* ---- playback walks the tape backwards --------------------------------- */
  useEffect(() => {
    if (!open || !playing) return;
    const timer = window.setInterval(() => {
      const next = posRef.current - 1;
      if (next < 0) {
        setPlaying(false);
        return;
      }
      posRef.current = next;
      setPos(next);
      paint(next);
    }, REPLAY_STEP_MS);
    return () => window.clearInterval(timer);
  }, [open, playing, paint]);

  /* ---- the tape keeps its texture alive while it is on screen ------------ */
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      if (!playing) paint(posRef.current);
    }, 900);
    return () => window.clearInterval(timer);
  }, [open, playing, paint]);

  /* ---- open / close, from the button or the key -------------------------- */
  const toggle = useCallback(() => {
    setOpen(current => {
      if (current) {
        setPlaying(false);
        return false;
      }
      if (!countRef.current) {
        setNote('Recording the last nine seconds… nothing captured yet.');
        return true;
      }
      setNote('');
      setPlaying(false);
      const newest = countRef.current - 1;
      posRef.current = newest;
      setPos(newest);
      return true;
    });
  }, []);

  useEffect(() => {
    setHost(wrap());
    // `wrap` is a fresh closure per render of the modal; re-resolving it cheap
    // here keeps the portal target honest without state in the parent.
  }, [wrap, open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
        setPlaying(false);
        return;
      }
      if (event.key !== REWIND_KEY && event.key !== 'Backquote') return;
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, toggle]);

  /* ---- exports ------------------------------------------------------------ */
  const saveFrame = useCallback(() => {
    const order = filledOrder(head.current, countRef.current, FRAMES);
    const slot = slots.current[order[posRef.current]];
    if (!slot?.surface) return;
    slot.surface.toBlob(blob => {
      if (blob) download(blob, clipName('png'));
    }, 'image/png');
  }, []);

  const exportClip = useCallback(async () => {
    const view = overlay.current;
    if (!view || !countRef.current) return;
    const capture = (view as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream?.(24);
    if (!capture) {
      setErrorState('This browser cannot record a canvas. “Save frame” still works.');
      return;
    }
    const chunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(capture, { mimeType: 'video/webm;codecs=vp9' });
    } catch {
      setErrorState('This browser cannot record a canvas. “Save frame” still works.');
      return;
    }
    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => download(new Blob(chunks, { type: 'video/webm' }), clipName('webm'));
    setPlaying(false);
    const newest = countRef.current - 1;
    posRef.current = newest;
    setPos(newest);
    recorder.start();
    // Walk newest → oldest at the replay's own cadence so the clip is exactly
    // what the replay shows.
    for (let index = newest; index >= 0; index--) {
      posRef.current = index;
      setPos(index);
      paint(index);
      await new Promise(resolve => setTimeout(resolve, REPLAY_STEP_MS));
    }
    setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), 80);
  }, [paint]);

  const newest = Math.max(0, count - 1);

  return (
    <>
      <button
        type="button"
        className={`controls-toggle rewind-toggle${open ? ' active' : ''}`}
        onClick={toggle}
        title={`Rewind — replay the last ${BUFFER_SECONDS}s over the game (${REWIND_KEY})`}
        aria-pressed={open}
      >
        <History size={14} /> Rewind
      </button>

      {open &&
        host &&
        createPortal(
          <div className="gg-rewind-layer">
            <canvas ref={overlay} className="gg-rewind-screen" aria-hidden="true" />
            {note ? (
              <p className="gg-rewind-note">{note}</p>
            ) : (
              <div className="gg-rewind-hud">
                <button
                  type="button"
                  onClick={() => setPlaying(value => !value)}
                  disabled={!count}
                  aria-label={playing ? 'Pause the tape' : 'Play the tape backwards'}
                >
                  {playing ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={newest}
                  value={Math.min(pos, newest)}
                  onChange={event => {
                    setPlaying(false);
                    setPos(Number(event.target.value));
                  }}
                  aria-label="Scrub the tape"
                />
                <span className="gg-rewind-clock">{tapeLabel(pos, count)}</span>
                <button type="button" onClick={saveFrame} title="Save the current frame as a PNG">
                  <Camera size={13} />
                </button>
                <button type="button" onClick={() => void exportClip()} title="Save the rewind as a .webm clip">
                  <Video size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setPlaying(false);
                  }}
                  aria-label="Close rewind"
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {error && <p className="gg-rewind-note">{error}</p>}
          </div>,
          host,
        )}
    </>
  );
}
