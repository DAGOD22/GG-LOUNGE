// GG Lounge custom cursor presets — v4 "next tier".
// 24 presets: 14 upgraded originals + 10 new (incl. frame-authored pixel
// sprite sequences). Every preset is a stateful animation system: particles,
// soft-body springs, verlet chains, feedback buffers, pixel frame machines.
// Shared contextual layer: magnetic element highlight, eased I-beam, media
// brackets, grab arrows, disabled slash. A separate WebGL afterglow layer
// (AfterglowLayer) adds GPU temporal motion blur on top of everything.

export type HoverState = "default" | "link" | "text" | "media" | "grab" | "disabled";

export interface CursorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CursorFrame {
  x: number;
  y: number;
  rx: number;
  ry: number;
  vx: number;
  vy: number;
  speed: number;
  t: number;
  dt: number;
  hover: HoverState;
  hoverAmt: number;
  pressAmt: number;
  click: boolean;
  scale: number;
  reduced: boolean;
  vw: number;
  vh: number;
  rect: CursorRect | null;
}

export interface CursorInstance {
  draw: (ctx: CanvasRenderingContext2D, f: CursorFrame) => void;
}

export type CursorPack = "gaming" | "typing" | "creative" | "classic";

export const CURSOR_PACKS: { id: "all" | CursorPack; name: string }[] = [
  { id: "all", name: "All" },
  { id: "gaming", name: "Gaming" },
  { id: "typing", name: "Typing" },
  { id: "creative", name: "Creative" },
  { id: "classic", name: "Classic" },
];

export interface CursorPreset {
  id: string;
  name: string;
  packs: CursorPack[];
  accent: string;
  trailColor?: string;
  trailDefault?: boolean;
  create: () => CursorInstance;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const LIME = "#d7f34a";
const CORAL = "#ff6c83";
const VIOLET = "#7d6bff";
const WHITE = "#f4f2ec";
const ICE = "#7ddcff";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function easeOutCubic(a: number): number {
  const k = clamp(a, 0, 1);
  return 1 - Math.pow(1 - k, 3);
}
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.4, r), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  lw = 1.5,
  alpha = 1,
) {
  if (r <= 0.2) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.globalAlpha = alpha;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function glowDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  blur: number,
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  dot(ctx, x, y, r, color);
  ctx.restore();
}
function seg(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lw = 1.5,
  alpha = 1,
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function noise1(seed: number): number {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
  swirl?: number;
}

function stepParticles(list: Particle[], dt: number) {
  const k = dt / 16.67;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    if (p.swirl) {
      const a = p.swirl * k * 0.08;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const nvx = p.vx * c - p.vy * sn;
      p.vy = p.vx * sn + p.vy * c;
      p.vx = nvx;
    }
    p.x += p.vx * k;
    p.y += p.vy * k;
    p.vy += p.grav * k;
    p.vx *= 0.985;
    p.vy *= 0.985;
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[], glow = 6) {
  for (const p of list) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = glow;
    dot(ctx, p.x, p.y, Math.max(0.3, p.size * a), p.color);
    ctx.restore();
  }
}

function burst(
  list: Particle[],
  x: number,
  y: number,
  n: number,
  colors: string[],
  speed: number,
  s: number,
  grav = 0.02,
) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const sp = speed * (0.6 + Math.random() * 0.7);
    list.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 380 + Math.random() * 320,
      max: 700,
      size: (1.2 + Math.random() * 1.6) * s,
      color: colors[i % colors.length],
      grav,
    });
  }
}

/* ------------------------------------------------------------------ */
/* contextual overlays (shared, eased)                                 */
/* ------------------------------------------------------------------ */

