// GG Lounge mascot cursors — hand-drawn vector characters with real
// animation rigs: blink machines, tail wag, ear twitch, squash-and-stretch
// pounce, tongues, hop cycles. Silhouettes are designed to read at 32-48px:
// ears, tails, faces — not blobs. Hotspot (0,0) sits at the character's
// nose/front-paw so clicks land where the character is "touching".

import type { CursorFrame, CursorInstance } from "./cursor-presets";

const INK = "#10131b";
const LIME = "#d7f34a";
const CORAL = "#ff6c83";
const CREAM = "#f4f2ec";

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** shared per-instance animation state: blink timer + squash spring */
function rig() {
  return {
    blinkIn: 1.5 + Math.random() * 2.5,
    blink: 0,
    squash: 0,
    squashV: 0,
    step(ctx: CanvasRenderingContext2D, f: CursorFrame) {
      this.blinkIn -= f.dt / 1000;
      if (this.blinkIn <= 0) {
        this.blink = 0.13;
        this.blinkIn = 1.8 + Math.random() * 3;
      }
      this.blink = Math.max(0, this.blink - f.dt / 1000);
      if (f.click) this.squashV += 2.8;
      this.squashV += -this.squash * 0.24 * (f.dt / 16.67) - this.squashV * 0.17;
      this.squash += this.squashV * (f.dt / 16.67);
      void ctx;
    },
    get blinking(): boolean {
      return this.blink > 0;
    },
  };
}

type Rig = ReturnType<typeof rig>;

/** enter character space: hotspot at pointer, tilt with velocity, squash */
function enter(ctx: CanvasRenderingContext2D, f: CursorFrame, r: Rig) {
  const s = f.scale;
  const tilt = f.reduced ? 0 : clamp(f.vx * 0.015, -0.16, 0.16);
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(tilt);
  ctx.scale(s * (1 + r.squash * 0.05), s * (1 - r.squash * 0.06));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}

