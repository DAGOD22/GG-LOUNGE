'use client';

/**
 * Ghost cursors — everyone else's pointer, drawn on one canvas.
 *
 * Three decisions matter more than the drawing itself:
 *
 *   · **One canvas, not N DOM nodes.** Each ghost is a moving thing; a node per
 *     ghost means a style recalc per ghost per frame. A single canvas painted
 *     in one rAF tick costs one composite and stays at 60fps with a room full
 *     of people.
 *   · **The canvas is `pointer-events: none` and `aria-hidden`.** A ghost must
 *     never intercept a click, a hover or a tab stop. This is the one rule that
 *     cannot be traded away for a nicer effect.
 *   · **Ghosts are interpolated.** Presence arrives every couple of seconds.
 *     Rendering the raw sample would teleport each cursor on every poll, so
 *     each ghost eases toward its latest known position and the motion stays
 *     continuous in between.
 *
 * The preset is drawn with the same engine the real cursor uses
 * (`drawCursorScene` + `getCursorPreset`), so a friend using the jelly cursor
 * shows up as a jelly cursor rather than a generic arrow.
 */

import { useEffect, useRef } from 'react';
import {
  drawCursorScene,
  getCursorPreset,
  type CursorFrame,
  type CursorInstance,
  type HoverState,
} from '@/lib/customization/cursor-presets';
import { activityLine, ghostName, type PresencePeer } from '@/lib/presence';

type Tracked = {
  id: string;
  name: string;
  /** target position in css px */
  tx: number;
  ty: number;
  /** eased position */
  x: number;
  y: number;
  press: number;
  hover: HoverState;
  preset: string;
  accent: string;
  size: number;
  image: string;
  instance: CursorInstance | null;
  /** spawn animation 0→1, and fade-out when they leave */
  appear: number;
  fade: number;
  /** when the peer was last in a snapshot, for eviction */
  aliveAt: number;
  labelEl: HTMLDivElement;
  /** Second line under the name: "playing Slope", "on youtube.com". */
  actionEl: HTMLSpanElement | null;
  actionText: string;
};

