"use client";

// Full-screen canvas that replaces the native cursor with an animated preset.
// - spring physics: main point + a slower lagging "ring" point
// - contextual states via pointerover delegation (link / text / media / grab / disabled)
//   with the hovered element's bounding box captured for magnetic highlights
// - press + click-pulse signals, ribbon trail, reduced-motion + touch fallbacks
// - hides while the pointer is inside an iframe (native cursor takes over there)

import { useEffect, useRef } from "react";
import {
  ANIMATED_CURSOR_IDS,
  drawCursorScene,
  getCursorPreset,
  type CursorFrame,
  type CursorInstance,
  type CursorRect,
  type HoverState,
} from "@/lib/customization/cursor-presets";
import type { Settings } from "@/lib/customization/settings";

interface Props {
  cursor: Settings["cursor"];
}

const TRAIL_MAX = 42;

function detectHover(el: Element | null): { state: HoverState; el: Element | null } {
  if (!el || !el.closest) return { state: "default", el: null };
  const target = el as HTMLElement;
  const disabled = target.closest(":disabled,[aria-disabled='true']");
  if (disabled) return { state: "disabled", el: disabled };
  const link = target.closest(
    "a[href],button:not([disabled]),[role='button'],input[type='submit'],input[type='button'],input[type='reset'],summary,label[for],select,[tabindex]:not([tabindex='-1']),.cursor-pointer",
  );
  if (link) return { state: "link", el: link };
  const text = target.closest(
    "input:not([type='submit']):not([type='button']):not([type='reset']):not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']),textarea,[contenteditable='true'],[contenteditable='']",
  );
  if (text) return { state: "text", el: text };
  const grab = target.closest("[draggable='true'],.cursor-grab");
  if (grab) return { state: "grab", el: grab };
  const media = target.closest("video,audio,img,picture,canvas,svg image,[data-cursor='media']");
  if (media) return { state: "media", el: media };
  return { state: "default", el: null };
}