export function drawContextOverlays(ctx: CanvasRenderingContext2D, f: CursorFrame) {
  const s = f.scale;
  const a = f.hoverAmt;

  if (f.hover === "text" && a > 0.02) {
    const blink = !f.reduced && f.speed < 0.4 ? (Math.floor(f.t * 1.7) % 2 === 0 ? 1 : 0.4) : 1;
    const h = 11 * s * easeOutCubic(Math.min(1, a * 1.4));
    ctx.globalAlpha = a * blink;
    seg(ctx, f.x, f.y - h, f.x, f.y + h, WHITE, 1.7 * s);
    const cap = 4 * s * a;
    seg(ctx, f.x - cap, f.y - h, f.x + cap, f.y - h, WHITE, 1.7 * s);
    seg(ctx, f.x - cap, f.y + h, f.x + cap, f.y + h, WHITE, 1.7 * s);
    ctx.globalAlpha = 1;
  }

  if (f.hover === "disabled" && a > 0.02) {
    const r = 8.5 * s;
    const circ = clamp(a * 1.6, 0, 1);
    const slash = clamp(a * 1.6 - 0.6, 0, 1);
    ctx.strokeStyle = CORAL;
    ctx.lineWidth = 1.6 * s;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, -Math.PI / 2, -Math.PI / 2 + circ * Math.PI * 2);
    ctx.stroke();
    if (slash > 0) {
      const d = r * Math.SQRT1_2;
      seg(ctx, f.x - d, f.y - d, f.x - d + 2 * d * slash, f.y - d + 2 * d * slash, CORAL, 1.6 * s);
    }
    ctx.globalAlpha = 1;
  }

  if (f.hover === "media" && a > 0.02) {
    const ea = easeOutCubic(a);
    const breathe = f.reduced ? 0 : Math.sin(f.t * 3.2) * 1.5;
    const b = (11 + 4 * (1 - ea) + breathe) * s;
    const arm = 6.5 * s;
    ctx.globalAlpha = a * 0.95;
    ctx.strokeStyle = LIME;
    ctx.lineWidth = 1.8 * s;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(f.x + sx * b, f.y + sy * b - sy * arm);
      ctx.lineTo(f.x + sx * b, f.y + sy * b);
      ctx.lineTo(f.x + sx * b - sx * arm, f.y + sy * b);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (f.hover === "grab" && a > 0.02) {
    const dist = lerp(11, 5.5, f.pressAmt) * lerp(0.6, 1, easeOutCubic(a)) * s;
    const size = 3.4 * s;
    ctx.globalAlpha = a;
    ctx.fillStyle = LIME;
    for (let i = 0; i < 4; i++) {
      const ang = (Math.PI / 2) * i + (f.reduced ? 0 : Math.sin(f.t * 2.4) * 0.06);
      const cx = f.x + Math.cos(ang) * dist;
      const cy = f.y + Math.sin(ang) * dist;
      const tip = f.pressAmt > 0.5 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * size * tip, cy + Math.sin(ang) * size * tip);
      ctx.lineTo(cx + Math.cos(ang + 2.3) * size, cy + Math.sin(ang + 2.3) * size);
      ctx.lineTo(cx + Math.cos(ang - 2.3) * size, cy + Math.sin(ang - 2.3) * size);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export function drawElementHighlight(
  ctx: CanvasRenderingContext2D,
  f: CursorFrame,
  animRect: CursorRect | null,
) {
  if (!animRect || f.hoverAmt < 0.02) return;
  if (f.hover !== "link" && f.hover !== "media") return;
  const pad = 4;
  const x = animRect.x - pad;
  const y = animRect.y - pad;
  const w = animRect.w + pad * 2;
  const h = animRect.h + pad * 2;
  const r = Math.min(10, h / 2);
  const a = f.hoverAmt * 0.85;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = LIME;
  ctx.lineWidth = 1.4;
  ctx.shadowColor = LIME;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
  if (!f.reduced) {
    const p = (f.t * 0.35) % 1;
    dot(ctx, x + p * w, y, 1.8, WHITE);
  }
  ctx.restore();
}

export function drawTrailRibbon(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  color: string,
  scale: number,
) {
  if (pts.length < 3) return;
  for (let i = 0; i < pts.length - 2; i++) {
    const k = i / pts.length;
    const w = (3.4 * (1 - k) + 0.4) * scale;
    const alpha = (1 - k) * 0.5;
    if (alpha < 0.02) continue;
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/* pixel sprite frame machine (hand-authored frames)                   */
/* ------------------------------------------------------------------ */

interface PixelFrames {
  w: number;
  frames: string[][]; // frames of row-strings; chars: X fill, o outline, . empty
}

function drawPixelFrames(
  ctx: CanvasRenderingContext2D,
  spec: PixelFrames,
  frame: number,
  x: number,
  y: number,
  px: number,
  fill: string,
  outline: string | null,
) {
  const rows = spec.frames[frame % spec.frames.length];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.imageSmoothingEnabled = false;
  for (let ry = 0; ry < rows.length; ry++) {
    for (let rx = 0; rx < rows[ry].length; rx++) {
      const ch = rows[ry][rx];
      if (ch === ".") continue;
      ctx.fillStyle = ch === "o" ? outline ?? fill : fill;
      ctx.fillRect(rx * px, ry * px, px + 0.5, px + 0.5);
    }
  }
  ctx.restore();
}

/* pointing hand: 0 idle, 1 point, 2 click — authored frames */
const HAND: PixelFrames = {
  w: 12,
  frames: [
    [
      "....oo......",
      "....oXo.....",
      "....oXo.....",
      "....oXooo.o.",
      "....oXXXXoXo",
      ".oo.oXXXXXXo",
      ".oXooXXXXXXo",
      ".oXXXXXXXXo.",
      "..oXXXXXXo..",
      "...oooooo...",
    ],
    [
      "....oo......",
      "....oXo.....",
      "....oXo.....",
      "....oXo.....",
      "....oXooo...",
      ".oo.oXXXXoo.",
      ".oXooXXXXXo.",
      ".oXXXXXXXo..",
      "..oXXXXXo...",
      "...ooooo....",
    ],
    [
      "...........",
      "...........",
      "....ooo.....",
      "....oXoo....",
      ".oo.oXXXoo..",
      ".oXooXXXXo..",
      ".oXXXXXXo...",
      "..oXXXXo....",
      "...oooo.....",
      "...........",
    ],
  ],
};

/* classic arrow with 4-frame press squash — authored frames */
const ARROW: PixelFrames = {
  w: 10,
  frames: [
    [
      "o.........",
      "oo........",
      "oXo.......",
      "oXXo......",
      "oXXXo.....",
      "oXXXXo....",
      "oXXXXXo...",
      "oXXXXXXo..",
      "oXXXooXXo.",
      "oXXo..oXXo",
      "oXo....oXo",
      "oo......oo",
    ],
    [
      "o.........",
      "oo........",
      "oXo.......",
      "oXXo......",
      "oXXXo.....",
      "oXXXXo....",
      "oXXXXXo...",
      "oXXXXXXo..",
      "oXXXooXXo.",
      "oXXo..oXXo",
      "oXo....oXo",
      "oo......oo",
    ],
    [
      "..........",
      "o.........",
      "oo........",
      "oXo.......",
      "oXXo......",
      "oXXXo.....",
      "oXXXXo....",
      "oXXXXXo...",
      "oXXXooXXo.",
      "oXXo..oXXo",
      "oo......oo",
      "..........",
    ],
    [
      "..........",
      "..........",
      "o.........",
      "oo........",
      "oXo.......",
      "oXXo......",
      "oXXXo.....",
      "oXXXXo....",
      "oXXXooXXo.",
      "oXXo..oXXo",
      "oo......oo",
      "..........",
    ],
  ],
};

/* ------------------------------------------------------------------ */
/* the 24 presets                                                      */
/* ------------------------------------------------------------------ */

/** 1. Lounge Jelly — soft-body ring, gradient stroke, ripple + breathing */
function createLounge(): CursorInstance {
  const N = 16;
  const verts = new Array<number>(N).fill(0);
  const vvel = new Array<number>(N).fill(0);
  let ripple = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const base = lerp(13, 20, link) * lerp(1, 0.7, f.pressAmt) * s;
      if (f.click) {
        ripple = 1;
        for (let i = 0; i < N; i++) vvel[i] += 2.4 * s;
      }
      ripple = Math.max(0, ripple - f.dt / 420);
      const k = f.reduced ? 0.5 : 0.16;
      for (let i = 0; i < N; i++) {
        const prev = verts[(i - 1 + N) % N];
        const next = verts[(i + 1) % N];
        const acc = -verts[i] * k + (prev + next - 2 * verts[i]) * 0.12 - vvel[i] * 0.14;
        vvel[i] += acc * (f.dt / 16.67);
        vvel[i] *= 0.9;
      }
      for (let i = 0; i < N; i++) verts[i] += vvel[i] * (f.dt / 16.67);
      const ang = Math.atan2(f.vy, f.vx);
      const squish = clamp(f.speed * 0.012, 0, 0.28);
      ctx.save();
      ctx.translate(f.rx, f.ry);
      ctx.rotate(ang);
      ctx.scale(1 + squish, 1 - squish);
      ctx.rotate(-ang);
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const idx = i % N;
        const a = (idx / N) * Math.PI * 2;
        const breathe = f.reduced ? 0 : Math.sin(f.t * 2.1 + a * 2) * 0.7 * s;
        const r = base + verts[idx] + breathe + ripple * 6 * s;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(-base, -base, base, base);
      g.addColorStop(0, LIME);
      g.addColorStop(0.55, "#eaff7a");
      g.addColorStop(1, "#9fd43a");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.8 * s;
      ctx.shadowColor = LIME;
      ctx.shadowBlur = 10 * s;
      ctx.stroke();
      ctx.restore();
      if (ripple > 0) ring(ctx, f.rx, f.ry, base + (1 - ripple) * 26 * s, LIME, 1.2 * s, ripple * 0.5);
      glowDot(ctx, f.x, f.y, lerp(3.2, 4.4, link) * s, WHITE, 9 * s);
      dot(ctx, f.x - 1 * s, f.y - 1 * s, 1.1 * s, "rgba(255,255,255,0.9)");
    },
  };
}

/** 2. Comet — swirling spark emitter, head flare by speed, click burst */
function createComet(): CursorInstance {
  const parts: Particle[] = [];
  let acc = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (!f.reduced) {
        acc += f.dt * (0.06 + f.speed * 0.02);
        while (acc > 1) {
          acc -= 1;
          const a = Math.atan2(f.vy, f.vx) + Math.PI + (Math.random() - 0.5) * 1.4;
          const sp = 0.6 + Math.random() * 1.6 + f.speed * 0.06;
          parts.push({
            x: f.x,
            y: f.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 420 + Math.random() * 380,
            max: 800,
            size: (1.2 + Math.random() * 1.8) * s,
            color: Math.random() > 0.75 ? CORAL : Math.random() > 0.4 ? LIME : WHITE,
            grav: 0.012,
            swirl: Math.random() > 0.5 ? 1 : -1,
          });
        }
        if (f.click) burst(parts, f.x, f.y, 14, [LIME, CORAL], 2.6, s);
      }
      stepParticles(parts, f.dt);
      if (parts.length > 220) parts.splice(0, parts.length - 220);
      drawParticles(ctx, parts, 8 * s);
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const flare = clamp(f.speed * 0.15, 0, 5) * s;
      glowDot(ctx, f.x, f.y, lerp(3.4, 4.6, link) * s + flare * 0.3, "#fffbe0", 16 * s + flare);
      ring(ctx, f.x, f.y, 7 * s, LIME, 1 * s, 0.35 + link * 0.4);
    },
  };
}

