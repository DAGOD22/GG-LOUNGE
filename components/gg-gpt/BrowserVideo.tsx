'use client';
/**
 * Turns generated keyframes into a real video file, in the browser.
 *
 * Why this exists: a free, keyless text-to-video API does not exist. Rather than
 * show a still image and call it a video (which is what this site used to do),
 * this renders an actual moving clip: each keyframe gets a camera move, the
 * frames cross-fade, and MediaRecorder encodes the canvas to WebM. The user gets
 * a file they can download and share, with no key, no upload and no cost.
 *
 * Everything happens locally — the images come from URLs the browser fetches
 * anyway, and not one byte of the render leaves the device.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Frame {
  url: string;
  move: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'tilt-up';
}

export interface BrowserVideoProps {
  frames: Frame[];
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  /** Shown as the download filename. */
  name?: string;
  /** Auto-render on mount. Off means the user presses Render. */
  auto?: boolean;
}

type State = 'idle' | 'loading' | 'rendering' | 'done' | 'error' | 'unsupported';

/** Pick a container the browser can actually encode. */
function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // isTypeSupported can throw on exotic builds.
    }
  }
  return null;
}

/** Ease in/out so a move starts and stops like a camera, not a robot. */
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function BrowserVideo({ frames, width, height, durationSec, fps, name = 'gg-lounge-video', auto = true }: BrowserVideoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  const render = useCallback(async () => {
    if (cancelled.current) return;
    const mime = pickMime();
    const canvas = canvasRef.current;
    if (!mime || !canvas || !frames.length) {
      setState(mime ? 'error' : 'unsupported');
      if (!mime) setError('This browser cannot encode video. The keyframes are shown instead.');
      return;
    }

    setState('loading');
    setError('');

    // Load every frame first: a half-loaded montage looks like a bug.
    const images = await Promise.all(
      frames.map(
        f =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('frame failed'));
            img.src = f.url;
          }),
      ),
    ).catch(() => null);

    if (!images) {
      setState('error');
      setError('A keyframe failed to load. Press Render to try again.');
      return;
    }
    if (cancelled.current) return;

    setState('rendering');
    const ctx = canvas.getContext('2d');
    if (!ctx) { setState('error'); setError('Canvas is unavailable.'); return; }

    const stream = canvas.captureStream(fps);
    const chunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    } catch {
      setState('error');
      setError('This browser blocked video recording.');
      return;
    }
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    const finished = new Promise<void>(resolve => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        setUrl(URL.createObjectURL(blob));
        setProgress(1);
        setState('done');
        resolve();
      };
    });

    recorder.start();
    const perFrame = (durationSec * 1000) / images.length;
    const FADE = Math.min(420, perFrame * 0.28);
    const startedAt = performance.now();

    await new Promise<void>(resolve => {
      const step = () => {
        if (cancelled.current) { resolve(); return; }
        const now = performance.now();
        const elapsed = now - startedAt;
        const idx = Math.min(images.length - 1, Math.floor(elapsed / perFrame));
        const local = (elapsed - idx * perFrame) / perFrame;
        const t = Math.min(1, Math.max(0, local));

        drawFrame(ctx, images[idx], frames[idx].move, ease(t), width, height);

        // Cross-fade into the next frame near the end of this one.
        const remaining = perFrame - (elapsed - idx * perFrame);
        if (idx + 1 < images.length && remaining < FADE) {
          const a = 1 - remaining / FADE;
          ctx.globalAlpha = Math.min(1, Math.max(0, a));
          drawFrame(ctx, images[idx + 1], frames[idx + 1].move, 0, width, height);
          ctx.globalAlpha = 1;
        }

        setProgress(Math.min(0.99, elapsed / (durationSec * 1000)));
        if (elapsed >= durationSec * 1000) { resolve(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    recorder.stop();
    stream.getTracks().forEach(t => t.stop());
    await finished;
  }, [frames, width, height, durationSec, fps]);

  useEffect(() => {
    if (auto) void render();
  }, [auto, render]);

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.webm`;
    a.click();
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ maxWidth: '100%', borderRadius: 10, display: state === 'done' ? 'none' : 'block', background: '#000' }}
      />
      {state === 'done' && url && (
        <video src={url} controls loop autoPlay playsInline style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11 }}>
        {state === 'loading' && <span style={{ opacity: 0.7 }}>Loading keyframes…</span>}
        {state === 'rendering' && (
          <>
            <span style={{ opacity: 0.7 }}>Rendering in your browser</span>
            <span style={{ flex: 1, minWidth: 90, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.round(progress * 100)}%`, background: 'var(--lime, #d7f34a)', transition: 'width .2s' }} />
            </span>
            <span style={{ opacity: 0.7 }}>{Math.round(progress * 100)}%</span>
          </>
        )}
        {state === 'done' && (
          <>
            <button onClick={download} style={btn}>Download .webm</button>
            <button onClick={() => { setUrl(''); void render(); }} style={btnGhost}>Render again</button>
            <span style={{ opacity: 0.6 }}>{durationSec}s · {width}×{height} · {fps} fps</span>
          </>
        )}
        {(state === 'error' || state === 'unsupported') && (
          <>
            <span style={{ color: '#ffb4a2' }}>{error || 'Video rendering is not supported here.'}</span>
            <button onClick={() => void render()} style={btn}>Retry</button>
          </>
        )}
      </div>
      {state === 'idle' && <button onClick={() => void render()} style={btn}>Render video</button>}
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '6px 11px', borderRadius: 999, border: '1px solid var(--lime, #d7f34a)',
  background: 'var(--lime, #d7f34a)', color: '#0b0d12', fontWeight: 800, fontSize: 11, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  padding: '6px 11px', borderRadius: 999, border: '1px solid rgba(255,255,255,.18)',
  background: 'transparent', color: 'inherit', fontWeight: 700, fontSize: 11, cursor: 'pointer',
};

/** Draw one keyframe with a camera move applied, filling the canvas. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  move: Frame['move'],
  t: number,
  width: number,
  height: number,
) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  // Cover-fit the source, then apply the move as an extra transform.
  const imgRatio = img.width / img.height;
  const canvasRatio = width / height;
  let baseW = width, baseH = height;
  if (imgRatio > canvasRatio) baseW = height * imgRatio;
  else baseH = width / imgRatio;

  const zoom = 1.06;
  let scale = zoom;
  let dx = 0, dy = 0;

  switch (move) {
    case 'zoom-in': scale = 1 + 0.14 * t; break;
    case 'zoom-out': scale = 1.14 - 0.14 * t; break;
    case 'pan-left': scale = 1.12; dx = (0.5 - t) * width * 0.10; break;
    case 'pan-right': scale = 1.12; dx = (t - 0.5) * width * 0.10; break;
    case 'tilt-up': scale = 1.12; dy = (0.5 - t) * height * 0.10; break;
  }

  const w = baseW * scale;
  const h = baseH * scale;
  ctx.drawImage(img, (width - w) / 2 + dx, (height - h) / 2 + dy, w, h);
}
