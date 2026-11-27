'use client';

/**
 * The screen-warp overlays — the things that fill the sky.
 *
 * Every effect here is one fixed, full-viewport canvas (or, for the clock and
 * the hit counter, a small DOM overlay) that exists only while its warp is on:
 * pointer-events none, own stacking level, no layout impact. Turning one off
 * unmounts it and the site underneath is untouched.
 *
 * They all share one loop hook: a sized canvas, a resize listener, a capped
 * frame rate, and a single static frame when the visitor prefers reduced
 * motion — a frozen starfield beats an animation nobody asked for.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Run a scene on a full-window canvas.
 *
 * `build` receives the context and returns the per-frame draw. The hook owns
 * everything else: sizing, resize, the rAF cadence and cleanup. `fps` is
 * deliberately low — these are weather, not gameplay, and 30 fps is plenty.
 */
function useCanvasScene(
  ref: RefObject<HTMLCanvasElement | null>,
  build: (context: CanvasRenderingContext2D) => (tick: number, dt: number) => void,
  fps = 30,
) {
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = build(context);
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      draw(0, 0);
      return () => window.removeEventListener('resize', resize);
    }
    let raf = 0;
    let last = 0;
    let tick = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / fps) return;
      const dt = last ? now - last : 16;
      last = now;
      draw(tick++, dt);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [ref, build, fps]);
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

/* ------------------------------------------------------------ meteors ---- */

export function MeteorShower() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    type Meteor = { x: number; y: number; vx: number; vy: number; len: number; life: number };
    let meteors: Meteor[] = [];
    return (tick: number, dt: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      context.clearRect(0, 0, w, h);
      const speed = dt / 16;
      if (tick % 22 === 0 && meteors.length < 9) {
        meteors.push({
          x: random(w * 0.1, w * 1.1),
          y: random(-60, h * 0.3),
          vx: random(-7, -3.5),
          vy: random(3.5, 6.5),
          len: random(90, 190),
          life: 1,
        });
      }
      meteors = meteors.filter(m => m.y < h + 40 && m.life > 0);
      for (const m of meteors) {
        m.x += m.vx * speed;
        m.y += m.vy * speed;
        const tailX = m.x - m.vx * (m.len / 10);
        const tailY = m.y - m.vy * (m.len / 10);
        const gradient = context.createLinearGradient(m.x, m.y, tailX, tailY);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(1, 'rgba(125, 211, 252, 0)');
        context.strokeStyle = gradient;
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(m.x, m.y);
        context.lineTo(tailX, tailY);
        context.stroke();
      }
    };
  }, []);
  useCanvasScene(ref, build, 30);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

/* -------------------------------------------------------------- stars ---- */

export function StarrySky() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    const stars = Array.from({ length: 150 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: random(0.5, 1.8),
      phase: random(0, Math.PI * 2),
      speed: random(0.02, 0.06),
    }));
    return (tick: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      context.clearRect(0, 0, w, h);
      for (const star of stars) {
        const alpha = 0.35 + 0.65 * Math.abs(Math.sin(tick * star.speed + star.phase));
        context.globalAlpha = alpha;
        context.fillStyle = '#f5f7ff';
        context.beginPath();
        context.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };
  }, []);
  useCanvasScene(ref, build, 24);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

/* ---------------------------------------------------------- fireworks ---- */

export function FireworksShow() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    type Rocket = { x: number; y: number; vy: number; hue: number };
    type Spark = { x: number; y: number; vx: number; vy: number; hue: number; life: number };
    const rockets: Rocket[] = [];
    const sparks: Spark[] = [];
    const COLORS = [350, 190, 75, 280, 130];
    return (tick: number, dt: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      const speed = dt / 16;
      context.clearRect(0, 0, w, h);
      if (tick % 40 === 0 && rockets.length < 3) {
        rockets.push({ x: random(w * 0.15, w * 0.85), y: h, vy: random(-13, -10), hue: COLORS[(Math.random() * COLORS.length) | 0] });
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const rocket = rockets[i];
        rocket.y += rocket.vy * speed;
        context.fillStyle = `hsla(${rocket.hue}, 90%, 70%, 0.9)`;
        context.fillRect(rocket.x - 1.5, rocket.y, 3, 8);
        if (rocket.vy * speed > -1 || rocket.y < h * 0.25) {
          for (let s = 0; s < 42; s++) {
            const angle = (Math.PI * 2 * s) / 42 + Math.random() * 0.2;
            const power = random(1.5, 5.5);
            sparks.push({ x: rocket.x, y: rocket.y, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power, hue: rocket.hue + random(-14, 14), life: 1 });
          }
          rockets.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i];
        spark.x += spark.vx * speed;
        spark.y += spark.vy * speed;
        spark.vy += 0.06 * speed;
        spark.life -= 0.014 * speed;
        if (spark.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        context.fillStyle = `hsla(${spark.hue}, 92%, 65%, ${spark.life})`;
        context.fillRect(spark.x, spark.y, 2.2, 2.2);
      }
    };
  }, []);
  useCanvasScene(ref, build, 30);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

