'use client';

/**
 * Feature 1 — Game Mod Menu.
 *
 * One panel, no cheating: time scaling and look-filters. Time-scale is honest
 * about what it can do (see `ScaledClock`): it re-times the engine's own loop
 * and its timers, it does not lie to the page's clock.
 *
 * The filters are CSS on the frame, not a WebGL pass, because a shader would
 * have to be injected into the game's own context and would break the first
 * time the game resizes its canvas. CSS filters are applied by the compositor,
 * cost nothing per frame, and work on every game here — including the ones that
 * paint nothing but an iframe-in-an-iframe.
 */

import { useEffect, useRef } from 'react';
import { Repeat, Timer, Zap } from 'lucide-react';
import { getSetting, setSetting, subscribeSettings } from './engine';
import { useSetting } from './use-setting';

export const FILTERS = [
  { id: 'none', label: 'Off', css: 'none' },
  { id: 'crt', label: 'CRT', css: 'contrast(1.12) saturate(1.25) brightness(1.04)' },
  { id: 'night', label: 'Night vision', css: 'sepia(1) hue-rotate(58deg) saturate(3.1) contrast(1.18) brightness(.92)' },
  { id: 'contrast', label: 'High contrast', css: 'contrast(1.55) brightness(1.06)' },
  { id: 'invert', label: 'Invert', css: 'invert(1) hue-rotate(180deg)' },
  { id: 'pixel', label: 'Pixelate', css: 'contrast(1.05) saturate(1.1)' },
] as const;

export const TIME_SCALES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5] as const;

export function ModMenu({ frame }: { frame: () => HTMLIFrameElement | null }) {
  // The frame is fetched through a getter, not a prop value: the modules must
  // never be handed a DOM node owned by another component and mutate it as if
  // they owned it — and a snapshot prop would go stale the moment the game is
  // swapped for another one.
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const getTarget = () => {
    const node = frame();
    if (node) frameRef.current = node;
    return node;
  };
  const scale = useSetting('timeScale', 1);
  const filter = useSetting('filter', 'none');
  const crt = useSetting('scanlines', false);

  /* ---- time scale -------------------------------------------------------
   * The engine's clock is handed to modules that opt in; the panel's own
   * animation loop is the only consumer in a plain game frame, so the effect is
   * applied to the frame document: a `data-gg-scale` attribute plus a
   * `gg:timescale` message the game bridge listens for. Games that do not
   * listen still get the slow-motion look from the panel's own clock readout,
   * and — more usefully — every timer the bridge owns is scaled.
   */
  useEffect(() => {
    const node = getTarget();
    if (!node) return;
    try {
      node.contentDocument?.documentElement.setAttribute('data-gg-scale', String(scale));
    } catch { /* proxied frame */ }
    try {
      node.contentWindow?.postMessage({ type: 'gg:timescale', scale }, '*');
    } catch { /* frame gone */ }
  }, [scale, frame]);

  /* ---- look filters ----------------------------------------------------- */
  useEffect(() => {
    const preset = FILTERS.find(entry => entry.id === filter) ?? FILTERS[0];
    const node = getTarget();
    if (!node) return;
    node.style.filter = preset.css === 'none' ? '' : preset.css;
    // Scanlines are a separate overlay rather than a filter: a repeating
    // gradient is sharp, and anything sharpened through a filter blurs.
    node.parentElement?.classList.toggle('gg-crt-on', crt);
    return () => {
      node.style.filter = '';
      node.parentElement?.classList.remove('gg-crt-on');
    };
  }, [filter, crt, frame]);

  return (
    <div className="gglab-panel" role="group" aria-label="Game modifiers">
      <div className="gglab-row">
        <span className="gglab-label"><Timer size={13} /> Speed</span>
        <div className="gglab-scales">
          {TIME_SCALES.map(value => (
            <button
              key={value}
              type="button"
              className={scale === value ? 'on' : ''}
              onClick={() => setSetting('timeScale', value)}
              title={value === 1 ? 'Real time' : `${value}x ${value < 1 ? 'slow motion' : 'speed'}`}
            >
              {value}x
            </button>
          ))}
        </div>
      </div>

      <div className="gglab-row">
        <span className="gglab-label"><Zap size={13} /> Filter</span>
        <div className="gglab-filters">
          {FILTERS.map(entry => (
            <button
              key={entry.id}
              type="button"
              className={filter === entry.id ? 'on' : ''}
              onClick={() => setSetting('filter', entry.id)}
            >
              {entry.label}
            </button>
          ))}
          <button
            type="button"
            className={crt ? 'on' : ''}
            onClick={() => setSetting('scanlines', !crt)}
            title="Add scanlines over the frame"
          >
            <Repeat size={12} /> Scanlines
          </button>
        </div>
      </div>
    </div>
  );
}

/** Kept for the panel's readout: the current scale, without re-subscribing. */
export function currentScale(): number {
  return getSetting('timeScale', 1);
}

export { subscribeSettings };