/** 3. Lime Blob — harmonic jelly with click squash spring + rim light */
function createJelly(): CursorInstance {
  let squash = 0;
  let squashV = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.click) squashV += 3.2;
      squashV += -squash * 0.22 * (f.dt / 16.67) - squashV * 0.16;
      squash += squashV * (f.dt / 16.67);
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const r = lerp(6.5, 10.5, link) * lerp(1, 0.72, f.pressAmt) * s * (1 + squash * 0.08);
      const ang = Math.atan2(f.vy, f.vx);
      const squish = clamp(f.speed * 0.016, 0, 0.4) + Math.abs(squash) * 0.03;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(ang);
      ctx.scale(1 + squish, 1 - squish);
      ctx.rotate(-ang);
      ctx.beginPath();
      const STEPS = 40;
      for (let i = 0; i <= STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2;
        const w1 = f.reduced ? 0 : Math.sin(a * 3 + f.t * 5.2) * 0.9 * s;
        const w2 = f.reduced ? 0 : Math.sin(a * 5 - f.t * 3.7) * 0.55 * s;
        const rr = r + w1 + w2;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
      g.addColorStop(0, "rgba(215,243,74,0.95)");
      g.addColorStop(0.7, "rgba(215,243,74,0.55)");
      g.addColorStop(1, "rgba(215,243,74,0.12)");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(244,242,236,0.75)";
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      ctx.restore();
      dot(ctx, f.x - r * 0.3, f.y - r * 0.35, r * 0.22, "rgba(255,255,255,0.9)");
    },
  };
}

/** 4. Neon Snake — verlet chain, coil-tighten on press, glowing head */
function createSnake(): CursorInstance {
  const N = 12;
  const pts = Array.from({ length: N }, () => ({ x: 0, y: 0, px: 0, py: 0 }));
  let init = false;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (!init) {
        for (const p of pts) {
          p.x = p.px = f.x;
          p.y = p.py = f.y;
        }
        init = true;
      }
      pts[0].x = f.x;
      pts[0].y = f.y;
      const k = f.dt / 16.67;
      const rest = 4.6 * s * lerp(1, 0.6, f.pressAmt);
      for (let i = 1; i < N; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.82;
        const vy = (p.y - p.py) * 0.82;
        p.px = p.x;
        p.py = p.y;
        p.x += vx * k;
        p.y += vy * k;
        const q = pts[i - 1];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - rest) / d;
        p.x -= dx * diff;
        p.y -= dy * diff;
      }
      ctx.save();
      ctx.shadowColor = LIME;
      ctx.shadowBlur = 6 * s;
      for (let i = N - 1; i >= 1; i--) {
        const k2 = i / N;
        const w = (4.6 * (1 - k2) + 0.6) * s;
        const color = k2 < 0.5 ? LIME : k2 < 0.8 ? "#9de05a" : CORAL;
        seg(ctx, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, color, w, 0.85 * (1 - k2 * 0.7));
      }
      ctx.restore();
      const link = f.hover === "link" ? f.hoverAmt : 0;
      glowDot(ctx, f.x, f.y, lerp(4, 5.4, link) * s, LIME, 10 * s);
      const ha = Math.atan2(f.vy, f.vx);
      const ex = Math.cos(ha);
      const ey = Math.sin(ha);
      dot(ctx, f.x + ex * 1.8 * s - ey * 1.6 * s, f.y + ey * 1.8 * s + ex * 1.6 * s, 0.9 * s, "#0b0d12");
      dot(ctx, f.x + ex * 1.8 * s + ey * 1.6 * s, f.y + ey * 1.8 * s - ex * 1.6 * s, 0.9 * s, "#0b0d12");
      if (link > 0.4 && !f.reduced && Math.sin(f.t * 6) > 0.6) {
        seg(ctx, f.x + ex * 4 * s, f.y + ey * 4 * s, f.x + ex * 7 * s, f.y + ey * 7 * s, CORAL, 1 * s, link);
      }
    },
  };
}

/** 5. Halo — triple counter-rotating rings, breathing core, click burst */
function createHalo(): CursorInstance {
  const parts: Particle[] = [];
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const spin = f.reduced ? 0 : f.t;
      const r1 = lerp(12, 19, link) * lerp(1, 0.7, f.pressAmt) * s;
      ctx.save();
      ctx.translate(f.rx, f.ry);
      ctx.rotate(spin * 1.1);
      ctx.setLineDash([6 * s, 7 * s]);
      ring(ctx, 0, 0, r1, VIOLET, 1.8 * s, 0.95);
      ctx.rotate(-spin * 2.4);
      ctx.setLineDash([3 * s, 9 * s]);
      ring(ctx, 0, 0, r1 * 1.45, LIME, 1.2 * s, 0.6);
      ctx.rotate(spin * 3.6);
      ctx.setLineDash([1.5 * s, 6 * s]);
      ring(ctx, 0, 0, r1 * 0.6, CORAL, 1 * s, 0.5);
      ctx.setLineDash([]);
      ctx.restore();
      const breathe = f.reduced ? 0 : Math.sin(f.t * 2.6) * 0.7;
      glowDot(ctx, f.x, f.y, (3 + breathe * 0.5) * s, WHITE, 12 * s);
      if (f.click && !f.reduced) burst(parts, f.x, f.y, 10, [VIOLET, LIME], 2.2, s, 0);
      stepParticles(parts, f.dt);
      drawParticles(ctx, parts, 7 * s);
    },
  };
}

/** 6. Pixel Pop — authored arrow sprite, bob, squash, pixel sparkles */
function createPixel(): CursorInstance {
  const parts: Particle[] = [];
  return {
    draw(ctx, f) {
      const s = f.scale;
      const px = 2.1 * s;
      const bob = f.reduced || f.speed > 0.6 ? 0 : Math.round(Math.sin(f.t * 3)) * px * 0.5;
      const frame = f.pressAmt > 0.4 ? 2 + (Math.floor(f.t * 14) % 2) : 0;
      drawPixelFrames(ctx, ARROW, frame, f.x, f.y + bob, px * lerp(1, 0.9, f.pressAmt), WHITE, "rgba(11,13,18,0.7)");
      if (f.click && !f.reduced) {
        for (let i = 0; i < 8; i++) {
          parts.push({
            x: f.x + (Math.random() - 0.5) * 10 * s,
            y: f.y + (Math.random() - 0.5) * 10 * s,
            vx: (Math.random() - 0.5) * 3,
            vy: -Math.random() * 2.4,
            life: 380,
            max: 380,
            size: 1.6 * s,
            color: i % 3 === 0 ? CORAL : i % 3 === 1 ? LIME : WHITE,
            grav: 0.09,
          });
        }
      }
      stepParticles(parts, f.dt);
      for (const p of parts) {
        const a = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        const sz = Math.max(1, p.size * a * 2);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), sz, sz);
      }
      ctx.globalAlpha = 1;
      if (f.hover === "link" && f.hoverAmt > 0.1) {
        ring(ctx, f.x + 4 * s, f.y + 6 * s, lerp(2, 14, f.hoverAmt) * s, LIME, 1.4 * s, f.hoverAmt * 0.7);
      }
    },
  };
}