/* ---------------------------------------------------------- rain/storm --- */

function drawRain(context: CanvasRenderingContext2D, drops: { x: number; y: number; v: number; l: number }[], dt: number, slant = 2.2) {
  const w = context.canvas.width;
  const h = context.canvas.height;
  const speed = dt / 16;
  context.clearRect(0, 0, w, h);
  context.strokeStyle = 'rgba(190, 215, 255, 0.5)';
  context.lineWidth = 1.2;
  context.beginPath();
  for (const drop of drops) {
    drop.y += drop.v * speed;
    drop.x += slant * speed * 0.6;
    if (drop.y > h) {
      drop.y = -drop.l;
      drop.x = Math.random() * w;
    }
    context.moveTo(drop.x, drop.y);
    context.lineTo(drop.x - slant, drop.y - drop.l);
  }
  context.stroke();
}

function makeDrops(count: number) {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    v: random(9, 16),
    l: random(12, 26),
  }));
}

export function Rainfall() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    const drops = makeDrops(190);
    return (_tick: number, dt: number) => drawRain(context, drops, dt);
  }, []);
  useCanvasScene(ref, build, 30);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

export function Thunderstorm() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    const drops = makeDrops(190);
    let flash = 0;
    return (tick: number, dt: number) => {
      drawRain(context, drops, dt, 3.4);
      // The flash: rare, sharp, and fading over a few frames so it reads as
      // lightning rather than a strobe.
      if (Math.random() < 0.006) flash = 0.85;
      if (flash > 0) {
        context.fillStyle = `rgba(235, 240, 255, ${flash})`;
        context.fillRect(0, 0, context.canvas.width, context.canvas.height);
        flash = Math.max(0, flash - (tick % 3 === 0 ? 0.09 : 0.03));
      }
    };
  }, []);
  useCanvasScene(ref, build, 30);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

/* ------------------------------------------------------------ fireflies -- */

export function Fireflies() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    const flies = Array.from({ length: 26 }, () => ({
      x: Math.random(),
      y: Math.random(),
      ax: random(0, Math.PI * 2),
      ay: random(0, Math.PI * 2),
      pulse: random(0, Math.PI * 2),
    }));
    return (tick: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      context.clearRect(0, 0, w, h);
      for (const fly of flies) {
        fly.ax += 0.012;
        fly.ay += 0.01;
        fly.x += Math.sin(fly.ax) * 0.0011;
        fly.y += Math.cos(fly.ay) * 0.0009;
        if (fly.x < 0 || fly.x > 1) fly.x = Math.abs(1 - fly.x) * 0 + (fly.x < 0 ? 1 : 0);
        if (fly.y < 0 || fly.y > 1) fly.y = fly.y < 0 ? 1 : 0;
        const glow = 0.35 + 0.65 * Math.abs(Math.sin(tick * 0.03 + fly.pulse));
        const x = fly.x * w;
        const y = fly.y * h;
        const gradient = context.createRadialGradient(x, y, 0, x, y, 9);
        gradient.addColorStop(0, `rgba(215, 255, 130, ${glow})`);
        gradient.addColorStop(1, 'rgba(215, 255, 130, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, 9, 0, Math.PI * 2);
        context.fill();
      }
    };
  }, []);
  useCanvasScene(ref, build, 24);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

/* ------------------------------------------------- bubbles and embers ---- */

