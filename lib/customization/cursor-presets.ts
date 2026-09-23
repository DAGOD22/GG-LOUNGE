// GG Lounge custom cursor presets — second generation.
// Every preset is a *stateful animation system* (particles, soft-body springs,
// verlet chains, persistent paint buffers, glitch timers), not a static shape.
// Presets are factories: create() returns an isolated instance so the live
// cursor and each panel preview animate independently.
//
// All presets also benefit from the shared contextual layer drawn by
// drawCursorScene(): magnetic rounded-rect highlight around hovered links,
// draw-on I-beam for text, pulsing media brackets, springy grab arrows and an
// animated disabled slash.

/** contextual hover states detected under the pointer */
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
  /** lagging "ring" position (slower spring) for two-part cursors */
  rx: number;
  ry: number;
  /** pointer velocity components (px/frame) */
  vx: number;
  vy: number;
  speed: number;
  t: number;
  dt: number;
  hover: HoverState;
  hoverAmt: number;
  pressAmt: number;
  /** true on the frame a press starts */
  click: boolean;
  scale: number;
  reduced: boolean;
  vw: number;
  vh: number;
  /** bounding box of the hovered interactive element, if any */
  rect: CursorRect | null;
}

export interface CursorInstance {
  draw: (ctx: CanvasRenderingContext2D, f: CursorFrame) => void;
}

export interface CursorPreset {
  id: string;
  name: string;
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
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
}

