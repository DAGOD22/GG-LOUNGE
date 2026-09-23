'use client';

// Live-preview gallery for the animated cursor presets. One shared rAF drives
// every visible preview canvas; each canvas owns an isolated animation
// instance so particle systems and soft-body state never leak between tiles.

import { useEffect, useRef, useState } from 'react';
import {
  CURSOR_PACKS,
  CURSOR_PRESETS,
  type CursorPack,
  getCursorPreset,
  renderCursorPreview,
  type CursorInstance,
} from '@/lib/customization/cursor-presets';
import { useCustomization } from './CustomizationProvider';

export function CursorGallery() {
  const { settings, update } = useCustomization();
  const [pack, setPack] = useState<'all' | CursorPack>('all');
  const visible = pack === 'all' ? CURSOR_PRESETS : CURSOR_PRESETS.filter((p) => p.packs.includes(pack));
  const refs = useRef(new Map<string, HTMLCanvasElement>());
  const instances = useRef(new Map<string, CursorInstance>());

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let prevT = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = (now - start) / 1000;
      refs.current.forEach((canvas, id) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let inst = instances.current.get(id);
        if (!inst) {
          inst = getCursorPreset(id).create();
          instances.current.set(id, inst);
        }
        try {
          ctx.setTransform(2, 0, 0, 2, 0, 0);
          renderCursorPreview(ctx, inst, canvas.width / 2, canvas.height / 2, t + id.length * 1.7, prevT);
        } catch {
          // a bad frame in one preset must never stop the other previews
        }
      });
      prevT = t;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      instances.current.clear();
    };
  }, []);

  return (
    <div className="gg-cursor-grid" role="listbox" aria-label="Animated cursor presets">
      <div className="gg-chip-row" role="tablist" aria-label="Cursor packs">
        {CURSOR_PACKS.map((pk) => (
          <button key={pk.id} type="button" aria-pressed={pack === pk.id} className="gg-chip" onClick={() => setPack(pk.id)}>{pk.name}</button>
        ))}
      </div>
      {visible.map((preset) => (
        <button
          key={preset.id}
          type="button"
          role="option"
          aria-selected={settings.cursor.preset === preset.id}
          className={`gg-cursor-card${settings.cursor.preset === preset.id ? ' selected' : ''}`}
          onClick={() => update((s) => ({ ...s, cursor: { ...s.cursor, preset: preset.id } }))}
        >
          <canvas
            ref={(el) => {
              if (el) refs.current.set(preset.id, el);
              else refs.current.delete(preset.id);
            }}
            width={192}
            height={128}
          />
          <span>
            <i style={{ background: preset.accent }} />
            {preset.name}
          </span>
        </button>
      ))}
    </div>
  );
}