export function Bubbles() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    const bubbles = Array.from({ length: 42 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: random(3, 11),
      v: random(0.4, 1.3),
      sway: random(0, Math.PI * 2),
    }));
    return (_tick: number, dt: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      const speed = dt / 16;
      context.clearRect(0, 0, w, h);
      for (const bubble of bubbles) {
        bubble.y -= (bubble.v * speed) / h;
        bubble.sway += 0.02 * speed;
        if (bubble.y < -0.05) {
          bubble.y = 1.05;
          bubble.x = Math.random();
        }
        const x = bubble.x * w + Math.sin(bubble.sway) * 14;
        const y = bubble.y * h;
        context.strokeStyle = 'rgba(190, 230, 255, 0.55)';
        context.lineWidth = 1.2;
        context.beginPath();
        context.arc(x, y, bubble.r, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = 'rgba(255, 255, 255, 0.16)';
        context.beginPath();
        context.arc(x - bubble.r * 0.3, y - bubble.r * 0.3, bubble.r * 0.32, 0, Math.PI * 2);
        context.fill();
      }
    };
  }, []);
  useCanvasScene(ref, build, 30);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

export function EmberRise() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    const embers = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: random(1, 2.8),
      v: random(0.5, 1.6),
      sway: random(0, Math.PI * 2),
      flicker: random(0, Math.PI * 2),
    }));
    return (tick: number, dt: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      const speed = dt / 16;
      context.clearRect(0, 0, w, h);
      for (const ember of embers) {
        ember.y -= (ember.v * speed) / h;
        ember.sway += 0.016 * speed;
        if (ember.y < -0.03) {
          ember.y = 1.03;
          ember.x = Math.random();
        }
        const alpha = 0.45 + 0.55 * Math.abs(Math.sin(tick * 0.09 + ember.flicker));
        const x = ember.x * w + Math.sin(ember.sway) * 18;
        const y = ember.y * h;
        context.fillStyle = `hsla(${18 + Math.sin(ember.flicker) * 12}, 96%, 58%, ${alpha})`;
        context.beginPath();
        context.arc(x, y, ember.r, 0, Math.PI * 2);
        context.fill();
      }
    };
  }, []);
  useCanvasScene(ref, build, 30);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

/* --------------------------------------------------- blossom / confetti -- */

export function CherryBlossom() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    const petals = Array.from({ length: 55 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: random(3, 6.5),
      v: random(0.5, 1.2),
      spin: random(0, Math.PI * 2),
      spinSpeed: random(-0.05, 0.05),
      sway: random(0, Math.PI * 2),
    }));
    return (_tick: number, dt: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      const speed = dt / 16;
      context.clearRect(0, 0, w, h);
      for (const petal of petals) {
        petal.y += (petal.v * speed) / h;
        petal.x += Math.sin((petal.sway += 0.02 * speed)) * 0.0012;
        petal.spin += petal.spinSpeed * speed;
        if (petal.y > 1.05) {
          petal.y = -0.05;
          petal.x = Math.random();
        }
        context.save();
        context.translate(petal.x * w, petal.y * h);
        context.rotate(petal.spin);
        context.fillStyle = 'rgba(255, 183, 210, 0.85)';
        context.beginPath();
        context.ellipse(0, 0, petal.r, petal.r * 0.55, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    };
  }, []);
  useCanvasScene(ref, build, 30);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

const CONFETTI_COLORS = ['#bef264', '#7dd3fc', '#f472b6', '#fbbf24', '#a78bfa', '#34d399'];

export function ConfettiRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    const pieces = Array.from({ length: 130 }, () => ({
      x: Math.random(),
      y: Math.random(),
      w: random(4, 8),
      h: random(6, 12),
      v: random(0.8, 2),
      spin: random(0, Math.PI * 2),
      spinSpeed: random(-0.08, 0.08),
      sway: random(0, Math.PI * 2),
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
    }));
    return (_tick: number, dt: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      const speed = dt / 16;
      context.clearRect(0, 0, w, h);
      for (const piece of pieces) {
        piece.y += (piece.v * speed) / h;
        piece.spin += piece.spinSpeed * speed;
        if (piece.y > 1.05) {
          piece.y = -0.05;
          piece.x = Math.random();
        }
        context.save();
        context.translate(piece.x * w + Math.sin((piece.sway += 0.02 * speed)) * 12, piece.y * h);
        context.rotate(piece.spin);
        context.fillStyle = piece.color;
        context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        context.restore();
      }
    };
  }, []);
  useCanvasScene(ref, build, 30);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

/* ---------------------------------------------------------------- bats --- */