/** 7. Glitch — RGB split, teleport micro-jumps, click slice-storm */
function createGlitch(): CursorInstance {
  let jx = 0;
  let jy = 0;
  let next = 0;
  let sliceY = 0;
  let sliceOn = 0;
  let slices = 1;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.t > next && !f.reduced) {
        next = f.t + 0.06 + Math.random() * 0.12;
        jx = (Math.random() - 0.5) * 3.4 * s;
        jy = (Math.random() - 0.5) * 2.2 * s;
        if (Math.random() > 0.86) {
          jx *= 2.4;
          jy *= 2.4;
        }
        if (Math.random() > 0.72) {
          sliceOn = 0.12;
          sliceY = (Math.random() - 0.5) * 22 * s;
        }
      }
      if (f.click) {
        sliceOn = 0.3;
        slices = 3;
      }
      sliceOn = Math.max(0, sliceOn - f.dt / 1000);
      const arrow = (ox: number, oy: number, color: string, alpha: number) => {
        ctx.save();
        ctx.translate(f.x + ox, f.y + oy);
        ctx.scale(s * lerp(1, 0.92, f.pressAmt), s * lerp(1, 0.92, f.pressAmt));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 17.5);
        ctx.lineTo(4.4, 13.6);
        ctx.lineTo(7.3, 20.2);
        ctx.lineTo(10.4, 18.9);
        ctx.lineTo(7.5, 12.4);
        ctx.lineTo(12.8, 12.1);
        ctx.closePath();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      };
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      arrow(-1.6 * s + jx * 0.4, jy * 0.4, "rgba(255,60,90,0.8)", 0.75);
      arrow(1.6 * s - jx * 0.4, -jy * 0.4, "rgba(60,220,255,0.8)", 0.75);
      ctx.restore();
      arrow(jx, jy, WHITE, 0.96);
      if (sliceOn > 0) {
        for (let i = 0; i < slices; i++) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(f.x - 14 * s, f.y + sliceY + i * 5 * s, 30 * s, 3 * s);
          ctx.clip();
          arrow(jx + (4 + i * 2) * s, jy, i === 1 ? CORAL : LIME, 0.8);
          ctx.restore();
        }
      }
      if (sliceOn <= 0.01) slices = 1;
      if (f.hover === "link" && f.hoverAmt > 0.1) {
        ctx.globalAlpha = f.hoverAmt * (0.5 + 0.5 * Math.abs(Math.sin(f.t * 9)));
        seg(ctx, f.x - 10 * s, f.y + 24 * s, f.x + 14 * s, f.y + 24 * s, LIME, 1.4 * s);
        ctx.globalAlpha = 1;
      }
    },
  };
}

/** 8. Orbit — tilted elliptical moon, click boost, shooting stars */
function createOrbit(): CursorInstance {
  const parts: Particle[] = [];
  let nextStar = 2;
  let boost = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.click) boost = 1;
      boost = Math.max(0, boost - f.dt / 700);
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const r = lerp(11, 18, link) * lerp(1, 0.65, f.pressAmt) * s;
      const tilt = -0.4 + (f.reduced ? 0 : Math.sin(f.t * 0.7) * 0.12);
      ctx.save();
      ctx.translate(f.rx, f.ry);
      ctx.rotate(tilt);
      ctx.scale(1, 0.42);
      ring(ctx, 0, 0, r * 1.5, "rgba(125,107,255,0.4)", 1 * s, 1);
      ctx.restore();
      ring(ctx, f.rx, f.ry, r, "rgba(215,243,74,0.25)", 1 * s, 1);
      if (!f.reduced) {
        const sp = 2.2 + boost * 6;
        const a1 = f.t * sp;
        const a2 = -f.t * (sp * 0.64) + 2;
        glowDot(ctx, f.rx + Math.cos(a1) * r, f.ry + Math.sin(a1) * r, 2.4 * s, LIME, 8 * s);
        glowDot(ctx, f.rx + Math.cos(a2) * r * 1.5, f.ry + Math.sin(a2) * r * 1.5 * 0.42, 2 * s, VIOLET, 8 * s);
        nextStar -= f.dt / 1000;
        if (nextStar <= 0) {
          nextStar = 2.4 + Math.random() * 2.6;
          const a = Math.random() * Math.PI * 2;
          parts.push({
            x: f.rx + Math.cos(a) * r * 2.2,
            y: f.ry + Math.sin(a) * r * 2.2,
            vx: -Math.cos(a) * 3.4,
            vy: -Math.sin(a) * 3.4,
            life: 460,
            max: 460,
            size: 1.4 * s,
            color: WHITE,
            grav: 0,
          });
        }
      }
      stepParticles(parts, f.dt);
      for (const p of parts) {
        const a = clamp(p.life / p.max, 0, 1);
        seg(ctx, p.x, p.y, p.x - p.vx * 3, p.y - p.vy * 3, WHITE, 1.2 * s, a * 0.8);
      }
      const g = ctx.createRadialGradient(f.x - 1.5 * s, f.y - 1.5 * s, 0.5, f.x, f.y, 4.4 * s);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.6, CORAL);
      g.addColorStop(1, "rgba(255,108,131,0.25)");
      ctx.beginPath();
      ctx.arc(f.x, f.y, lerp(3.4, 4.4, link) * s, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    },
  };
}

/** 9. Spray Paint — persistent fading buffer, hue-cycling ink, splat */
function createSpray(): CursorInstance {
  let layer: HTMLCanvasElement | null = null;
  let lctx: CanvasRenderingContext2D | null = null;
  let vw = 0;
  let vh = 0;
  let lastX = -1;
  let lastY = -1;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (!layer || vw !== f.vw || vh !== f.vh) {
        vw = f.vw;
        vh = f.vh;
        layer = document.createElement("canvas");
        layer.width = Math.max(1, Math.floor(vw));
        layer.height = Math.max(1, Math.floor(vh));
        lctx = layer.getContext("2d");
        lastX = lastY = -1;
      }
      const g = lctx;
      if (g && layer) {
        g.globalCompositeOperation = "destination-out";
        g.fillStyle = `rgba(0,0,0,${f.reduced ? 0.06 : 0.028 * (f.dt / 16.67)})`;
        g.fillRect(0, 0, vw, vh);
        g.globalCompositeOperation = "source-over";
        if (!f.reduced && lastX >= 0) {
          const d = Math.hypot(f.x - lastX, f.y - lastY);
          const steps = Math.min(8, Math.floor(d / 2));
          const hue = (f.t * 40) % 360;
          for (let i = 0; i <= steps; i++) {
            const px = lerp(lastX, f.x, i / Math.max(1, steps));
            const py = lerp(lastY, f.y, i / Math.max(1, steps));
            for (let k = 0; k < 3; k++) {
              const a = Math.random() * Math.PI * 2;
              const rr = Math.random() * 5 * s;
              g.globalAlpha = 0.16 + Math.random() * 0.2;
              g.fillStyle = k === 2 ? `hsl(${(hue + 140) % 360},90%,66%)` : `hsl(${hue},90%,64%)`;
              g.beginPath();
              g.arc(px + Math.cos(a) * rr, py + Math.sin(a) * rr, (0.6 + Math.random() * 1.3) * s, 0, Math.PI * 2);
              g.fill();
            }
          }
          g.globalAlpha = 1;
        }
        if (f.click && g) {
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2;
            const rr = Math.random() * 14 * s;
            g.globalAlpha = 0.3 + Math.random() * 0.3;
            g.fillStyle = Math.random() > 0.5 ? LIME : CORAL;
            g.beginPath();
            g.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, (0.8 + Math.random() * 2.2) * s, 0, Math.PI * 2);
            g.fill();
          }
          g.globalAlpha = 1;
        }
        lastX = f.x;
        lastY = f.y;
        ctx.drawImage(layer, 0, 0, vw, vh);
      }
      const link = f.hover === "link" ? f.hoverAmt : 0;
      glowDot(ctx, f.x, f.y, lerp(2.8, 4, link) * s, LIME, 10 * s);
      ring(ctx, f.x, f.y, 6.5 * s * lerp(1, 1.4, link), "rgba(244,242,236,0.5)", 1 * s, 0.8);
    },
  };
}