function stepParticles(list: Particle[], dt: number, f: CursorFrame) {
  const k = dt / 16.67;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    p.x += p.vx * k;
    p.y += p.vy * k;
    p.vy += p.grav * k;
    p.vx *= 0.985;
    p.vy *= 0.985;
    void f;
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

/* ------------------------------------------------------------------ */
/* contextual overlays (shared, animated)                              */
/* ------------------------------------------------------------------ */

export function drawContextOverlays(ctx: CanvasRenderingContext2D, f: CursorFrame) {
  const s = f.scale;
  const a = f.hoverAmt;

  if (f.hover === "text" && a > 0.02) {
    // draw-on I-beam with serif caps + soft blink when idle
    const blink = !f.reduced && f.speed < 0.4 ? (Math.floor(f.t * 1.7) % 2 === 0 ? 1 : 0.4) : 1;
    const h = 11 * s * Math.min(1, a * 1.4);
    ctx.globalAlpha = a * blink;
    seg(ctx, f.x, f.y - h, f.x, f.y + h, WHITE, 1.7 * s);
    const cap = 4 * s * a;
    seg(ctx, f.x - cap, f.y - h, f.x + cap, f.y - h, WHITE, 1.7 * s);
    seg(ctx, f.x - cap, f.y + h, f.x + cap, f.y + h, WHITE, 1.7 * s);
    ctx.globalAlpha = 1;
  }

  if (f.hover === "disabled" && a > 0.02) {
    // circle draws on, then the slash sweeps across
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
    // corner brackets that breathe
    const breathe = f.reduced ? 0 : Math.sin(f.t * 3.2) * 1.5;
    const b = (11 + 4 * (1 - a) + breathe) * s;
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
    // four arrows spring outward; pressing pulls them in (grabbing)
    const dist = lerp(11, 5.5, f.pressAmt) * s;
    const size = 3.4 * s;
    ctx.globalAlpha = a;
    ctx.fillStyle = LIME;
    for (let i = 0; i < 4; i++) {
      const ang = Math.PI / 2 * i + (f.reduced ? 0 : Math.sin(f.t * 2.4) * 0.06);
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

/* magnetic rounded-rect highlight around the hovered element */
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
  const color = f.hover === "media" ? LIME : LIME;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
  // travelling spark along the top edge
  if (!f.reduced) {
    const p = (f.t * 0.35) % 1;
    ctx.globalAlpha = a;
    dot(ctx, x + p * w, y, 1.8, WHITE);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* trail ribbon                                                        */
/* ------------------------------------------------------------------ */

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
/* presets                                                             */
/* ------------------------------------------------------------------ */

/** 1. Lounge — soft-body jelly ring: 16 spring vertices, click shockwaves */
function createLounge(): CursorInstance {
  const N = 16;
  const verts = new Array<number>(N).fill(0); // radial offset
  const vvel = new Array<number>(N).fill(0);
  let ripple = 0; // 0..1 click shockwave
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
      // soft-body spring: pull to rest radius + neighbour cohesion
      const k = f.reduced ? 0.5 : 0.16;
      for (let i = 0; i < N; i++) {
        const prev = verts[(i - 1 + N) % N];
        const next = verts[(i + 1) % N];
        const acc = -verts[i] * k + (prev + next - 2 * verts[i]) * 0.12 - vvel[i] * 0.14;
        vvel[i] += acc * (f.dt / 16.67);
        vvel[i] *= 0.9;
      }
      for (let i = 0; i < N; i++) verts[i] += vvel[i] * (f.dt / 16.67);
      // velocity squish
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
      ctx.strokeStyle = LIME;
      ctx.lineWidth = 1.7 * s;
      ctx.shadowColor = LIME;
      ctx.shadowBlur = 9 * s;
      ctx.stroke();
      ctx.restore();
      if (ripple > 0) {
        ring(ctx, f.rx, f.ry, base + (1 - ripple) * 26 * s, LIME, 1.2 * s, ripple * 0.5);
      }
      glowDot(ctx, f.x, f.y, lerp(3.2, 4.4, link) * s, WHITE, 9 * s);
    },
  };
}

/** 2. Comet — glowing head emitting spark particles against motion */
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
          });
        }
        if (f.click) {
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            parts.push({
              x: f.x,
              y: f.y,
              vx: Math.cos(a) * 2.6,
              vy: Math.sin(a) * 2.6,
              life: 500,
              max: 500,
              size: 1.8 * s,
              color: i % 2 ? LIME : CORAL,
              grav: 0.02,
            });
          }
        }
      }
      stepParticles(parts, f.dt, f);
      if (parts.length > 220) parts.splice(0, parts.length - 220);
      drawParticles(ctx, parts, 8 * s);
      const link = f.hover === "link" ? f.hoverAmt : 0;
      glowDot(ctx, f.x, f.y, lerp(3.4, 4.6, link) * s, "#fffbe0", 16 * s);
      ring(ctx, f.x, f.y, 7 * s, LIME, 1 * s, 0.35 + link * 0.4);
    },
  };
}

/** 3. Jelly Blob — harmonic wobble blob that squishes along velocity */
function createJelly(): CursorInstance {
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const r = lerp(6.5, 10.5, link) * lerp(1, 0.72, f.pressAmt) * s;
      const ang = Math.atan2(f.vy, f.vx);
      const squish = clamp(f.speed * 0.016, 0, 0.4);
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
      // specular highlight
      dot(ctx, f.x - r * 0.3, f.y - r * 0.35, r * 0.22, "rgba(255,255,255,0.9)");
    },
  };
}

