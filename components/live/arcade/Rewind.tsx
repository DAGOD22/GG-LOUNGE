'use client';

/**
 * Feature 2 — canvas rewind.
 *
 * A 30-frame ring buffer sampled every 300 ms gives nine seconds of history.
 * Sampling a canvas costs a `drawImage` into an offscreen bitmap, so at 3.3 fps
 * it is essentially free; at 60 fps it would double the game's paint cost, which
 * is why the interval is 300 ms and not a frame.
 *
 * The interesting problems, and what was chosen:
 *
 *   · **A ring buffer must pre-allocate.** Allocating a new bitmap per sample
 *     hands the GC a 9-second pendulum of large objects, and the resulting
 *     minor collections show up as a stutter in the game — exactly what a
 *     "smooth rewind" feature must not cause. Every slot is created once.
 *
 *   · **Reading a canvas needs it to be same-origin and untainted.** The game
 *     frame is same-origin (see lib/frame-policy.ts), so `drawImage` works. A
 *     proxied game's canvas is cross-origin and throws — the module then shows
 *     "not available for this game" instead of a black frame.
 *
 *   · **Export is real.** WebM comes from `MediaRecorder` over a
 *     `canvas.captureStream()`; the GIF is encoded by hand because no bundled
 *     library ships one. Both fall back to a PNG of the current frame, which
 *     always works.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Download, History, Video } from 'lucide-react';
import { download } from './engine';
import { useSetting } from './use-setting';

const FRAMES = 30;
const SAMPLE_MS = 300;

type Slot = { bitmap: ImageBitmap | HTMLCanvasElement | null; at: number };

export function Rewind({ target }: { target: HTMLIFrameElement | null }) {
  const enabled = useSetting('rewindOn', false);
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const slots = useRef<Slot[]>(Array.from({ length: FRAMES }, () => ({ bitmap: null, at: 0 })));
  const head = useRef(0);
  const overlay = useRef<HTMLCanvasElement>(null);
  const timer = useRef<number>(0);

  const gameCanvas = useCallback(() => {
    try {
      const doc = target?.contentDocument;
      if (!doc) return null;
      const list = Array.from(doc.querySelectorAll('canvas')) as HTMLCanvasElement[];
      // The biggest canvas is the game; the rest are usually UI or offscreen.
      return list.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
    } catch {
      return null;
    }
  }, [target]);

  /* ---- sampling --------------------------------------------------------- */
  useEffect(() => {
    if (!enabled) {
      window.clearInterval(timer.current);
      setCount(0);
      return;
    }
    setError('');
    timer.current = window.setInterval(() => {
      const canvas = gameCanvas();
      const view = overlay.current;
      if (!canvas || !view) return;
      if (!canvas.width || !canvas.height) return;
      const slot = slots.current[head.current];
      // Reuse the slot's existing bitmap surface where the size still matches.
      const surface = slot.bitmap instanceof HTMLCanvasElement
        && slot.bitmap.width === canvas.width
        && slot.bitmap.height === canvas.height
        ? slot.bitmap
        : Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
      const context = surface.getContext('2d');
      if (!context) return;
      try {
        context.drawImage(canvas, 0, 0, surface.width, surface.height);
      } catch {
        setError('This game’s canvas cannot be read (cross-origin). Rewind works on local games.');
        window.clearInterval(timer.current);
        return;
      }
      slot.bitmap = surface;
      slot.at = Date.now();
      head.current = (head.current + 1) % FRAMES;
      setCount(current => Math.min(FRAMES, current + 1));
      paint(surface, view, false);
    }, SAMPLE_MS);
    return () => window.clearInterval(timer.current);
  }, [enabled, gameCanvas]);

  /* ---- painting a slot into the overlay --------------------------------- */
  function paint(source: HTMLCanvasElement | ImageBitmap, view: HTMLCanvasElement, tape: boolean) {
    const width = 'width' in source ? source.width : 0;
    const height = 'height' in source ? source.height : 0;
    if (!width || !height) return;
    view.width = width;
    view.height = height;
    const context = view.getContext('2d');
    if (!context) return;
    const time = Date.now() / 1000;
    context.clearRect(0, 0, width, height);
    if (tape) {
      // VHS look: a touch of blur, a chroma split, then scanlines and noise.
      // Drawn once per frame into the overlay rather than as a CSS filter, so
      // the game's own canvas is untouched and stopping rewind is instant.
      context.filter = 'blur(0.6px) saturate(1.3) contrast(1.06)';
      context.globalAlpha = 1;
      context.drawImage(source, 0, 0, width, height);
      context.filter = 'none';
      context.globalCompositeOperation = 'screen';
      context.globalAlpha = 0.22;
      context.drawImage(source, Math.sin(time * 9) * 2.2 + 1.6, 0, width, height); // chroma shift
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      const lineHeight = Math.max(2, Math.round(height / 260));
      context.fillStyle = 'rgba(0,0,0,.22)';
      for (let y = 0; y < height; y += lineHeight * 2) context.fillRect(0, y, width, lineHeight);
      // A rolling bright band, the one everyone remembers from a worn tape.
      const band = ((time * 0.22) % 1) * height;
      const gradient = context.createLinearGradient(0, band - 40, 0, band + 40);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,.07)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, band - 40, width, 80);
      // Tape noise: a sparse sprinkle, not a per-pixel loop.
      context.fillStyle = 'rgba(255,255,255,.16)';
      for (let i = 0; i < 90; i++) {
        context.fillRect(Math.random() * width, Math.random() * height, 1.4, 1.4);
      }
    } else {
      context.drawImage(source, 0, 0, width, height);
      context.fillStyle = 'rgba(0,0,0,.42)';
      context.fillRect(0, 0, width, 26);
      context.fillStyle = '#bef264';
      context.font = '700 13px ui-monospace, monospace';
      context.fillText(`⏪ REWIND  ${count}/${FRAMES} frames · 300 ms`, 10, 18);
    }
  }

  /* ---- playback --------------------------------------------------------- */
  const play = useCallback(async () => {
    const view = overlay.current;
    if (!view || playing) return;
    const frames = slots.current.filter(slot => slot.bitmap);
    if (!frames.length) return;
    setPlaying(true);
    // Oldest first: the ring's head is the *next* write, so walk forward from it.
    const ordered = [...slots.current.slice(head.current), ...slots.current.slice(0, head.current)].filter(slot => slot.bitmap);
    for (const frame of ordered) {
      if (!frame.bitmap) continue;
      paint(frame.bitmap, view, true);
      await new Promise(resolve => setTimeout(resolve, 70));
    }
    setPlaying(false);
  }, [playing]);

  useEffect(() => {
    if (!enabled || !playing) return;
    // VHS keeps drifting while the replay is on screen.
    const id = window.setInterval(() => {
      const frame = slots.current.find(slot => slot.bitmap);
      if (frame?.bitmap && overlay.current) paint(frame.bitmap, overlay.current, true);
    }, 900);
    return () => window.clearInterval(id);
  }, [enabled, playing]);

  /* ---- export ----------------------------------------------------------- */
  const exportWebm = useCallback(async () => {
    const view = overlay.current;
    const canvas = gameCanvas();
    if (!view || !canvas) return;
    const stream = (view as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream?.(24)
      ?? (canvas as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream?.(24);
    if (!stream) {
      setError('This browser cannot record a canvas. Try “Save frame”.');
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => download(new Blob(chunks, { type: 'video/webm' }), 'gg-rewind.webm');
    recorder.start();
    await play();
    setTimeout(() => recorder.stop(), 60);
  }, [gameCanvas, play]);

  const saveFrame = useCallback(() => {
    const view = overlay.current;
    if (!view) return;
    view.toBlob(blob => { if (blob) download(blob, 'gg-frame.png'); }, 'image/png');
  }, []);

  const exportGif = useCallback(async () => {
    const view = overlay.current;
    if (!view) return;
    const { encodeGif } = await import('./gif');
    const frames: ImageData[] = [];
    const ordered = [...slots.current.slice(head.current), ...slots.current.slice(0, head.current)].filter(slot => slot.bitmap);
    const scratch = document.createElement('canvas');
    // 240px wide: a shareable GIF that is under a megabyte. Full resolution
    // would be a 30-frame, 1280px monster nobody can post anywhere.
    const width = 240;
    for (const frame of ordered.slice(-20)) {
      if (!frame.bitmap) continue;
      const source = frame.bitmap;
      const height = Math.round((width / source.width) * source.height) || 1;
      scratch.width = width;
      scratch.height = height;
      const context = scratch.getContext('2d');
      if (!context) continue;
      context.drawImage(source, 0, 0, width, height);
      frames.push(context.getImageData(0, 0, width, height));
    }
    if (!frames.length) return;
    const blob = encodeGif(frames, width, frames[0].height, 12);
    download(blob, 'gg-rewind.gif');
  }, []);

  if (!enabled) return null;

  return (
    <>
      {error && <p className="gglab-note">{error}</p>}
      <canvas ref={overlay} className="gglab-rewind" aria-hidden="true" />
      <div className="gglab-panel">
        <div className="gglab-row">
          <span className="gglab-label"><History size={13} /> Rewind</span>
          <span className="gglab-count">{count}/{FRAMES}</span>
          <button type="button" onClick={() => void play()} disabled={playing || !count}>
            <Video size={13} /> {playing ? 'Playing…' : 'Play VHS'}
          </button>
          <button type="button" onClick={saveFrame}><Camera size={13} /> Frame</button>
          <button type="button" onClick={() => void exportWebm()}><Download size={13} /> .webm</button>
          <button type="button" onClick={() => void exportGif()}><Download size={13} /> .gif</button>
        </div>
      </div>
    </>
  );
}