/** 10. Magnet — field lines, click pulse wave, denser field on hover */
function createMagnet(): CursorInstance {
  let pulse = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.click) pulse = 1;
      pulse = Math.max(0, pulse - f.dt / 500);
      const hasRect = f.rect && (f.hover === "link" || f.hover === "media");
      const cx = hasRect ? f.rect!.x + f.rect!.w / 2 : f.x;
      const cy = hasRect ? f.rect!.y + f.rect!.h / 2 : f.y;
      const pull = hasRect ? f.hoverAmt : 0;
      const lines = 5 + Math.round(pull * 2);
      for (let i = 0; i < lines; i++) {
        const ph = (i / lines) * Math.PI * 2 + (f.reduced ? 0 : f.t * 1.6);
        const len = lerp(9, 20, pull) * s;
        const x1 = f.x + Math.cos(ph) * 6 * s;
        const y1 = f.y + Math.sin(ph) * 6 * s;
        const tx = lerp(f.x + Math.cos(ph) * len, cx, pull * 0.55);
        const ty = lerp(f.y + Math.sin(ph) * len, cy, pull * 0.55);
        const mx = (x1 + tx) / 2 + Math.cos(ph + Math.PI / 2) * 4 * s;
        const my = (y1 + ty) / 2 + Math.sin(ph + Math.PI / 2) * 4 * s;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, tx, ty);
        ctx.strokeStyle = i % 2 ? LIME : VIOLET;
        ctx.lineWidth = 1.2 * s;
        ctx.globalAlpha = 0.55 + pull * 0.35;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (pulse > 0) ring(ctx, f.x, f.y, (1 - pulse) * 30 * s, ICE, 1.4 * s, pulse * 0.6);
      const squish = lerp(1, 0.75, f.pressAmt);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(squish, 2 - squish);
      glowDot(ctx, 0, 0, 3.2 * s, WHITE, 10 * s);
      ctx.restore();
      if (pull > 0.05) ring(ctx, f.rx, f.ry, lerp(4, 13, pull) * s, LIME, 1.3 * s, pull * 0.7);
    },
  };
}

/** 11. Sonar — double pings, radar sweep, range circle, coral click */
function createSonar(): CursorInstance {
  const rings: { r: number; a: number; color: string }[] = [];
  let dist = 0;
  let lastX = 0;
  let lastY = 0;
  let primed = false;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (!primed) {
        primed = true;
        lastX = f.x;
        lastY = f.y;
      }
      dist += Math.hypot(f.x - lastX, f.y - lastY);
      lastX = f.x;
      lastY = f.y;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const threshold = lerp(46, 22, link) * s;
      if (!f.reduced && dist > threshold) {
        dist = 0;
        rings.push({ r: 4 * s, a: 0.7, color: link > 0.4 ? LIME : "rgba(244,242,236,0.9)" });
        rings.push({ r: 2 * s, a: 0.4, color: "rgba(125,220,255,0.8)" });
      }
      if (f.click) rings.push({ r: 3 * s, a: 0.95, color: CORAL });
      const k = f.dt / 16.67;
      for (let i = rings.length - 1; i >= 0; i--) {
        const r0 = rings[i];
        r0.r += (1.1 + r0.r * 0.06) * k * s;
        r0.a -= 0.016 * k;
        if (r0.a <= 0) {
          rings.splice(i, 1);
          continue;
        }
        ring(ctx, f.x, f.y, r0.r, r0.color, 1.3 * s, r0.a);
      }
      ring(ctx, f.x, f.y, 26 * s, "rgba(215,243,74,0.12)", 1 * s, 1);
      if (!f.reduced) {
        const a = f.t * 2.4;
        seg(ctx, f.x, f.y, f.x + Math.cos(a) * 12 * s, f.y + Math.sin(a) * 12 * s, LIME, 1.2 * s, 0.5);
      }
      dot(ctx, f.x, f.y, lerp(2.6, 3.6, link) * s, WHITE);
    },
  };
}

/** 12. Ember — flame particles, heat shimmer waves, click flare */
function createEmber(): CursorInstance {
  const parts: Particle[] = [];
  let acc = 0;
  let flare = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.click) flare = 1;
      flare = Math.max(0, flare - f.dt / 400);
      if (!f.reduced) {
        acc += f.dt * (0.09 + flare * 0.2);
        while (acc > 1) {
          acc -= 1;
          parts.push({
            x: f.x + (Math.random() - 0.5) * 5 * s,
            y: f.y + (Math.random() - 0.5) * 3 * s,
            vx: (Math.random() - 0.5) * 0.7 - f.vx * 0.06,
            vy: -0.9 - Math.random() * 1.4,
            life: 500 + Math.random() * 400,
            max: 900,
            size: (1.4 + Math.random() * 1.8) * s,
            color: Math.random() > 0.6 ? "#ffb35c" : Math.random() > 0.35 ? CORAL : LIME,
            grav: -0.008,
          });
        }
      }
      stepParticles(parts, f.dt);
      if (parts.length > 160) parts.splice(0, parts.length - 160);
      for (const p of parts) {
        const a = clamp(p.life / p.max, 0, 1);
        const flicker = 0.7 + 0.3 * Math.sin(p.life * 0.05);
        ctx.save();
        ctx.globalAlpha = a * flicker;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 9 * s;
        dot(ctx, p.x, p.y, Math.max(0.3, p.size * a), p.color);
        ctx.restore();
      }
      if (!f.reduced) {
        for (let i = 0; i < 3; i++) {
          const ph = f.t * 3 + i * 2.1;
          ctx.globalAlpha = 0.1;
          ctx.beginPath();
          for (let yy = 0; yy <= 14; yy += 2) {
            const px = f.x + Math.sin(ph + yy * 0.5) * 2.5 * s;
            const py = f.y - 6 * s - yy * s;
            yy === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.strokeStyle = "#ffd9a0";
          ctx.lineWidth = 1 * s;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, (7 + flare * 6) * s);
      g.addColorStop(0, "rgba(255,240,200,0.95)");
      g.addColorStop(0.5, "rgba(255,108,131,0.5)");
      g.addColorStop(1, "rgba(255,108,131,0)");
      ctx.beginPath();
      ctx.arc(f.x, f.y, (7 + flare * 6) * s, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      dot(ctx, f.x, f.y, 2.4 * s, "#fff3d6");
    },
  };
}

/** 13. Prism — nested diamonds, hue-shifting ghosts, click shatter */
function createPrism(): CursorInstance {
  const ghosts: { x: number; y: number; a: number; rot: number; hue: number }[] = [];
  const parts: Particle[] = [];
  let acc = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const rot = f.reduced ? 0.5 : f.t * lerp(0.9, -1.8, link);
      const r = lerp(11, 18, link) * lerp(1, 0.7, f.pressAmt) * s;
      if (f.click && !f.reduced) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          parts.push({
            x: f.x,
            y: f.y,
            vx: Math.cos(a) * 2.4,
            vy: Math.sin(a) * 2.4,
            life: 420,
            max: 420,
            size: 2 * s,
            color: i % 2 ? VIOLET : LIME,
            grav: 0,
          });
        }
      }
      if (!f.reduced && f.speed > 1.2) {
        acc += f.dt;
        if (acc > 60) {
          acc = 0;
          ghosts.push({ x: f.rx, y: f.ry, a: 0.4, rot, hue: (f.t * 60) % 360 });
        }
      }
      for (let i = ghosts.length - 1; i >= 0; i--) {
        const gh = ghosts[i];
        gh.a -= 0.012 * (f.dt / 16.67);
        if (gh.a <= 0) {
          ghosts.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(gh.x, gh.y);
        ctx.rotate(gh.rot);
        ctx.strokeStyle = `hsla(${gh.hue},85%,70%,1)`;
        ctx.globalAlpha = gh.a;
        ctx.lineWidth = 1 * s;
        ctx.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      stepParticles(parts, f.dt);
      for (const p of parts) {
        const a = clamp(p.life / p.max, 0, 1);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 0.02);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      const diamond = (rr: number, angle: number, color: string, lw: number, alpha: number) => {
        ctx.save();
        ctx.translate(f.rx, f.ry);
        ctx.rotate(angle);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.globalAlpha = alpha;
        ctx.strokeRect(-rr, -rr, rr * 2, rr * 2);
        ctx.restore();
        ctx.globalAlpha = 1;
      };
      diamond(r, rot, VIOLET, 1.7 * s, 0.95);
      diamond(r * 0.62, -rot * 1.6, LIME, 1.2 * s, 0.8);
      diamond(r * 0.3, rot * 2.4, CORAL, 1 * s, 0.7);
      glowDot(ctx, f.x, f.y, 2.4 * s, WHITE, 8 * s);
    },
  };
}