/** 4. Snake — verlet chain of segments trailing the pointer */
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
      for (let i = 1; i < N; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.82;
        const vy = (p.y - p.py) * 0.82;
        p.px = p.x;
        p.py = p.y;
        p.x += vx * k;
        p.y += vy * k;
        // distance constraint to previous
        const q = pts[i - 1];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d = Math.hypot(dx, dy) || 1;
        const rest = 4.6 * s;
        const diff = (d - rest) / d;
        p.x -= dx * diff;
        p.y -= dy * diff;
      }
      // tapered gradient body
      for (let i = N - 1; i >= 1; i--) {
        const k2 = i / N;
        const w = (4.6 * (1 - k2) + 0.6) * s;
        const hueMix = k2;
        const color = hueMix < 0.5 ? LIME : hueMix < 0.8 ? "#9de05a" : CORAL;
        seg(ctx, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, color, w, 0.85 * (1 - k2 * 0.7));
      }
      // head with eyes
      const link = f.hover === "link" ? f.hoverAmt : 0;
      glowDot(ctx, f.x, f.y, lerp(4, 5.4, link) * s, LIME, 10 * s);
      const ha = Math.atan2(f.vy, f.vx);
      const ex = Math.cos(ha);
      const ey = Math.sin(ha);
      dot(ctx, f.x + ex * 1.8 * s - ey * 1.6 * s, f.y + ey * 1.8 * s + ex * 1.6 * s, 0.9 * s, "#0b0d12");
      dot(ctx, f.x + ex * 1.8 * s + ey * 1.6 * s, f.y + ey * 1.8 * s - ex * 1.6 * s, 0.9 * s, "#0b0d12");
      // tongue flick when idle over a link
      if (link > 0.4 && !f.reduced && Math.sin(f.t * 6) > 0.6) {
        const tx = f.x + ex * 7 * s;
        const ty = f.y + ey * 7 * s;
        seg(ctx, f.x + ex * 4 * s, f.y + ey * 4 * s, tx, ty, CORAL, 1 * s, link);
      }
    },
  };
}

/** 5. Halo — counter-rotating dashed rings, breathing core, click burst */
function createHalo(): CursorInstance {
  const parts: Particle[] = [];
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const spin = f.reduced ? 0 : f.t;
      const r1 = lerp(12, 19, link) * lerp(1, 0.7, f.pressAmt) * s;
      const r2 = r1 * 1.45;
      ctx.save();
      ctx.translate(f.rx, f.ry);
      ctx.rotate(spin * 1.1);
      ctx.setLineDash([6 * s, 7 * s]);
      ring(ctx, 0, 0, r1, VIOLET, 1.8 * s, 0.95);
      ctx.rotate(-spin * 2.4);
      ctx.setLineDash([3 * s, 9 * s]);
      ring(ctx, 0, 0, r2, LIME, 1.2 * s, 0.6);
      ctx.setLineDash([]);
      ctx.restore();
      const breathe = f.reduced ? 0 : Math.sin(f.t * 2.6) * 0.7;
      glowDot(ctx, f.x, f.y, (3 + breathe * 0.5) * s, WHITE, 12 * s);
      if (f.click && !f.reduced) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + 0.3;
          parts.push({
            x: f.x,
            y: f.y,
            vx: Math.cos(a) * 2.2,
            vy: Math.sin(a) * 2.2,
            life: 420,
            max: 420,
            size: 1.6 * s,
            color: i % 2 ? VIOLET : LIME,
            grav: 0,
          });
        }
      }
      stepParticles(parts, f.dt, f);
      drawParticles(ctx, parts, 7 * s);
    },
  };
}