export function BatSwarm() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    const bats = Array.from({ length: 11 }, () => ({
      x: Math.random(),
      y: random(0.05, 0.55),
      v: random(0.7, 1.6),
      size: random(9, 17),
      flap: random(0, Math.PI * 2),
      bob: random(0, Math.PI * 2),
      dir: Math.random() < 0.5 ? 1 : -1,
    }));
    return (_tick: number, dt: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      const speed = dt / 16;
      context.clearRect(0, 0, w, h);
      for (const bat of bats) {
        bat.x += (bat.v * speed * bat.dir) / w;
        bat.flap += 0.22 * speed;
        bat.bob += 0.05 * speed;
        if (bat.x > 1.06) bat.x = -0.06;
        if (bat.x < -0.06) bat.x = 1.06;
        const x = bat.x * w;
        const y = bat.y * h + Math.sin(bat.bob) * 12;
        const wing = Math.sin(bat.flap) * bat.size * 0.55;
        context.fillStyle = 'rgba(12, 14, 20, 0.92)';
        context.beginPath();
        // body
        context.ellipse(x, y, bat.size * 0.28, bat.size * 0.42, 0, 0, Math.PI * 2);
        context.fill();
        // wings: two arcs that flap
        context.beginPath();
        context.moveTo(x, y - 1);
        context.quadraticCurveTo(x - bat.size * 0.7, y - wing, x - bat.size * 1.25, y + wing * 0.4);
        context.quadraticCurveTo(x - bat.size * 0.6, y + bat.size * 0.34, x, y + bat.size * 0.2);
        context.fill();
        context.beginPath();
        context.moveTo(x, y - 1);
        context.quadraticCurveTo(x + bat.size * 0.7, y - wing, x + bat.size * 1.25, y + wing * 0.4);
        context.quadraticCurveTo(x + bat.size * 0.6, y + bat.size * 0.34, x, y + bat.size * 0.2);
        context.fill();
        // ears
        context.beginPath();
        context.moveTo(x - 2, y - bat.size * 0.34);
        context.lineTo(x, y - bat.size * 0.62);
        context.lineTo(x + 2, y - bat.size * 0.34);
        context.fill();
      }
    };
  }, []);
  useCanvasScene(ref, build, 30);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

/* ----------------------------------------------------------------- ufo --- */

export function UFOVisit() {
  const ref = useRef<HTMLCanvasElement>(null);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    // The saucer waits, crosses, waits. state >= 0 is mid-flight progress.
    let progress = -1;
    let cooldown = 90;
    let altitude = 90;
    return (_tick: number, dt: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      const speed = dt / 16;
      context.clearRect(0, 0, w, h);
      if (progress < 0) {
        cooldown -= speed;
        if (cooldown <= 0) {
          progress = 0;
          altitude = random(70, h * 0.3);
          cooldown = random(260, 420);
        }
        return;
      }
      progress += (0.0038 * speed);
      if (progress > 1.12) {
        progress = -1;
        return;
      }
      const x = -70 + progress * (w + 140);
      const y = altitude + Math.sin(progress * 24) * 7;
      // beam
      context.fillStyle = 'rgba(190, 242, 100, 0.14)';
      context.beginPath();
      context.moveTo(x - 9, y + 9);
      context.lineTo(x - 40, h);
      context.lineTo(x + 40, h);
      context.lineTo(x + 9, y + 9);
      context.closePath();
      context.fill();
      // saucer: dome, disc, lights
      context.fillStyle = '#9be27a';
      context.beginPath();
      context.ellipse(x, y - 5, 14, 10, 0, Math.PI, 0);
      context.fill();
      context.fillStyle = '#41573a';
      context.beginPath();
      context.ellipse(x, y, 34, 11, 0, 0, Math.PI * 2);
      context.fill();
      for (let i = 0; i < 5; i++) {
        const lx = x - 24 + i * 12;
        context.fillStyle = `hsla(70, 90%, 65%, ${0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 160 + i))})`;
        context.beginPath();
        context.arc(lx, y + 5, 2.4, 0, Math.PI * 2);
        context.fill();
      }
    };
  }, []);
  useCanvasScene(ref, build, 30);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

/* ------------------------------------------- pointer-driven overlays ----- */