function path(ctx: CanvasRenderingContext2D, build: () => void, fill: string, lw = 1.1) {
  ctx.beginPath();
  build();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, blink: boolean, wide = 1) {
  if (blink) {
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, r * wide, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();
}

function sparkle(ctx: CanvasRenderingContext2D, f: CursorFrame, color: string, n = 5) {
  if (f.reduced) return;
  const p = clamp(1 - f.pressAmt, 0, 1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const d = 12 + (1 - p) * 6;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d - 4;
    ctx.globalAlpha = f.pressAmt * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ */
/* CAT — sitting, tail wag, ear alert, collar + tag                    */
/* ------------------------------------------------------------------ */

export function createCat(): CursorInstance {
  const r: Rig = rig();
  return {
    draw(ctx, f) {
      r.step(ctx, f);
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const wag = f.reduced ? 0.3 : Math.sin(f.t * (3 + link * 5)) * (0.5 + link * 0.6);
      enter(ctx, f, r);
      // tail (behind body)
      ctx.beginPath();
      ctx.moveTo(15, 27);
      ctx.quadraticCurveTo(23, 25 + wag * 3, 25, 17 + wag * 5);
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(25, 17 + wag * 5, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = LIME;
      ctx.fill();
      // body (sitting pear)
      path(ctx, () => {
        ctx.moveTo(6, 13);
        ctx.bezierCurveTo(2, 18, 2, 26, 4, 29);
        ctx.lineTo(15, 29);
        ctx.bezierCurveTo(17, 24, 16, 17, 12, 13);
        ctx.closePath();
      }, CREAM);
      // front paw
      path(ctx, () => ctx.ellipse(7.5, 28.6, 3, 1.7, 0, 0, Math.PI * 2), CREAM, 0.9);
      // ears (alert rotate on hover)
      const earA = link * 0.22;
      ctx.save();
      ctx.translate(6, 6);
      ctx.rotate(-earA);
      path(ctx, () => {
        ctx.moveTo(-2, 2);
        ctx.lineTo(-1, -4.5);
        ctx.lineTo(2.5, 0.5);
        ctx.closePath();
      }, CREAM, 1);
      path(ctx, () => {
        ctx.moveTo(-1.1, 0.8);
        ctx.lineTo(-0.8, -2.6);
        ctx.lineTo(1.2, 0.2);
        ctx.closePath();
      }, CORAL, 0.6);
      ctx.restore();
      ctx.save();
      ctx.translate(12, 6);
      ctx.rotate(earA);
      path(ctx, () => {
        ctx.moveTo(-2.5, 0.5);
        ctx.lineTo(1, -4.5);
        ctx.lineTo(2, 2);
        ctx.closePath();
      }, CREAM, 1);
      path(ctx, () => {
        ctx.moveTo(-1.2, 0.2);
        ctx.lineTo(0.8, -2.6);
        ctx.lineTo(1.1, 0.8);
        ctx.closePath();
      }, CORAL, 0.6);
      ctx.restore();
      // head
      path(ctx, () => ctx.arc(9, 9.5, 6, 0, Math.PI * 2), CREAM);
      // face
      eye(ctx, 6.8, 9, 1.15, r.blinking, 1 + link * 0.25);
      eye(ctx, 11.2, 9, 1.15, r.blinking, 1 + link * 0.25);
      path(ctx, () => {
        ctx.moveTo(8.4, 11);
        ctx.lineTo(9.6, 11);
        ctx.lineTo(9, 11.8);
        ctx.closePath();
      }, CORAL, 0.6);
      ctx.beginPath();
      ctx.moveTo(9, 11.8);
      ctx.quadraticCurveTo(8.4, 12.8, 7.6, 12.4);
      ctx.moveTo(9, 11.8);
      ctx.quadraticCurveTo(9.6, 12.8, 10.4, 12.4);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      // whiskers
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(3.4, 10);
      ctx.lineTo(0.6, 9.4);
      ctx.moveTo(3.4, 11.4);
      ctx.lineTo(0.8, 11.8);
      ctx.moveTo(14.6, 10);
      ctx.lineTo(17.4, 9.4);
      ctx.moveTo(14.6, 11.4);
      ctx.lineTo(17.2, 11.8);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      // collar + tag
      path(ctx, () => {
        ctx.moveTo(5, 14.2);
        ctx.quadraticCurveTo(9, 16, 13, 14.2);
        ctx.lineTo(13, 15.6);
        ctx.quadraticCurveTo(9, 17.4, 5, 15.6);
        ctx.closePath();
      }, CORAL, 0.8);
      ctx.beginPath();
      ctx.arc(9, 17, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = LIME;
      ctx.fill();
      ctx.restore();
      if (f.pressAmt > 0.2) sparkle(ctx, f, CORAL);
    },
  };
}

/* ------------------------------------------------------------------ */
/* DOG — floppy ears, tongue, wagging tail, brow ticks                 */
/* ------------------------------------------------------------------ */

export function createDog(): CursorInstance {
  const r: Rig = rig();
  return {
    draw(ctx, f) {
      r.step(ctx, f);
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const wag = f.reduced ? 0.4 : Math.sin(f.t * (6 + link * 6)) * (0.6 + link * 0.5);
      const tongue = f.pressAmt > 0.3 || link > 0.6;
      enter(ctx, f, r);
      // tail
      ctx.beginPath();
      ctx.moveTo(15, 25);
      ctx.quadraticCurveTo(21, 22 - wag * 4, 22, 15 - wag * 4);
      ctx.strokeStyle = "#e8b06a";
      ctx.lineWidth = 3;
      ctx.stroke();
      // body
      path(ctx, () => {
        ctx.moveTo(6, 13);
        ctx.bezierCurveTo(3, 18, 3, 25, 5, 28);
        ctx.lineTo(15, 28);
        ctx.bezierCurveTo(17, 23, 16, 17, 12, 13);
        ctx.closePath();
      }, "#e8b06a");
      path(ctx, () => ctx.ellipse(8, 27.6, 3, 1.7, 0, 0, Math.PI * 2), "#f6d7a8", 0.9);
      // floppy ears
      const flop = 0.25 + link * 0.2 + (f.reduced ? 0 : Math.sin(f.t * 2.2) * 0.05);
      ctx.save();
      ctx.translate(4.5, 6.5);
      ctx.rotate(-flop);
      path(ctx, () => ctx.ellipse(0, 3, 2.2, 4.6, 0.15, 0, Math.PI * 2), "#8a5a3b", 1);
      ctx.restore();
      ctx.save();
      ctx.translate(13.5, 6.5);
      ctx.rotate(flop);
      path(ctx, () => ctx.ellipse(0, 3, 2.2, 4.6, -0.15, 0, Math.PI * 2), "#8a5a3b", 1);
      ctx.restore();
      // head
      path(ctx, () => ctx.arc(9, 9, 6, 0, Math.PI * 2), "#e8b06a");
      // muzzle
      path(ctx, () => ctx.ellipse(9, 11.6, 3.4, 2.5, 0, 0, Math.PI * 2), "#f6d7a8", 0.9);
      ctx.beginPath();
      ctx.arc(9, 10.6, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      if (tongue) {
        const wig = f.reduced ? 0 : Math.sin(f.t * 10) * 0.6;
        path(ctx, () => ctx.ellipse(9 + wig * 0.4, 14.6, 1.5, 2.4, wig * 0.1, 0, Math.PI * 2), CORAL, 0.8);
      }
      // eyes + brows
      eye(ctx, 6.6, 8, 1.15, r.blinking, 1 + link * 0.2);
      eye(ctx, 11.4, 8, 1.15, r.blinking, 1 + link * 0.2);
      if (link > 0.3) {
        ctx.beginPath();
        ctx.moveTo(5.4, 5.8);
        ctx.lineTo(7.6, 5.4);
        ctx.moveTo(10.4, 5.4);
        ctx.lineTo(12.6, 5.8);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      // collar
      path(ctx, () => {
        ctx.moveTo(5, 13.8);
        ctx.quadraticCurveTo(9, 15.6, 13, 13.8);
        ctx.lineTo(13, 15.2);
        ctx.quadraticCurveTo(9, 17, 5, 15.2);
        ctx.closePath();
      }, LIME, 0.8);
      ctx.restore();
      if (f.pressAmt > 0.2) sparkle(ctx, f, LIME);
    },
  };
}

/* ------------------------------------------------------------------ */
/* FOX — big ears, sweeping bushy tail with white tip                  */
/* ------------------------------------------------------------------ */

export function createFox(): CursorInstance {
  const r: Rig = rig();
  return {
    draw(ctx, f) {
      r.step(ctx, f);
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const sway = f.reduced ? 0.3 : Math.sin(f.t * (2.4 + link * 3)) * (0.5 + link * 0.5);
      enter(ctx, f, r);
      // bushy tail
      ctx.save();
      ctx.translate(14, 26);
      ctx.rotate(sway * 0.35);
      path(ctx, () => {
        ctx.moveTo(0, 2);
        ctx.bezierCurveTo(8, 2, 12, -4, 11, -11);
        ctx.bezierCurveTo(8, -8, 5, -6, 1, -4);
        ctx.closePath();
      }, "#ff8a4a");
      path(ctx, () => {
        ctx.moveTo(11, -11);
        ctx.bezierCurveTo(10.6, -8.6, 9.4, -7, 7.6, -6.2);
        ctx.bezierCurveTo(9, -8, 9.8, -9.4, 10, -10.6);
        ctx.closePath();
      }, CREAM, 0.8);
      ctx.restore();
      // body
      path(ctx, () => {
        ctx.moveTo(6, 13);
        ctx.bezierCurveTo(3, 18, 3, 25, 5, 28);
        ctx.lineTo(14, 28);
        ctx.bezierCurveTo(16, 22, 15, 17, 12, 13);
        ctx.closePath();
      }, "#ff8a4a");
      path(ctx, () => ctx.ellipse(8, 27.6, 2.8, 1.6, 0, 0, Math.PI * 2), "#3b2417", 0.9);
      // chest
      path(ctx, () => {
        ctx.moveTo(7, 14);
        ctx.bezierCurveTo(6, 18, 6, 22, 7, 25);
        ctx.lineTo(10, 25);
        ctx.bezierCurveTo(11, 21, 11, 17, 10, 14);
        ctx.closePath();
      }, CREAM, 0.8);
      // ears
      const twitch = link * 0.25;
      ctx.save();
      ctx.translate(5.5, 5.5);
      ctx.rotate(-twitch);
      path(ctx, () => {
        ctx.moveTo(-2, 2);
        ctx.lineTo(-1.5, -5);
        ctx.lineTo(2.5, 0.5);
        ctx.closePath();
      }, "#ff8a4a", 1);
      path(ctx, () => {
        ctx.moveTo(-1.4, -2.4);
        ctx.lineTo(-1.2, -4.4);
        ctx.lineTo(0.4, -1.6);
        ctx.closePath();
      }, INK, 0.5);
      ctx.restore();
      ctx.save();
      ctx.translate(12.5, 5.5);
      ctx.rotate(twitch);
      path(ctx, () => {
        ctx.moveTo(-2.5, 0.5);
        ctx.lineTo(1.5, -5);
        ctx.lineTo(2, 2);
        ctx.closePath();
      }, "#ff8a4a", 1);
      path(ctx, () => {
        ctx.moveTo(0.8, -2.4);
        ctx.lineTo(1.2, -4.4);
        ctx.lineTo(-0.4, -1.6);
        ctx.closePath();
      }, INK, 0.5);
      ctx.restore();
      // head with pointy muzzle
      path(ctx, () => {
        ctx.moveTo(3, 8);
        ctx.bezierCurveTo(3, 4, 15, 4, 15, 8);
        ctx.bezierCurveTo(15, 10.5, 11.5, 12, 9, 13.5);
        ctx.bezierCurveTo(6.5, 12, 3, 10.5, 3, 8);
        ctx.closePath();
      }, "#ff8a4a");
      path(ctx, () => {
        ctx.moveTo(7, 10.5);
        ctx.bezierCurveTo(8, 12, 10, 12, 11, 10.5);
        ctx.bezierCurveTo(10, 12.6, 8, 12.6, 7, 10.5);
        ctx.closePath();
      }, CREAM, 0.7);
      ctx.beginPath();
      ctx.arc(9, 12.2, 1, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      // sly eyes
      if (r.blinking) {
        ctx.beginPath();
        ctx.moveTo(5.4, 8.4);
        ctx.lineTo(7.4, 8.4);
        ctx.moveTo(10.6, 8.4);
        ctx.lineTo(12.6, 8.4);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(5.4, 8.8);
        ctx.quadraticCurveTo(6.4, 7.6, 7.4, 8.6);
        ctx.moveTo(10.6, 8.6);
        ctx.quadraticCurveTo(11.6, 7.6, 12.6, 8.8);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      ctx.restore();
      if (f.pressAmt > 0.2) sparkle(ctx, f, "#ff8a4a");
    },
  };
}

/* ------------------------------------------------------------------ */
/* BUNNY — one floppy ear, pom tail, nose twitch, hop on click         */
/* ------------------------------------------------------------------ */

export function createBunny(): CursorInstance {
  const r: Rig = rig();
  let hop = 0;
  return {
    draw(ctx, f) {
      r.step(ctx, f);
      if (f.click) hop = 1;
      hop = Math.max(0, hop - f.dt / 450);
      const hopY = -Math.sin(hop * Math.PI) * 5;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const twitch = f.reduced ? 0 : Math.sin(f.t * 9) * 0.5;
      enter(ctx, f, r);
      ctx.translate(0, hopY);
      // ears
      const flopR = 0.5 + link * 0.5;
      path(ctx, () => ctx.ellipse(6.5, 1.5, 1.9, 5.2, -0.12, 0, Math.PI * 2), CREAM, 1);
      path(ctx, () => ctx.ellipse(6.5, 1.6, 0.9, 3.6, -0.12, 0, Math.PI * 2), CORAL, 0.5);
      ctx.save();
      ctx.translate(11.5, 4);
      ctx.rotate(flopR);
      path(ctx, () => ctx.ellipse(0, -2, 1.9, 5.2, 0.1, 0, Math.PI * 2), CREAM, 1);
      path(ctx, () => ctx.ellipse(0, -1.9, 0.9, 3.6, 0.1, 0, Math.PI * 2), CORAL, 0.5);
      ctx.restore();
      // body
      path(ctx, () => {
        ctx.moveTo(5, 12);
        ctx.bezierCurveTo(2, 16, 2, 24, 5, 27);
        ctx.lineTo(14, 27);
        ctx.bezierCurveTo(16, 22, 15, 16, 12, 12);
        ctx.closePath();
      }, CREAM);
      // pom tail
      const pom = f.reduced ? 0 : Math.sin(f.t * 5) * 0.6;
      path(ctx, () => ctx.arc(15.5, 24 + pom, 2.4, 0, Math.PI * 2), CREAM, 0.9);
      // paw
      path(ctx, () => ctx.ellipse(7.5, 26.6, 2.8, 1.6, 0, 0, Math.PI * 2), CREAM, 0.9);
      // head
      path(ctx, () => ctx.arc(9, 9, 5.6, 0, Math.PI * 2), CREAM);
      eye(ctx, 6.9, 8.6, 1.1, r.blinking, 1 + link * 0.2);
      eye(ctx, 11.1, 8.6, 1.1, r.blinking, 1 + link * 0.2);
      ctx.beginPath();
      ctx.arc(9 + twitch * 0.4, 10.6, 0.9, 0, Math.PI * 2);
      ctx.fillStyle = CORAL;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(9, 11.4);
      ctx.quadraticCurveTo(8.5, 12.2, 7.9, 11.9);
      ctx.moveTo(9, 11.4);
      ctx.quadraticCurveTo(9.5, 12.2, 10.1, 11.9);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      // cheek blush
      ctx.globalAlpha = 0.5;
      dot2(ctx, 4.9, 10.4, 1, CORAL);
      dot2(ctx, 13.1, 10.4, 1, CORAL);
      ctx.globalAlpha = 1;
      ctx.restore();
      if (f.pressAmt > 0.2) sparkle(ctx, f, CORAL);
    },
  };
}

function dot2(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* GHOST — wavy skirt, float bob, "boo" on click                       */
/* ------------------------------------------------------------------ */

export function createGhost(): CursorInstance {
  const r: Rig = rig();
  return {
    draw(ctx, f) {
      r.step(ctx, f);
      const bob = f.reduced ? 0 : Math.sin(f.t * 2.2) * 1.6;
      const boo = f.pressAmt;
      enter(ctx, f, r);
      ctx.translate(0, bob);
      ctx.scale(1 + boo * 0.12, 1 + boo * 0.12);
      ctx.globalAlpha = 0.94;
      path(ctx, () => {
        ctx.moveTo(3, 26);
        ctx.lineTo(3, 10);
        ctx.bezierCurveTo(3, 3, 15, 3, 15, 10);
        ctx.lineTo(15, 26);
        const ph = f.reduced ? 0 : f.t * 6;
        for (let i = 0; i < 4; i++) {
          const x0 = 15 - i * 3;
          const dip = 2.4 + Math.sin(ph + i * 1.7) * 0.8;
          ctx.quadraticCurveTo(x0 - 1.5, 26 - dip, x0 - 3, 26);
        }
        ctx.closePath();
      }, "#eef4ff", 1.2);
      ctx.globalAlpha = 1;
      // eyes + mouth
      const ey = r.blinking ? 0.2 : 1;
      ctx.beginPath();
      ctx.ellipse(7, 10.5, 1.2, 1.8 * ey, 0, 0, Math.PI * 2);
      ctx.ellipse(11, 10.5, 1.2, 1.8 * ey, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#1b2440";
      ctx.fill();
      ctx.beginPath();
      if (boo > 0.3) ctx.ellipse(9, 14.5, 1.6, 2 * boo, 0, 0, Math.PI * 2);
      else ctx.arc(9, 14, 0.9, 0, Math.PI * 2);
      ctx.fillStyle = "#1b2440";
      ctx.fill();
      // blush + rim glow
      ctx.globalAlpha = 0.4;
      dot2(ctx, 4.8, 12.6, 1, CORAL);
      dot2(ctx, 13.2, 12.6, 1, CORAL);
      ctx.globalAlpha = 1;
      ctx.restore();
      if (boo > 0.4) sparkle(ctx, f, "#9db8ff", 6);
    },
  };
}

/* ------------------------------------------------------------------ */
/* BAT — flapping wings, glow eyes                                     */
/* ------------------------------------------------------------------ */

export function createBat(): CursorInstance {
  const r: Rig = rig();
  return {
    draw(ctx, f) {
      r.step(ctx, f);
      const flap = f.reduced ? 0.3 : Math.sin(f.t * (7 + f.speed * 0.4)) * 0.5;
      const link = f.hover === "link" ? f.hoverAmt : 0;
      enter(ctx, f, r);
      const wing = (side: number) => {
        ctx.save();
        ctx.translate(9 + side * 4, 10);
        ctx.rotate(side * (-0.3 + flap));
        path(ctx, () => {
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(side * 8, -5, side * 13, -2);
          ctx.quadraticCurveTo(side * 10, 0, side * 11, 3);
          ctx.quadraticCurveTo(side * 8, 2, side * 8, 5);
          ctx.quadraticCurveTo(side * 5, 3, 0, 4);
          ctx.closePath();
        }, "#3a2b52", 1);
        ctx.restore();
      };
      wing(-1);
      wing(1);
      // ears
      path(ctx, () => {
        ctx.moveTo(6, 6);
        ctx.lineTo(5.5, 1.5);
        ctx.lineTo(8.5, 4.5);
        ctx.closePath();
      }, "#3a2b52", 1);
      path(ctx, () => {
        ctx.moveTo(9.5, 4.5);
        ctx.lineTo(12.5, 1.5);
        ctx.lineTo(12, 6);
        ctx.closePath();
      }, "#3a2b52", 1);
      // body
      path(ctx, () => ctx.ellipse(9, 10, 4.6, 5.2, 0, 0, Math.PI * 2), "#3a2b52");
      // glow eyes
      const er = r.blinking ? 0.2 : 1 + link * 0.3;
      ctx.save();
      ctx.shadowColor = LIME;
      ctx.shadowBlur = 6;
      dot2(ctx, 7.2, 9, 1.1 * er, LIME);
      dot2(ctx, 10.8, 9, 1.1 * er, LIME);
      ctx.restore();
      // fangs
      path(ctx, () => {
        ctx.moveTo(7.6, 12.4);
        ctx.lineTo(8.1, 13.6);
        ctx.lineTo(8.6, 12.5);
        ctx.closePath();
      }, CREAM, 0.5);
      path(ctx, () => {
        ctx.moveTo(9.4, 12.5);
        ctx.lineTo(9.9, 13.6);
        ctx.lineTo(10.4, 12.4);
        ctx.closePath();
      }, CREAM, 0.5);
      ctx.restore();
      if (f.pressAmt > 0.2) sparkle(ctx, f, VIOLET_SPARK, 6);
    },
  };
}

const VIOLET_SPARK = "#7d6bff";

/* ------------------------------------------------------------------ */
/* CHICK — tiny hop cycle, wing flaps, beak                            */
/* ------------------------------------------------------------------ */

export function createChick(): CursorInstance {
  const r: Rig = rig();
  let hop = 0;
  return {
    draw(ctx, f) {
      r.step(ctx, f);
      if (!f.reduced) {
        const cycle = (f.t * 1.6) % 1;
        hop = f.pressAmt > 0.3 ? 1 : cycle < 0.18 ? Math.sin((cycle / 0.18) * Math.PI) : 0;
      }
      const link = f.hover === "link" ? f.hoverAmt : 0;
      const flap = f.reduced ? 0.2 : Math.sin(f.t * (5 + link * 6)) * 0.5;
      enter(ctx, f, r);
      ctx.translate(0, -hop * 4);
      // feet
      ctx.beginPath();
      ctx.moveTo(7, 24 + hop * 4);
      ctx.lineTo(6.4, 26.5);
      ctx.moveTo(10, 24 + hop * 4);
      ctx.lineTo(10.4, 26.5);
      ctx.strokeStyle = "#ff9a3d";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // body
      path(ctx, () => ctx.ellipse(9, 17, 6.4, 7.2, 0, 0, Math.PI * 2), "#ffd75e");
      // wing
      ctx.save();
      ctx.translate(4.5, 16);
      ctx.rotate(-0.3 + flap * 0.7);
      path(ctx, () => ctx.ellipse(0, 2, 2.2, 4, 0.2, 0, Math.PI * 2), "#f4b942", 0.9);
      ctx.restore();
      // head tuft
      ctx.beginPath();
      ctx.moveTo(8, 10.4);
      ctx.quadraticCurveTo(7.6, 8.4, 8.6, 7.6);
      ctx.moveTo(9.4, 10.2);
      ctx.quadraticCurveTo(9.6, 8.2, 10.6, 7.8);
      ctx.strokeStyle = "#f4b942";
      ctx.lineWidth = 1;
      ctx.stroke();
      // face
      eye(ctx, 7.4, 13.4, 1, r.blinking, 1 + link * 0.2);
      eye(ctx, 11, 13.4, 1, r.blinking, 1 + link * 0.2);
      path(ctx, () => {
        ctx.moveTo(8.4, 15);
        ctx.lineTo(10, 15);
        ctx.lineTo(9.2, 16.4);
        ctx.closePath();
      }, "#ff9a3d", 0.6);
      ctx.globalAlpha = 0.5;
      dot2(ctx, 5.6, 15.2, 0.9, CORAL);
      dot2(ctx, 12.8, 15.2, 0.9, CORAL);
      ctx.globalAlpha = 1;
      ctx.restore();
      if (f.pressAmt > 0.2) sparkle(ctx, f, "#ffd75e");
    },
  };
}