/** 14. Aurora Ribbon — hue-shifting glow ribbon, speed width pulse */
function createAurora(): CursorInstance {
  const pts: { x: number; y: number }[] = [];
  let flash = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.click) flash = 1;
      flash = Math.max(0, flash - f.dt / 300);
      if (!f.reduced) {
        pts.unshift({ x: f.x, y: f.y });
        if (pts.length > 34) pts.length = 34;
      }
      if (pts.length > 3) {
        const widthPulse = 1 + clamp(f.speed * 0.03, 0, 0.8);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (let i = 0; i < pts.length - 1; i++) {
          const k = i / pts.length;
          const hue = (f.t * 60 + i * 9) % 360;
          const color = `hsla(${hue}, 90%, 68%, ${(1 - k) * 0.5})`;
          const w = (7 * (1 - k) + 0.5) * s * widthPulse;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.shadowColor = color;
          ctx.shadowBlur = 8 * s;
          ctx.stroke();
        }
        ctx.restore();
      }
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const breathe = f.reduced ? 0 : Math.sin(f.t * 3) * 0.6;
      glowDot(ctx, f.x, f.y, (3.4 + breathe * 0.4 + link + flash * 2) * s, flash > 0.4 ? "#ffffff" : WHITE, 14 * s);
      ring(ctx, f.x, f.y, (8 + link * 6) * s, "rgba(255,255,255,0.4)", 1 * s, 0.6);
    },
  };
}

/** 15. Katana — velocity blade, sway idle, click slash arc */
function createBlade(): CursorInstance {
  let slashT = -1;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.click) slashT = f.t;
      const ang = f.speed > 0.8 ? Math.atan2(f.vy, f.vx) : Math.PI * 0.75 + (f.reduced ? 0 : Math.sin(f.t * 1.4) * 0.08);
      const len = (14 + clamp(f.speed * 1.6, 0, 26)) * s;
      const tx = f.x - Math.cos(ang) * len;
      const ty = f.y - Math.sin(ang) * len;
      const g = ctx.createLinearGradient(f.x, f.y, tx, ty);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.5, "#cfd8e3");
      g.addColorStop(1, "rgba(207,216,227,0.1)");
      ctx.save();
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.4 * s;
      ctx.lineCap = "round";
      ctx.shadowColor = ICE;
      ctx.shadowBlur = 6 * s;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();
      seg(ctx, f.x + Math.cos(ang + Math.PI / 2) * 3 * s, f.y + Math.sin(ang + Math.PI / 2) * 3 * s, f.x - Math.cos(ang + Math.PI / 2) * 3 * s, f.y - Math.sin(ang + Math.PI / 2) * 3 * s, CORAL, 2 * s, 0.9);
      if (slashT >= 0) {
        const p = (f.t - slashT) / 0.42;
        if (p <= 1) {
          const a0 = ang - 1.2 + p * 2.4;
          ctx.save();
          ctx.strokeStyle = `rgba(255,255,255,${(1 - p) * 0.9})`;
          ctx.lineWidth = (3 - p * 2) * s;
          ctx.shadowColor = LIME;
          ctx.shadowBlur = 12 * s;
          ctx.beginPath();
          ctx.arc(f.x, f.y, (16 + p * 18) * s, a0 - 0.7, a0 + 0.7);
          ctx.stroke();
          ctx.restore();
        } else slashT = -1;
      }
      glowDot(ctx, f.x, f.y, 2.6 * s, WHITE, 8 * s);
    },
  };
}

/** 16. Point Hand — authored pixel sprite frames: idle/point/click */
function createHand(): CursorInstance {
  const parts: Particle[] = [];
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const frame = f.pressAmt > 0.4 ? 2 : link > 0.5 ? 1 : 0;
      const bob = f.reduced || f.speed > 0.8 ? 0 : Math.round(Math.sin(f.t * 2.6)) * 1 * s;
      drawPixelFrames(ctx, HAND, frame, f.x - 4 * s, f.y - 3 * s + bob, 1.7 * s, WHITE, "rgba(11,13,18,0.75)");
      if (f.click && !f.reduced) burst(parts, f.x + 3 * s, f.y - 4 * s, 6, [LIME, WHITE], 1.8, s, 0.06);
      stepParticles(parts, f.dt);
      for (const p of parts) {
        const a = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.max(1, p.size * a * 1.6), Math.max(1, p.size * a * 1.6));
      }
      ctx.globalAlpha = 1;
    },
  };
}

/** 17. Butterfly — flapping wings, faster in motion, dust on hover */
function createButterfly(): CursorInstance {
  const parts: Particle[] = [];
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const flap = f.reduced ? 0.4 : Math.sin(f.t * (6 + f.speed * 0.9 + link * 4));
      const spread = lerp(0.35, 0.9, Math.abs(flap)) * lerp(1, 1.25, link);
      const wing = (side: number, color: string) => {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.scale(side, 1);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(6 * s, -10 * s * spread, 16 * s, -8 * s * spread, 13 * s, -1 * s);
        ctx.bezierCurveTo(16 * s, 5 * s * spread, 7 * s, 7 * s * spread, 0, 2 * s);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 0.8 * s;
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      };
      wing(-1, "rgba(125,107,255,0.8)");
      wing(1, "rgba(255,108,131,0.8)");
      seg(ctx, f.x, f.y - 4 * s, f.x, f.y + 4 * s, WHITE, 1.6 * s, 0.95);
      if (!f.reduced && f.speed > 1.5 && Math.random() > 0.6) {
        parts.push({
          x: f.x + (Math.random() - 0.5) * 8 * s,
          y: f.y + (Math.random() - 0.5) * 6 * s,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 0.3 + Math.random() * 0.5,
          life: 500,
          max: 500,
          size: 1.1 * s,
          color: Math.random() > 0.5 ? VIOLET : CORAL,
          grav: 0.01,
        });
      }
      stepParticles(parts, f.dt);
      drawParticles(ctx, parts, 5 * s);
    },
  };
}

/** 18. Vinyl — distance-driven spin, grooves, tonearm on press */
function createVinyl(): CursorInstance {
  let angle = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      angle += (f.speed * 0.06 + 0.02 + link * 0.08) * (f.dt / 16.67) * (f.reduced ? 0 : 1);
      const r = 11 * s * lerp(1, 1.15, link);
      ctx.save();
      ctx.translate(f.rx, f.ry);
      ctx.rotate(angle);
      dot(ctx, 0, 0, r, "#10131b");
      for (let i = 1; i <= 3; i++) ring(ctx, 0, 0, r * (0.45 + i * 0.16), "rgba(244,242,236,0.16)", 0.8 * s, 1);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 0.9, 0, 0.9);
      ctx.closePath();
      ctx.fillStyle = "rgba(215,243,74,0.14)";
      ctx.fill();
      dot(ctx, 0, 0, r * 0.34, LIME);
      dot(ctx, 0, 0, 1.1 * s, "#0b0d12");
      ctx.restore();
      if (f.pressAmt > 0.2) {
        seg(ctx, f.rx + r * 1.5, f.ry - r * 1.5, f.rx + r * 0.2, f.ry - r * 0.1, "#cfd8e3", 1.4 * s, f.pressAmt);
        dot(ctx, f.rx + r * 0.2, f.ry - r * 0.1, 1.4 * s, CORAL);
      }
      glowDot(ctx, f.x, f.y, 1.8 * s, WHITE, 6 * s);
    },
  };
}