export function RainbowTrail() {
  const ref = useRef<HTMLCanvasElement>(null);
  const points = useRef<{ x: number; y: number }[]>([]);
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      points.current.push({ x: event.clientX, y: event.clientY });
      if (points.current.length > 42) points.current.shift();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    let hue = 0;
    return () => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      context.clearRect(0, 0, w, h);
      hue = (hue + 3) % 360;
      const trail = points.current;
      for (let i = 0; i < trail.length; i++) {
        const age = (i + 1) / trail.length;
        context.fillStyle = `hsla(${(hue + i * 9) % 360}, 95%, 62%, ${age * 0.7})`;
        context.beginPath();
        context.arc(trail[i].x, trail[i].y, 2 + age * 7, 0, Math.PI * 2);
        context.fill();
      }
    };
  }, []);
  useCanvasScene(ref, build, 36);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

export function ClickRipples() {
  const ref = useRef<HTMLCanvasElement>(null);
  const ripples = useRef<{ x: number; y: number; r: number; alpha: number }[]>([]);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      ripples.current.push({ x: event.clientX, y: event.clientY, r: 4, alpha: 0.8 });
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    return (_tick: number, dt: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      const speed = dt / 16;
      context.clearRect(0, 0, w, h);
      ripples.current = ripples.current.filter(ripple => ripple.alpha > 0.02);
      for (const ripple of ripples.current) {
        ripple.r += 4.2 * speed;
        ripple.alpha -= 0.018 * speed;
        context.strokeStyle = `rgba(190, 242, 100, ${ripple.alpha})`;
        context.lineWidth = 2.4;
        context.beginPath();
        context.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
        context.stroke();
      }
    };
  }, []);
  useCanvasScene(ref, build, 36);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

export function PartyClicks() {
  const ref = useRef<HTMLCanvasElement>(null);
  const pieces = useRef<{ x: number; y: number; vx: number; vy: number; spin: number; spinSpeed: number; color: string; life: number }[]>([]);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      for (let i = 0; i < 30; i++) {
        pieces.current.push({
          x: event.clientX,
          y: event.clientY,
          vx: random(-6, 6),
          vy: random(-9, -2),
          spin: Math.random() * Math.PI,
          spinSpeed: random(-0.3, 0.3),
          color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
          life: 1,
        });
      }
      if (pieces.current.length > 400) pieces.current.splice(0, pieces.current.length - 400);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);
  const build = useCallback((context: CanvasRenderingContext2D) => {
    return (_tick: number, dt: number) => {
      const w = context.canvas.width;
      const h = context.canvas.height;
      const speed = dt / 16;
      context.clearRect(0, 0, w, h);
      pieces.current = pieces.current.filter(piece => piece.life > 0 && piece.y < h + 20);
      for (const piece of pieces.current) {
        piece.x += piece.vx * speed;
        piece.y += piece.vy * speed;
        piece.vy += 0.34 * speed;
        piece.spin += piece.spinSpeed * speed;
        piece.life -= 0.008 * speed;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.spin);
        context.globalAlpha = Math.max(0, piece.life);
        context.fillStyle = piece.color;
        context.fillRect(-3, -2, 6, 4);
        context.restore();
      }
      context.globalAlpha = 1;
    };
  }, []);
  useCanvasScene(ref, build, 36);
  return <canvas ref={ref} className="gg-secret-canvas" aria-hidden="true" />;
}

/* ------------------------------------------------------ clock + counter -- */

export function ClockOverlay() {
  const [now, setNow] = useState<{ h: string; m: string; s: string } | null>(null);
  useEffect(() => {
    const pad = (value: number) => String(value).padStart(2, '0');
    const read = () => {
      const at = new Date();
      setNow({ h: pad(at.getHours()), m: pad(at.getMinutes()), s: pad(at.getSeconds()) });
    };
    read();
    const timer = window.setInterval(read, 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Render only after mount: the server would show a different time than the
  // visitor's own clock, and React would warn.
  if (!now) return null;
  return (
    <div className="gg-warp-clock-overlay" role="timer" aria-label="The time">
      {now.h}:{now.m}
      <span>:{now.s}</span>
    </div>
  );
}

const HITS_KEY = 'gg_warp_hits';

export function HitCounter() {
  const [hits, setHits] = useState<number | null>(null);
  useEffect(() => {
    try {
      const next = (Number(localStorage.getItem(HITS_KEY)) || 0) + 1;
      localStorage.setItem(HITS_KEY, String(next));
      setHits(next);
    } catch {
      setHits(0);
    }
  }, []);
  if (hits === null) return null;
  return (
    <div className="gg-warp-counter-overlay" role="status" aria-label="Visitor counter">
      <span>VISITORS</span>
      <strong>{String(Math.min(hits, 999999)).padStart(6, '0')}</strong>
    </div>
  );
}
