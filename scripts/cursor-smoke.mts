// Exercises every cursor preset's draw() + the gallery preview renderer
// against a strict mock 2D context. Any typo'd method or thrown frame would
// silently kill the real rAF loops (cursor invisible, "nothing happens"),
// so this must stay green. Run: pnpm test:cursors
import { performance } from 'node:perf_hooks';

// minimal DOM for presets that build offscreen canvases at create() time
const CTX_METHODS = new Set([
  'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo',
  'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'fill', 'stroke', 'clip',
  'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'measureText',
  'drawImage', 'setLineDash', 'getLineDash',
]);
const CTX_PROPS = new Set([
  'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha',
  'globalCompositeOperation', 'shadowColor', 'shadowBlur', 'shadowOffsetX',
  'shadowOffsetY', 'font', 'textAlign', 'textBaseline', 'filter', 'imageSmoothingEnabled',
  'canvas', 'miterLimit', 'lineDashOffset',
]);

function makeCtx(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    lineJoin: 'miter', globalAlpha: 1, globalCompositeOperation: 'source-over',
    shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    canvas: { width: 64, height: 64 },
  };
  const gradient = { addColorStop() {} };
  return new Proxy({} as Record<string | symbol, unknown>, {
    get(_t, prop: string) {
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient' || prop === 'createConicGradient') {
        return () => gradient;
      }
      if (prop === 'getLineDash') return () => [];
      if (CTX_METHODS.has(prop)) return () => {};
      if (prop in state) return state[prop];
      throw new Error(`unknown ctx member read: ${String(prop)}`);
    },
    set(_t, prop: string, value) {
      if (CTX_PROPS.has(prop) || prop in state) {
        state[prop] = value;
        return true;
      }
      throw new Error(`unknown ctx member write: ${String(prop)}`);
    },
  }) as CanvasRenderingContext2D;
}

(globalThis as Record<string, unknown>).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }),
};

// import AFTER the document shim exists
const { CURSOR_PRESETS, getCursorPreset, renderCursorPreview } = await import(
  '../lib/customization/cursor-presets'
);

let failures = 0;
const ctx = makeCtx();

// every preset: 600 frames across all hover contexts, clicks, fast motion, reduced
for (const preset of CURSOR_PRESETS) {
  try {
    const inst = getCursorPreset(preset.id).create();
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) {
      const hover = (['default', 'link', 'text', 'grab', 'media', 'disabled'] as const)[i % 6];
      const x = 100 + i * 0.7;
      const y = 100 + Math.sin(i / 9) * 40;
      inst.draw(ctx, {
        x,
        y,
        rx: x - 2,
        ry: y - 1,
        vx: i % 37 === 0 ? 30 : Math.sin(i / 5) * 3,
        vy: Math.cos(i / 7) * 3,
        speed: i % 37 === 0 ? 30 : 3,
        hover,
        hoverAmt: i > 60 ? 1 : i / 60,
        pressAmt: i % 53 < 8 ? 1 : 0,
        click: i % 53 === 0,
        scale: 1.25,
        t: t0 + i * 16.7,
        dt: 16.7,
        reduced: i % 200 > 150,
        vw: 1280,
        vh: 800,
        rect: hover === 'link' ? { x: x - 20, y: y - 10, w: 40, h: 20 } : null,
      } as never);
    }
    inst.stop?.();
  } catch (err) {
    failures++;
    console.error(`FAIL draw ${preset.id}:`, (err as Error).message);
  }
}

// gallery preview renderer: instance API + animated state cycle
for (const preset of CURSOR_PRESETS) {
  try {
    const pctx = makeCtx();
    const inst = getCursorPreset(preset.id).create();
    for (let i = 0; i < 90; i++) {
      renderCursorPreview(pctx as never, inst as never, 90, 90, i * 0.08, (i - 1) * 0.08);
    }
    inst.stop?.();
  } catch (err) {
    failures++;
    console.error(`FAIL preview ${preset.id}:`, (err as Error).message);
  }
}

console.log(`${CURSOR_PRESETS.length} presets exercised — ${failures} failures`);
process.exit(failures ? 1 : 0);
