'use client';

/**
 * The secret layer's overlays.
 *
 * Each one is a full-viewport surface that exists only while its secret is on:
 * fixed position, pointer-events none, own stacking level. None of them touch
 * the site's layout, so turning any of them off restores exactly what was
 * underneath — the one rule every secret effect has to keep.
 *
 * All of the animation loops here respect `prefers-reduced-motion` by drawing
 * a single static frame instead of animating.
 */

import { useEffect, useRef } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF'.split('');

/** The falling green character rain. One colour, one column per glyph width. */
export function CodeRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const fontSize = 14;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let columns = Math.max(1, Math.ceil(width / fontSize));
    const drops = Array.from({ length: columns }, () => Math.random() * -60);

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      columns = Math.max(1, Math.ceil(width / fontSize));
    };
    window.addEventListener('resize', onResize);

    const drawColumn = () => {
      context.fillStyle = 'rgba(4, 9, 6, 0.14)';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#37ff8b';
      context.font = `${fontSize}px ui-monospace, monospace`;
      for (let column = 0; column < columns; column++) {
        const glyph = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        context.fillText(glyph, column * fontSize, drops[column] * fontSize);
        if (drops[column] * fontSize > height && Math.random() > 0.975) drops[column] = 0;
        drops[column] += 1;
      }
    };

    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      drawColumn();
      return () => window.removeEventListener('resize', onResize);
    }

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // 20 fps is the look; 60 fps is noise nobody asked for.
      if (now - last < 50) return;
      last = now;
      drawColumn();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="gg-secret-canvas" style={{ opacity: 0.62 }} aria-hidden="true" />;
}

/** Snow, anywhere, any month. Cheap particles, one canvas, no layout. */
export function Snowfall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    const flakes = Array.from({ length: 140 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 1 + Math.random() * 2.4,
      speed: 0.4 + Math.random() * 1.1,
      sway: Math.random() * Math.PI * 2,
    }));

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const drawFrame = () => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = 'rgba(240, 247, 255, 0.85)';
      for (const flake of flakes) {
        context.beginPath();
        context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        context.fill();
      }
    };

    const advance = () => {
      for (const flake of flakes) {
        flake.y += flake.speed;
        flake.sway += 0.012;
        flake.x += Math.sin(flake.sway) * 0.5;
        if (flake.y - flake.radius > height) {
          flake.y = -flake.radius;
          flake.x = Math.random() * width;
        }
        if (flake.x < -4) flake.x = width + 4;
        if (flake.x > width + 4) flake.x = -4;
      }
    };

    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      advance();
      drawFrame();
      return () => window.removeEventListener('resize', onResize);
    }

    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 33) return; // 30 fps: snow is slow anyway
      last = now;
      advance();
      drawFrame();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="gg-secret-canvas" aria-hidden="true" />;
}

/**
 * Everything dark except a soft circle that follows the pointer.
 * The circle is CSS vars on the overlay itself, updated in one rAF-throttled
 * listener — no re-render, no React state in the pointer path.
 */
export function Spotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    const onMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        el.style.setProperty('--gg-spot-x', `${x}px`);
        el.style.setProperty('--gg-spot-y', `${y}px`);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    el.style.setProperty('--gg-spot-x', `${x}px`);
    el.style.setProperty('--gg-spot-y', `${y}px`);
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className="gg-spotlight" aria-hidden="true" />;
}

/** 1997: a warm multiply veil and a scrolling ribbon. No loops at all. */
export function TimeWarp() {
  return (
    <>
      <div className="gg-timewarp-veil" aria-hidden="true" />
      <div className="gg-timewarp-ribbon" aria-hidden="true">
        <span>
          ★ BEST VIEWED AT 800×600 ★ UNDER CONSTRUCTION ★ SIGN MY GUESTBOOK ★ NETSCAPE NOW! ★ WEBRING ★ GG-LOUNGE ★
          BEST VIEWED AT 800×600 ★ UNDER CONSTRUCTION ★ SIGN MY GUESTBOOK ★ NETSCAPE NOW! ★ WEBRING ★ GG-LOUNGE ★
        </span>
      </div>
    </>
  );
}

/** Scanlines and a vignette. The CSS carries everything; this is just the div. */
export function RetroMode() {
  return <div className="gg-retro-veil" aria-hidden="true" />;
}

/** One confetti burst, roughly 1.8 seconds, then it unmounts itself. */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ['#bef264', '#7dd3fc', '#f472b6', '#fbbf24', '#a78bfa'];
    const pieces = Array.from({ length: 160 }, () => ({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 180,
      y: window.innerHeight / 2 + (Math.random() - 0.5) * 90,
      vx: (Math.random() - 0.5) * 11,
      vy: -4 - Math.random() * 9,
      size: 3 + Math.random() * 5,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: colors[(Math.random() * colors.length) | 0],
    }));
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const age = now - start;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const alpha = Math.max(0, 1 - age / 1800);
      for (const piece of pieces) {
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.vy += 0.32;
        piece.rotation += piece.spin;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.globalAlpha = alpha;
        context.fillStyle = piece.color;
        context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.6);
        context.restore();
      }
      if (age < 1800) raf = requestAnimationFrame(tick);
    };
    if (typeof requestAnimationFrame !== 'function') return;
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="gg-secret-canvas" aria-hidden="true" />;
}