/** 19. Gear — rotating teeth, counter-spin hub, click tooth-flash */
function createGear(): CursorInstance {
  let flash = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.click) flash = 1;
      flash = Math.max(0, flash - f.dt / 300);
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const spin = f.reduced ? 0.3 : f.t * lerp(1.1, 3.2, link);
      const r = 10 * s * lerp(1, 1.2, link);
      const teeth = 8;
      ctx.save();
      ctx.translate(f.rx, f.ry);
      ctx.rotate(spin);
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.78;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = flash > 0.3 ? WHITE : "#cfd8e3";
      ctx.lineWidth = 1.6 * s;
      ctx.shadowColor = flash > 0.3 ? LIME : "rgba(0,0,0,0)";
      ctx.shadowBlur = flash * 12 * s;
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(f.rx, f.ry);
      ctx.rotate(-spin * 1.7);
      ring(ctx, 0, 0, r * 0.45, LIME, 1.4 * s, 0.9);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        seg(ctx, Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, LIME, 1.2 * s, 0.8);
      }
      ctx.restore();
      dot(ctx, f.x, f.y, 2 * s, WHITE);
    },
  };
}

/** 20. Bubble — iridescent wobble, pop into droplets, scale-in respawn */
function createBubble(): CursorInstance {
  const parts: Particle[] = [];
  let popT = -1;
  let born = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.click && popT < 0) {
        popT = f.t;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          parts.push({
            x: f.x,
            y: f.y,
            vx: Math.cos(a) * 1.9,
            vy: Math.sin(a) * 1.9 - 0.5,
            life: 420,
            max: 420,
            size: 1.6 * s,
            color: `hsl(${i * 40},90%,75%)`,
            grav: 0.05,
          });
        }
      }
      if (popT >= 0 && f.t - popT > 0.5) {
        popT = -1;
        born = f.t;
      }
      stepParticles(parts, f.dt);
      drawParticles(ctx, parts, 6 * s);
      if (popT >= 0) return;
      const grow = easeOutCubic(clamp((f.t - born) / 0.4, 0, 1));
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const r = (10 + link * 4) * s * grow * lerp(1, 0.8, f.pressAmt);
      if (r <= 0.5) return;
      ctx.save();
      ctx.beginPath();
      const STEPS = 34;
      for (let i = 0; i <= STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2;
        const w = f.reduced ? 0 : Math.sin(a * 4 + f.t * 3.4) * 0.7 * s;
        const px = f.x + Math.cos(a) * (r + w);
        const py = f.y + Math.sin(a) * (r + w);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      const hue = (f.t * 50) % 360;
      ctx.strokeStyle = `hsla(${hue},90%,75%,0.9)`;
      ctx.lineWidth = 1.4 * s;
      ctx.shadowColor = `hsla(${hue},90%,70%,1)`;
      ctx.shadowBlur = 8 * s;
      ctx.stroke();
      ctx.fillStyle = `hsla(${hue},90%,70%,0.08)`;
      ctx.fill();
      ctx.restore();
      dot(ctx, f.x - r * 0.35, f.y - r * 0.4, r * 0.16, "rgba(255,255,255,0.85)");
    },
  };
}

/** 21. Tesla — jittering arc between dot and ring, link double-arc */
function createTesla(): CursorInstance {
  const parts: Particle[] = [];
  let seedT = 0;
  let seed = 1;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.t > seedT) {
        seedT = f.t + 0.033;
        seed = Math.random() * 100;
      }
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const arcs = 1 + (link > 0.4 ? 1 : 0);
      for (let a = 0; a < arcs; a++) {
        ctx.beginPath();
        const segs = 7;
        for (let i = 0; i <= segs; i++) {
          const k = i / segs;
          const bx = lerp(f.x, f.rx, k);
          const by = lerp(f.y, f.ry, k);
          const j = i === 0 || i === segs ? 0 : (noise1(seed + i * 3.3 + a * 17) - 0.5) * 9 * s;
          const px = bx + (a === 0 ? -j : j);
          const py = by + j * 0.6;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.strokeStyle = a === 0 ? ICE : LIME;
        ctx.lineWidth = (a === 0 ? 1.6 : 1) * s;
        ctx.shadowColor = ICE;
        ctx.shadowBlur = 8 * s;
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
      if (link > 0.3 && !f.reduced && Math.random() > 0.7) {
        parts.push({
          x: f.rx + (Math.random() - 0.5) * 8 * s,
          y: f.ry + (Math.random() - 0.5) * 8 * s,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          life: 240,
          max: 240,
          size: 1.2 * s,
          color: ICE,
          grav: 0,
        });
      }
      stepParticles(parts, f.dt);
      drawParticles(ctx, parts, 6 * s);
      glowDot(ctx, f.x, f.y, 2.8 * s, WHITE, 9 * s);
      ring(ctx, f.rx, f.ry, 4 * s, ICE, 1.2 * s, 0.8);
    },
  };
}

/** 22. Hologram — projection cone, scanline ring, chromatic strokes */
function createHolo(): CursorInstance {
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const r = lerp(10, 15, link) * s;
      const flick = f.reduced ? 0.8 : 0.65 + noise1(Math.floor(f.t * 24)) * 0.35;
      ctx.save();
      ctx.globalAlpha = 0.16 * flick;
      ctx.beginPath();
      ctx.moveTo(f.x - r * 1.5, f.y + r * 2.4);
      ctx.lineTo(f.x - r * 0.5, f.y - r);
      ctx.lineTo(f.x + r * 0.5, f.y - r);
      ctx.lineTo(f.x + r * 1.5, f.y + r * 2.4);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, f.y - r, 0, f.y + r * 2.4);
      g.addColorStop(0, ICE);
      g.addColorStop(1, "rgba(125,220,255,0)");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      const chroma = (dx: number, color: string, alpha: number) => {
        ctx.beginPath();
        ctx.arc(f.rx + dx, f.ry, r, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.3 * s;
        ctx.globalAlpha = alpha * flick;
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      chroma(-1.2 * s, "rgba(255,60,90,0.8)", 0.7);
      chroma(1.2 * s, "rgba(60,220,255,0.8)", 0.7);
      chroma(0, LIME, 0.9);
      const scan = f.reduced ? 0 : ((f.t * 0.8) % 1) * 2 - 1;
      seg(ctx, f.rx - r, f.ry + scan * r, f.rx + r, f.ry + scan * r, WHITE, 1 * s, 0.5 * flick);
      glowDot(ctx, f.x, f.y, 2.2 * s, ICE, 8 * s);
    },
  };
}

/** 23. Spinner — yin-yang commas, motion-driven spin, link separation */
function createSpinner(): CursorInstance {
  let angle = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      angle += (0.03 + f.speed * 0.02 + link * 0.05) * (f.dt / 16.67) * (f.reduced ? 0 : 1);
      const r = 9 * s;
      const sep = link * 3 * s;
      const comma = (cx: number, rot: number, color: string) => {
        ctx.save();
        ctx.translate(cx, f.ry);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI);
        ctx.arc(-r / 2, 0, r / 2, Math.PI, 0, true);
        ctx.arc(r / 2, 0, r / 2, Math.PI, 0, false);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      };
      comma(f.rx - sep, angle, WHITE);
      comma(f.rx + sep, angle + Math.PI, LIME);
      dot(ctx, f.rx - sep + Math.cos(angle) * r * 0.5, f.ry + Math.sin(angle) * r * 0.5, 1.4 * s, "#0b0d12");
      dot(ctx, f.rx + sep - Math.cos(angle) * r * 0.5, f.ry - Math.sin(angle) * r * 0.5, 1.4 * s, WHITE);
      glowDot(ctx, f.x, f.y, 2 * s, WHITE, 7 * s);
    },
  };
}