/** 6. Pixel — chunky pixel-art arrow with press squash + click sparkles */
const PIXEL_MAP = [
  "X........",
  "XX.......",
  "X.X......",
  "X..X.....",
  "X...X....",
  "X....X...",
  "X.....X..",
  "X......X.",
  "X...XX..X",
  "X..X..X..",
  "...X..X..",
  "....XX...",
];
function createPixel(): CursorInstance {
  const parts: Particle[] = [];
  return {
    draw(ctx, f) {
      const s = f.scale;
      const px = 2.1 * s * lerp(1, 0.86, f.pressAmt);
      const bob = f.reduced || f.speed > 0.6 ? 0 : Math.round(Math.sin(f.t * 3) * 0.6) * px * 0.5;
      ctx.save();
      ctx.translate(Math.round(f.x), Math.round(f.y + bob));
      ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < PIXEL_MAP.length; y++) {
        for (let x = 0; x < PIXEL_MAP[y].length; x++) {
          if (PIXEL_MAP[y][x] !== "X") continue;
          ctx.fillStyle = x === 0 || y === 0 ? WHITE : "rgba(244,242,236,0.92)";
          ctx.fillRect(x * px, y * px, px + 0.5, px + 0.5);
          // drop shadow pixel
          ctx.fillStyle = "rgba(11,13,18,0.55)";
          ctx.fillRect(x * px + px * 0.35, y * px + px * 0.35, px * 0.4, px * 0.4);
        }
      }
      ctx.restore();
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
      stepParticles(parts, f.dt, f);
      // pixel-styled particles: square dots
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

/** 7. Glitch — RGB-split arrow with jitter + sliced scanline offsets */
function createGlitch(): CursorInstance {
  let jx = 0;
  let jy = 0;
  let next = 0;
  let sliceY = 0;
  let sliceOn = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (f.t > next && !f.reduced) {
        next = f.t + 0.06 + Math.random() * 0.12;
        jx = (Math.random() - 0.5) * 3.4 * s;
        jy = (Math.random() - 0.5) * 2.2 * s;
        if (Math.random() > 0.72) {
          sliceOn = 0.12;
          sliceY = (Math.random() - 0.5) * 22 * s;
        }
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
        // displaced horizontal slice
        ctx.save();
        ctx.beginPath();
        ctx.rect(f.x - 14 * s, f.y + sliceY, 30 * s, 3 * s);
        ctx.clip();
        arrow(jx + 4 * s, jy, LIME, 0.8);
        ctx.restore();
      }
      if (f.hover === "link" && f.hoverAmt > 0.1) {
        ctx.globalAlpha = f.hoverAmt * (0.5 + 0.5 * Math.abs(Math.sin(f.t * 9)));
        seg(ctx, f.x - 10 * s, f.y + 24 * s, f.x + 14 * s, f.y + 24 * s, LIME, 1.4 * s);
        ctx.globalAlpha = 1;
      }
    },
  };
}

/** 8. Orbit — planet core, two elliptical moons, occasional shooting star */
function createOrbit(): CursorInstance {
  const parts: Particle[] = [];
  let nextStar = 2;
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const r = lerp(11, 18, link) * lerp(1, 0.65, f.pressAmt) * s;
      ctx.save();
      ctx.translate(f.rx, f.ry);
      ctx.rotate(-0.4);
      ctx.scale(1, 0.42);
      ring(ctx, 0, 0, r * 1.5, "rgba(125,107,255,0.4)", 1 * s, 1);
      ctx.restore();
      ring(ctx, f.rx, f.ry, r, "rgba(215,243,74,0.25)", 1 * s, 1);
      if (!f.reduced) {
        const a1 = f.t * 2.2;
        const a2 = -f.t * 1.4 + 2;
        glowDot(ctx, f.rx + Math.cos(a1) * r, f.ry + Math.sin(a1) * r, 2.4 * s, LIME, 8 * s);
        const mx = f.rx + Math.cos(a2) * r * 1.5;
        const my = f.ry + Math.sin(a2) * r * 1.5 * 0.42;
        glowDot(ctx, mx, my, 2 * s, VIOLET, 8 * s);
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
      stepParticles(parts, f.dt, f);
      // shooting stars draw as streaks
      for (const p of parts) {
        const a = clamp(p.life / p.max, 0, 1);
        seg(ctx, p.x, p.y, p.x - p.vx * 3, p.y - p.vy * 3, WHITE, 1.2 * s, a * 0.8);
      }
      // planet core with terminator shading
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

/** 9. Spray — persistent fading paint layer stamped along the path */
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
        // slow fade of the paint layer
        g.globalCompositeOperation = "destination-out";
        g.fillStyle = `rgba(0,0,0,${f.reduced ? 0.06 : 0.028 * (f.dt / 16.67)})`;
        g.fillRect(0, 0, vw, vh);
        g.globalCompositeOperation = "source-over";
        if (!f.reduced && lastX >= 0) {
          const d = Math.hypot(f.x - lastX, f.y - lastY);
          const steps = Math.min(8, Math.floor(d / 2));
          for (let i = 0; i <= steps; i++) {
            const px = lerp(lastX, f.x, i / Math.max(1, steps));
            const py = lerp(lastY, f.y, i / Math.max(1, steps));
            for (let k = 0; k < 3; k++) {
              const a = Math.random() * Math.PI * 2;
              const rr = Math.random() * 5 * s;
              g.globalAlpha = 0.16 + Math.random() * 0.2;
              g.fillStyle = k === 2 ? CORAL : LIME;
              g.beginPath();
              g.arc(px + Math.cos(a) * rr, py + Math.sin(a) * rr, (0.6 + Math.random() * 1.3) * s, 0, Math.PI * 2);
              g.fill();
            }
          }
          g.globalAlpha = 1;
        }
        lastX = f.x;
        lastY = f.y;
        ctx.drawImage(layer, 0, 0, vw, vh);
      }
      // nozzle head
      const link = f.hover === "link" ? f.hoverAmt : 0;
      glowDot(ctx, f.x, f.y, lerp(2.8, 4, link) * s, LIME, 10 * s);
      ring(ctx, f.x, f.y, 6.5 * s * lerp(1, 1.4, link), "rgba(244,242,236,0.5)", 1 * s, 0.8);
    },
  };
}