export function AnimatedCursor({ cursor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // map their settings model onto the engine's knobs
  const settings = {
    enabled: ANIMATED_CURSOR_IDS.includes(cursor.preset),
    preset: ANIMATED_CURSOR_IDS.includes(cursor.preset) ? cursor.preset : "lounge",
    scale: Math.max(0.5, Math.min(2, cursor.size / 32)),
    speed: cursor.speed,
    trail: cursor.trail,
    trailLength: 0.5,
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // coarse pointer (touch) devices never get a custom cursor
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.documentElement.classList.add("ggl-cursor-on");

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let vw = window.innerWidth;
    let vh = window.innerHeight;
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
    window.addEventListener("resize", resize);

    /* pointer state */
    let tx = vw / 2;
    let ty = vh / 2;
    let x = tx;
    let y = ty;
    let px = tx;
    let py = ty;
    let rx = tx;
    let ry = ty;
    let vx = 0;
    let vy = 0;
    let speed = 0;
    let hover: HoverState = "default";
    let hoverAmt = 0;
    let press = false;
    let pressAmt = 0;
    let clickPulse = false;
    let visible = false;
    let inIframe = false;
    let startTime = performance.now();
    const trail: { x: number; y: number }[] = [];

    /* hovered element box (target + smoothed) */
    let targetRect: CursorRect | null = null;
    let animRect: CursorRect | null = null;

    let instance: CursorInstance = getCursorPreset(settingsRef.current.preset).create();

    /* per-context spring stiffness: text feels tight & precise, games loose,
       disabled controls heavy — the pointer "weighs" different per surface */
    const CTX_K: Record<HoverState, number> = {
      text: 1.4,
      link: 1.05,
      default: 1,
      grab: 0.9,
      media: 0.95,
      disabled: 0.8,
    };
    /* magnetic pull of the lagging ring toward the hovered element's centre */
    const MAG: Record<HoverState, number> = {
      link: 0.38,
      media: 0.26,
      grab: 0.18,
      default: 0,
      text: 0,
      disabled: 0,
    };
    const hist: { x: number; y: number }[] = [];

    function onMove(e: PointerEvent) {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      tx = e.clientX;
      ty = e.clientY;
      if (!visible) {
        visible = true;
        x = rx = tx;
        y = ry = ty;
        px = x;
        py = y;
      }
      const t = e.target as Element | null;
      if (t && t.closest && t.closest("iframe")) {
        inIframe = true;
        return;
      }
      inIframe = false;
      const det = detectHover(t);
      if (det.state !== hover) {
        hover = det.state;
        hoverAmt = 0;
        if (det.el && (det.state === "link" || det.state === "media")) {
          const r = (det.el as HTMLElement).getBoundingClientRect();
          targetRect = { x: r.left, y: r.top, w: r.width, h: r.height };
        } else {
          targetRect = null;
        }
      }
    }
    function onDown(e: PointerEvent) {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      press = true;
      clickPulse = true;
    }
    function onUp() {
      press = false;
    }
    function onLeaveDoc(e: MouseEvent) {
      if (!e.relatedTarget) visible = false;
    }
    function onScroll() {
      // element boxes move with scroll; re-measure lazily on next move
      targetRect = null;
      if (hover === "link" || hover === "media") hoverAmt = Math.min(hoverAmt, 0.4);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true, capture: true });
    window.addEventListener("pointerup", onUp, { passive: true, capture: true });
    document.addEventListener("mouseleave", onLeaveDoc);
    window.addEventListener("scroll", onScroll, { passive: true });

    let raf = 0;
    let prev = performance.now();

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const s = settingsRef.current;
      const dt = Math.min(64, now - prev);
      prev = now;
      const t = (now - startTime) / 1000;

      const k = (0.16 + s.speed * 0.34) * CTX_K[hover];
      const k2 = (0.07 + s.speed * 0.16) * (hover === "text" ? 1.3 : 1);
      const kk = dt / 16.67;

      px = x;
      py = y;
      x += (tx - x) * k * kk;
      y += (ty - y) * k * kk;
      // magnetic snap: the lag ring leans into the hovered element's centre
      let ringTx = x;
      let ringTy = y;
      const mag = MAG[hover];
      if (targetRect && mag > 0) {
        const pull = mag * hoverAmt;
        ringTx = x + (targetRect.x + targetRect.w / 2 - x) * pull;
        ringTy = y + (targetRect.y + targetRect.h / 2 - y) * pull;
      }
      rx += (ringTx - rx) * k2 * kk;
      ry += (ringTy - ry) * k2 * kk;

      // motion-blur history (velocity ghosts)
      hist.unshift({ x, y });
      if (hist.length > 6) hist.length = 6;
      vx = x - px;
      vy = y - py;
      speed = Math.hypot(vx, vy);

      hoverAmt = Math.min(1, hoverAmt + 0.14 * kk);
      pressAmt += ((press ? 1 : 0) - pressAmt) * 0.22 * kk;

      // smooth the element highlight box
      if (targetRect) {
        if (!animRect) animRect = { ...targetRect };
        animRect.x = lerp(animRect.x, targetRect.x, 0.28 * kk);
        animRect.y = lerp(animRect.y, targetRect.y, 0.28 * kk);
        animRect.w = lerp(animRect.w, targetRect.w, 0.28 * kk);
        animRect.h = lerp(animRect.h, targetRect.h, 0.28 * kk);
      } else if (animRect) {
        animRect = hoverAmt > 0.05 ? animRect : null;
      }

      if (s.trail && visible) {
        trail.unshift({ x, y });
        const maxLen = Math.max(4, Math.round(TRAIL_MAX * (0.25 + s.trailLength * 0.75)));
        if (trail.length > maxLen) trail.length = maxLen;
      } else if (trail.length) {
        trail.length = 0;
      }

      const c = ctx!;
      c.clearRect(0, 0, vw, vh);
      const click = clickPulse;
      clickPulse = false;
      if (!visible || inIframe) return;

      const f: CursorFrame = {
        x,
        y,
        rx,
        ry,
        vx,
        vy,
        speed: reduced ? 0 : speed,
        t: reduced ? 0 : t,
        dt,
        hover,
        hoverAmt,
        pressAmt,
        click: click && !reduced,
        scale: s.scale,
        reduced,
        vw,
        vh,
        rect: targetRect,
      };
      const useTrail = s.trail && !reduced ? trail : null;
      // velocity ghosts: soft accent after-images on fast flicks
      if (!reduced && speed > 6 && hist.length > 4) {
        const accent = getCursorPreset(s.preset).accent;
        dot(c, hist[2].x, hist[2].y, 3 * s.scale, accent, 0.12);
        dot(c, hist[4].x, hist[4].y, 2.4 * s.scale, accent, 0.06);
      }
      drawCursorScene(c, instance, f, useTrail, animRect);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("mouseleave", onLeaveDoc);
      window.removeEventListener("scroll", onScroll);
      document.documentElement.classList.remove("ggl-cursor-on");
    };
  }, [settings.enabled, settings.preset]);

  if (!settings.enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483000,
      }}
    />
  );
}

function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.4, r), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, t);
}
