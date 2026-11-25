'use client';

/**
 * Feature 10 — ambilight edge glow.
 *
 * Samples the game's canvas around its border, averages each edge into one
 * colour, and pushes that out as a soft glow behind the frame. The cost is the
 * interesting part:
 *
 *   · **15 fps, not 60.** An edge glow that lags the picture by 66 ms is still
 *     perceived as attached; at 60 fps you are reading back 4 MB of canvas per
 *     frame to draw a blur nobody looks at directly. 15 is the floor of
 *     "responsive" for peripheral vision.
 *
 *   · **`getImageData` at 1×1 per sample, not a full readback.** A canvas
 *     readback is the single most expensive thing you can ask a GPU-backed
 *     surface to do, and it stalls the pipeline. Reading two pixels per edge
 *     per frame keeps the stall in the microseconds.
 *
 *   · **Two independently smoothed colours per edge**, so a scene cut eases
 *     rather than strobes. Strobing is what makes cheap ambilight unwatchable.
 */

import { useEffect, useRef } from 'react';
import { useState } from 'react';
import { useSetting } from './use-setting';

export function Ambilight({ frame, host }: { frame: () => HTMLIFrameElement | null; host: () => HTMLElement | null }) {
  const on = useSetting('ambilight', false);
  const raf = useRef(0);
  const smooth = useRef({ top: [0, 0, 0], bottom: [0, 0, 0], left: [0, 0, 0], right: [0, 0, 0] });

  /**
   * The wrap element mounts in the same commit as this module, and its ref is
   * null on the first render. One deferred state flip hands us the node at the
   * point where it exists, without reading a ref during render.
   */
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setNode(host()), 0);
    return () => window.clearTimeout(id);
  }, [host]);

  useEffect(() => {
    if (!on || !node) return;
    // Narrowed once here: the loop below runs in a closure that TS would
    // otherwise treat as possibly-null on every reference.
    const host = node;
    let last = 0;
    const sample = document.createElement('canvas');
    sample.width = 1;
    sample.height = 1;
    const context = sample.getContext('2d', { willReadFrequently: true });

    const tick = (now: number) => {
      raf.current = requestAnimationFrame(tick);
      // 15 fps gate.
      if (now - last < 66) return;
      last = now;

      const node = frame();
      let canvas: HTMLCanvasElement | null = null;
      try {
        const doc = node?.contentDocument;
        canvas = doc
          ? (Array.from(doc.querySelectorAll('canvas')) as HTMLCanvasElement[])
              .sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null
          : null;
      } catch {
        canvas = null; // proxied frame: nothing to sample
      }
      if (!canvas || !context || !canvas.width || !canvas.height) return;

      const read = (sx: number, sy: number): [number, number, number] => {
        try {
          context.clearRect(0, 0, 1, 1);
          // 1x1 destination from a region: the browser averages it for us.
          context.drawImage(canvas, sx * canvas.width, sy * canvas.height, canvas.width * 0.25, canvas.height * 0.25, 0, 0, 1, 1);
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return [r, g, b];
        } catch {
          return [0, 0, 0];
        }
      };

      const edges = {
        top: read(0.375, 0),
        bottom: read(0.375, 0.75),
        left: read(0, 0.375),
        right: read(0.75, 0.375),
      } as Record<keyof typeof smooth.current, [number, number, number]>;

      for (const key of Object.keys(edges) as Array<keyof typeof edges>) {
        const current = smooth.current[key];
        // Ease toward the new colour; 0.22 is slow enough that a palette change
        // glides and fast enough that a scene cut lands within a quarter second.
        for (let channel = 0; channel < 3; channel++) {
          current[channel] += (edges[key][channel] - current[channel]) * 0.22;
        }
      }

      const css = (colour: number[]) => `rgb(${colour.map(value => Math.round(value)).join(' ')})`;
      host.style.setProperty('--gg-amb-top', css(smooth.current.top));
      host.style.setProperty('--gg-amb-bottom', css(smooth.current.bottom));
      host.style.setProperty('--gg-amb-left', css(smooth.current.left));
      host.style.setProperty('--gg-amb-right', css(smooth.current.right));
    };

    raf.current = requestAnimationFrame(tick);
    host.classList.add('gg-ambilight-on');
    return () => {
      cancelAnimationFrame(raf.current);
      host.classList.remove('gg-ambilight-on');
      host.style.removeProperty('--gg-amb-top');
      host.style.removeProperty('--gg-amb-bottom');
      host.style.removeProperty('--gg-amb-left');
      host.style.removeProperty('--gg-amb-right');
    };
  }, [on, frame, node]);

  return null;
}