/** 10. Magnet — field lines arc toward the hovered element */
function createMagnet(): CursorInstance {
  return {
    draw(ctx, f) {
      const s = f.scale;
      const hasRect = f.rect && (f.hover === "link" || f.hover === "media");
      const cx = hasRect ? f.rect!.x + f.rect!.w / 2 : f.x;
      const cy = hasRect ? f.rect!.y + f.rect!.h / 2 : f.y;
      const pull = hasRect ? f.hoverAmt : 0;
      // field lines
      const lines = 5;
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
      const squish = lerp(1, 0.75, f.pressAmt);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(squish, 2 - squish);
      glowDot(ctx, 0, 0, 3.2 * s, WHITE, 10 * s);
      ctx.restore();
      if (pull > 0.05) {
        ring(ctx, f.rx, f.ry, lerp(4, 13, pull) * s, LIME, 1.3 * s, pull * 0.7);
      }
    },
  };
}

/** 11. Sonar — rings ping out as you move, faster over links */
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
      // rotating sweep line like a radar
      if (!f.reduced) {
        const a = f.t * 2.4;
        seg(ctx, f.x, f.y, f.x + Math.cos(a) * 12 * s, f.y + Math.sin(a) * 12 * s, LIME, 1.2 * s, 0.5);
      }
      dot(ctx, f.x, f.y, lerp(2.6, 3.6, link) * s, WHITE);
    },
  };
}

/** 12. Ember — rising flame particles with flicker + heat core */
function createEmber(): CursorInstance {
  const parts: Particle[] = [];
  let acc = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (!f.reduced) {
        acc += f.dt * 0.09;
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
      stepParticles(parts, f.dt, f);
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
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 7 * s);
      g.addColorStop(0, "rgba(255,240,200,0.95)");
      g.addColorStop(0.5, "rgba(255,108,131,0.5)");
      g.addColorStop(1, "rgba(255,108,131,0)");
      ctx.beginPath();
      ctx.arc(f.x, f.y, 7 * s, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      dot(ctx, f.x, f.y, 2.4 * s, "#fff3d6");
    },
  };
}