export function GhostCursors({
  peers,
  enabled,
}: {
  peers: PresencePeer[];
  enabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const tracked = useRef(new Map<string, Tracked>());
  const peersRef = useRef<PresencePeer[]>(peers);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      for (const ghost of tracked.current.values()) ghost.labelEl.remove();
      tracked.current.clear();
    }
  }, [enabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    if (!canvas || !layer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // A ghost is decoration. On a touch device there are no pointers to show
    // and no room for them, and with reduced motion the easing is the only
    // animation in the feature, so both are reasons to stand down.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (coarse) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    let raf = 0;
    let last = performance.now();
    const start = last;

    function resize() {
      vw = window.innerWidth;
      vh = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(vw * dpr);
      canvas!.height = Math.floor(vh * dpr);
      canvas!.style.width = `${vw}px`;
      canvas!.style.height = `${vh}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function makeGhost(peer: PresencePeer): Tracked {
      const label = document.createElement('div');
      label.className = 'gg-ghost-label';
      // Name on the first line, activity on the second. The activity line is a
      // child element rather than part of `textContent` so the two lines can be
      // styled apart and so the name keeps its pill.
      const nameEl = document.createElement('span');
      nameEl.className = 'gg-ghost-name';
      nameEl.textContent = peer.name?.trim() || peer.username?.trim() || ghostName(peer.id);
      label.appendChild(nameEl);
      const action = activityLine(peer.activity);
      let actionEl: HTMLSpanElement | null = null;
      if (action) {
        actionEl = document.createElement('span');
        actionEl.className = 'gg-ghost-action';
        actionEl.textContent = action;
        label.appendChild(actionEl);
      }
      // Decorative duplicate of the name drawn on the canvas; the real list of
      // who is online is announced by the activity feed instead.
      label.setAttribute('aria-hidden', 'true');
      layer!.append(label);
      return {
        id: peer.id,
        name: nameEl.textContent || 'Player',
        tx: (peer.cursor.x / 100) * vw,
        ty: (peer.cursor.y / 100) * vh,
        x: (peer.cursor.x / 100) * vw,
        y: (peer.cursor.y / 100) * vh,
        press: 0,
        hover: 'default',
        preset: peer.cursor.preset,
        accent: peer.cursor.accent,
        size: peer.cursor.size,
        image: peer.cursor.image,
        instance: null,
        appear: reduced ? 1 : 0,
        fade: 1,
        aliveAt: performance.now(),
        labelEl: label,
        actionEl,
        actionText: action ?? '',
      };
    }

    /** Cache the drawn instance per preset; building one every frame is waste. */
    function instanceFor(ghost: Tracked): CursorInstance | null {
      if (ghost.instance) return ghost.instance;
      try {
        ghost.instance = getCursorPreset(ghost.preset).create();
      } catch {
        ghost.instance = null;
      }
      return ghost.instance;
    }

    function step(now: number) {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const t = (now - start) / 1000;

      if (!enabledRef.current) {
        ctx!.clearRect(0, 0, vw, vh);
        return;
      }

      /* 1. reconcile the roster ------------------------------------------- */
      const seen = new Set<string>();
      for (const peer of peersRef.current) {
        seen.add(peer.id);
        let ghost = tracked.current.get(peer.id);
        if (!ghost) {
          ghost = makeGhost(peer);
          tracked.current.set(peer.id, ghost);
        }
        ghost.tx = (peer.cursor.x / 100) * vw;
        ghost.ty = (peer.cursor.y / 100) * vh;
        ghost.aliveAt = now;
        if (ghost.preset !== peer.cursor.preset) {
          ghost.preset = peer.cursor.preset;
          ghost.instance = null;
        }
        ghost.accent = peer.cursor.accent;
        ghost.size = peer.cursor.size;
        ghost.image = peer.cursor.image;

        // Activity changes far less often than the pointer does; only touch the
        // DOM when the sentence actually differs, because this loop runs at
        // 60fps and a text write per frame is a layout per frame.
        const nextAction = activityLine(peer.activity) ?? '';
        if (nextAction !== ghost.actionText) {
          ghost.actionText = nextAction;
          if (!ghost.actionEl && nextAction) {
            const el = document.createElement('span');
            el.className = 'gg-ghost-action';
            ghost.labelEl.appendChild(el);
            ghost.actionEl = el;
          }
          if (ghost.actionEl) {
            ghost.actionEl.textContent = nextAction;
            ghost.actionEl.style.display = nextAction ? '' : 'none';
          }
        }
      }
      for (const [id, ghost] of tracked.current) {
        if (seen.has(id)) continue;
        // Ease out rather than blink out; a cursor that vanishes abruptly reads
        // as a glitch, and the row may simply have aged past the TTL.
        ghost.fade = Math.max(0, ghost.fade - dt * 1.6);
        if (ghost.fade <= 0) {
          ghost.labelEl.remove();
          tracked.current.delete(id);
        }
      }

      /* 2. draw ------------------------------------------------------------ */
      ctx!.clearRect(0, 0, vw, vh);

      for (const ghost of tracked.current.values()) {
        const ease = reduced ? 1 : 1 - Math.pow(0.0016, dt); // ~steady, frame-rate independent
        ghost.x += (ghost.tx - ghost.x) * ease;
        ghost.y += (ghost.ty - ghost.y) * ease;
        ghost.appear = reduced ? 1 : Math.min(1, ghost.appear + dt * 2.2);

        const scale = Math.min(1, 0.6 + ghost.appear * 0.4) * (ghost.size / 40);
        const alpha = 0.55 * ghost.fade * ghost.appear;
        if (alpha <= 0.01) {
          ghost.labelEl.style.opacity = '0';
          continue;
        }

        ctx!.save();
        ctx!.globalAlpha = alpha;

        if (ghost.preset === 'custom' && ghost.image) {
          // An uploaded cursor is an image, not a preset the engine can draw.
          // Drawing it directly keeps the friend's actual pointer art.
          drawImageCursor(ctx!, ghost);
        } else if (ghost.preset !== 'system') {
          const instance = instanceFor(ghost);
          if (instance) {
            const frame: CursorFrame = {
              x: ghost.x,
              y: ghost.y,
              rx: ghost.x,
              ry: ghost.y,
              vx: ghost.tx - ghost.x,
              vy: ghost.ty - ghost.y,
              speed: Math.hypot(ghost.tx - ghost.x, ghost.ty - ghost.y),
              t,
              dt,
              hover: ghost.hover,
              hoverAmt: 0,
              pressAmt: 0,
              click: false,
              scale,
              reduced,
              vw,
              vh,
              rect: null,
            };
            drawCursorScene(ctx!, instance, frame, null, null);
          } else {
            drawArrow(ctx!, ghost.x, ghost.y, scale, ghost.accent);
          }
        } else {
          drawArrow(ctx!, ghost.x, ghost.y, scale, ghost.accent);
        }

        ctx!.restore();

        /* name tag: parked under the pointer, clamped inside the viewport */
        const label = ghost.labelEl;
        const width = label.offsetWidth || 0;
        const left = Math.max(4, Math.min(vw - width - 4, ghost.x + 14 * scale));
        const top = Math.max(4, Math.min(vh - 24, ghost.y + 18 * scale));
        label.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
        label.style.opacity = String(Math.min(0.9, alpha + 0.25));
        label.style.borderColor = `${ghost.accent}66`;
      }
    }

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      for (const ghost of tracked.current.values()) ghost.labelEl.remove();
      tracked.current.clear();
    };
  }, []);

  return (
    <div className="gg-ghost-layer" ref={layerRef} aria-hidden="true">
      <canvas ref={canvasRef} className="gg-ghost-canvas" />
    </div>
  );
}

/** The neutral pointer, tinted with the player's own accent. */
function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, accent: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 17);
  ctx.lineTo(4.4, 12.8);
  ctx.lineTo(7.2, 19);
  ctx.lineTo(10, 17.6);
  ctx.lineTo(7.2, 11.6);
  ctx.lineTo(13, 11.2);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.strokeStyle = 'rgba(6,8,12,.85)';
  ctx.lineWidth = 1.6;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const imageCache = new Map<string, HTMLImageElement>();

/** Draw a peer's uploaded cursor image, loaded once per data URL. */
function drawImageCursor(ctx: CanvasRenderingContext2D, ghost: Tracked) {
  let image = imageCache.get(ghost.image);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = ghost.image;
    imageCache.set(ghost.image, image);
  }
  if (!image.complete || !image.naturalWidth) return;
  const size = ghost.size;
  ctx.drawImage(image, ghost.x - size / 2, ghost.y - size / 2, size, size);
}