/** 24. Stardust — orbiting micro-motes that stream behind on motion */
function createStardust(): CursorInstance {
  const motes = Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2, r: 8 + (i % 3) * 4, sp: 1 + (i % 4) * 0.4 }));
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const stream = clamp(f.speed * 0.5, 0, 14) * s;
      const ang = Math.atan2(f.vy, f.vx);
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        const a = f.reduced ? m.a : m.a + f.t * m.sp;
        const rr = m.r * s * lerp(1, 1.4, link);
        let px = f.x + Math.cos(a) * rr;
        let py = f.y + Math.sin(a) * rr * 0.7;
        px -= Math.cos(ang) * stream * (i / motes.length);
        py -= Math.sin(ang) * stream * (i / motes.length);
        const tw = 0.5 + 0.5 * Math.sin(f.t * 3 + i * 2);
        glowDot(ctx, px, py, (1.2 + tw * 0.8) * s, i % 3 === 0 ? CORAL : i % 3 === 1 ? LIME : ICE, 6 * s);
      }
      glowDot(ctx, f.x, f.y, lerp(2.6, 3.6, link) * s, WHITE, 10 * s);
      ring(ctx, f.x, f.y, 5.5 * s, "rgba(244,242,236,0.35)", 1 * s, 0.7);
    },
  };
}

export const CURSOR_PRESETS: CursorPreset[] = [
  { id: "lounge", name: "Lounge Jelly", packs: ["classic", "typing", "creative"], accent: LIME, create: createLounge },
  { id: "comet", name: "Comet", packs: ["gaming"], accent: "#fff3b0", create: createComet },
  { id: "jelly", name: "Lime Blob", packs: ["typing", "creative"], accent: LIME, create: createJelly },
  { id: "snake", name: "Neon Snake", packs: ["gaming"], accent: LIME, create: createSnake },
  { id: "halo", name: "Halo", packs: ["classic", "typing"], accent: VIOLET, create: createHalo },
  { id: "pixel", name: "Pixel Pop", packs: ["classic", "gaming"], accent: WHITE, create: createPixel },
  { id: "glitch", name: "Glitch", packs: ["gaming", "creative"], accent: CORAL, create: createGlitch },
  { id: "orbit", name: "Orbit", packs: ["creative", "classic"], accent: CORAL, create: createOrbit },
  { id: "spray", name: "Spray Paint", packs: ["creative"], accent: LIME, create: createSpray },
  { id: "magnet", name: "Magnet", packs: ["typing", "creative"], accent: VIOLET, create: createMagnet },
  { id: "sonar", name: "Sonar", packs: ["gaming", "classic"], accent: LIME, create: createSonar },
  { id: "ember", name: "Ember", packs: ["gaming"], accent: CORAL, create: createEmber },
  { id: "prism", name: "Prism", packs: ["creative"], accent: VIOLET, create: createPrism },
  { id: "aurora", name: "Aurora Ribbon", packs: ["creative"], accent: "#7df3d1", create: createAurora },
  { id: "blade", name: "Katana", packs: ["gaming"], accent: ICE, create: createBlade },
  { id: "hand", name: "Point Hand", packs: ["classic", "typing"], accent: WHITE, create: createHand },
  { id: "butterfly", name: "Butterfly", packs: ["creative", "typing"], accent: VIOLET, create: createButterfly },
  { id: "vinyl", name: "Vinyl", packs: ["creative", "classic"], accent: LIME, create: createVinyl },
  { id: "gear", name: "Clockwork", packs: ["classic", "typing"], accent: "#cfd8e3", create: createGear },
  { id: "bubble", name: "Bubble", packs: ["creative"], accent: "#8ef0ff", create: createBubble },
  { id: "tesla", name: "Tesla Arc", packs: ["gaming"], accent: ICE, create: createTesla },
  { id: "holo", name: "Hologram", packs: ["gaming", "creative"], accent: ICE, create: createHolo },
  { id: "spinner", name: "Yin-Yang", packs: ["typing", "classic"], accent: LIME, create: createSpinner },
  { id: "stardust", name: "Stardust", packs: ["creative", "typing"], accent: ICE, create: createStardust },
];

export const ANIMATED_CURSOR_IDS: string[] = CURSOR_PRESETS.map((p) => p.id);

const BY_ID = new Map(CURSOR_PRESETS.map((p) => [p.id, p]));

export function getCursorPreset(id: string): CursorPreset {
  return BY_ID.get(id) ?? CURSOR_PRESETS[0];
}

/* ------------------------------------------------------------------ */
/* scene composition                                                   */
/* ------------------------------------------------------------------ */

export function drawCursorScene(
  ctx: CanvasRenderingContext2D,
  instance: CursorInstance,
  f: CursorFrame,
  trailPoints: { x: number; y: number }[] | null,
  animRect: CursorRect | null,
) {
  ctx.save();
  if (trailPoints && trailPoints.length > 2) {
    drawTrailRibbon(ctx, trailPoints, "rgba(244,242,236,0.75)", f.scale);
  }
  const dim = f.hover === "text" || f.hover === "disabled" ? 1 - 0.8 * f.hoverAmt : 1;
  ctx.globalAlpha = dim;
  instance.draw(ctx, f);
  ctx.globalAlpha = 1;
  ctx.restore();
  drawElementHighlight(ctx, f, animRect);
  drawContextOverlays(ctx, f);
}

/* ------------------------------------------------------------------ */
/* preview renderer for the customizer dialog                          */
/* ------------------------------------------------------------------ */

const PREVIEW_CYCLE: { state: HoverState; dur: number }[] = [
  { state: "default", dur: 1.3 },
  { state: "link", dur: 1.6 },
  { state: "text", dur: 1.3 },
  { state: "media", dur: 1.1 },
  { state: "grab", dur: 1.2 },
  { state: "disabled", dur: 0.9 },
];
const PREVIEW_TOTAL = PREVIEW_CYCLE.reduce((a, c) => a + c.dur, 0);

function previewPointer(w: number, h: number, t: number): { x: number; y: number } {
  return {
    x: w / 2 + Math.sin(t * 1.05) * w * 0.26,
    y: h / 2 + Math.sin(t * 1.72 + 1.2) * h * 0.24,
  };
}

export function renderCursorPreview(
  ctx: CanvasRenderingContext2D,
  instance: CursorInstance,
  w: number,
  h: number,
  tAbs: number,
  prevT: number,
) {
  const t = tAbs % 600;
  const dt = Math.min(64, (tAbs - prevT) * 1000);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fillRect(0, 0, w, h);

  let acc = t % PREVIEW_TOTAL;
  let state: HoverState = "default";
  let stateT = 0;
  for (const c of PREVIEW_CYCLE) {
    if (acc < c.dur) {
      state = c.state;
      stateT = acc;
      break;
    }
    acc -= c.dur;
  }
  const hoverAmt = Math.min(1, stateT / 0.3);
  const pressAmt =
    (state === "link" || state === "grab") && stateT > 0.8 ? clamp(Math.sin((stateT - 0.8) * 3.4), 0, 1) : 0;

  const p = previewPointer(w, h, t);
  const pPrev = previewPointer(w, h, Math.max(0, t - dt / 1000));
  const lag = previewPointer(w, h, Math.max(0, t - 0.11));
  const vx = p.x - pPrev.x;
  const vy = p.y - pPrev.y;

  let rect: CursorRect | null = null;
  if ((state === "link" || state === "media") && hoverAmt > 0.2) {
    rect = { x: w / 2 - 26, y: h / 2 - 12, w: 52, h: 24 };
  }

  drawCursorScene(
    ctx,
    instance,
    {
      x: p.x,
      y: p.y,
      rx: lag.x,
      ry: lag.y,
      vx,
      vy,
      speed: Math.hypot(vx, vy),
      t,
      dt,
      hover: state,
      hoverAmt,
      pressAmt,
      click: pressAmt > 0.9 && stateT > 0.8 && stateT < 0.86,
      scale: Math.min(1, w / 110),
      reduced: false,
      vw: w,
      vh: h,
      rect,
    },
    null,
    rect,
  );
}