/** 13. Prism — nested counter-rotating diamonds leaving ghost echoes */
function createPrism(): CursorInstance {
  const ghosts: { x: number; y: number; a: number; rot: number }[] = [];
  let acc = 0;
  return {
    draw(ctx, f) {
      const s = f.scale;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const rot = f.reduced ? 0.5 : f.t * lerp(0.9, -1.8, link);
      const r = lerp(11, 18, link) * lerp(1, 0.7, f.pressAmt) * s;
      if (!f.reduced && f.speed > 1.2) {
        acc += f.dt;
        if (acc > 60) {
          acc = 0;
          ghosts.push({ x: f.rx, y: f.ry, a: 0.4, rot });
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
        ctx.strokeStyle = VIOLET;
        ctx.globalAlpha = gh.a;
        ctx.lineWidth = 1 * s;
        ctx.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
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

/** 14. Aurora Ribbon — hue-shifting glow ribbon through recent motion */
function createAurora(): CursorInstance {
  const pts: { x: number; y: number }[] = [];
  return {
    draw(ctx, f) {
      const s = f.scale;
      if (!f.reduced) {
        pts.unshift({ x: f.x, y: f.y });
        if (pts.length > 34) pts.length = 34;
      }
      if (pts.length > 3) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (let i = 0; i < pts.length - 1; i++) {
          const k = i / pts.length;
          const hue = (f.t * 60 + i * 9) % 360;
          const color = `hsla(${hue}, 90%, 68%, ${(1 - k) * 0.5})`;
          const w = (7 * (1 - k) + 0.5) * s;
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
      glowDot(ctx, f.x, f.y, (3.4 + breathe * 0.4 + link) * s, WHITE, 14 * s);
      ring(ctx, f.x, f.y, (8 + link * 6) * s, "rgba(255,255,255,0.4)", 1 * s, 0.6);
    },
  };
}

export const CURSOR_PRESETS: CursorPreset[] = [
  { id: "lounge", name: "Lounge Jelly", accent: LIME, create: createLounge },
  { id: "comet", name: "Comet", accent: "#fff3b0", trailDefault: false, create: createComet },
  { id: "jelly", name: "Lime Blob", accent: LIME, create: createJelly },
  { id: "snake", name: "Neon Snake", accent: LIME, create: createSnake },
  { id: "halo", name: "Halo", accent: VIOLET, create: createHalo },
  { id: "pixel", name: "Pixel Pop", accent: WHITE, create: createPixel },
  { id: "glitch", name: "Glitch", accent: CORAL, create: createGlitch },
  { id: "orbit", name: "Orbit", accent: CORAL, create: createOrbit },
  { id: "spray", name: "Spray Paint", accent: LIME, create: createSpray },
  { id: "magnet", name: "Magnet", accent: VIOLET, create: createMagnet },
  { id: "sonar", name: "Sonar", accent: LIME, create: createSonar },
  { id: "ember", name: "Ember", accent: CORAL, create: createEmber },
  { id: "prism", name: "Prism", accent: VIOLET, create: createPrism },
  { id: "aurora", name: "Aurora Ribbon", accent: "#7df3d1", create: createAurora },
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
  const dim =
    (f.hover === "text" || f.hover === "disabled") ? 1 - 0.8 * f.hoverAmt : 1;
  ctx.globalAlpha = dim;
  instance.draw(ctx, f);
  ctx.globalAlpha = 1;
  ctx.restore();
  drawElementHighlight(ctx, f, animRect);
  drawContextOverlays(ctx, f);
}

/* ------------------------------------------------------------------ */
/* deterministic-ish preview renderer for the customizer panel         */
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

/**
 * Renders one animated preview frame. `instance` is a per-canvas preset
 * instance created by the caller via getCursorPreset(id).create().
 */
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
    (state === "link" || state === "grab") && stateT > 0.8
      ? clamp(Math.sin((stateT - 0.8) * 3.4), 0, 1)
      : 0;

  const p = previewPointer(w, h, t);
  const pPrev = previewPointer(w, h, Math.max(0, t - dt / 1000));
  const lag = previewPointer(w, h, Math.max(0, t - 0.11));
  const vx = p.x - pPrev.x;
  const vy = p.y - pPrev.y;

  // fake hovered element box during link/media states
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
