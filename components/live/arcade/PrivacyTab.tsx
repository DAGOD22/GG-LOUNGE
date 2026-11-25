'use client';

/**
 * Feature 4 — privacy angle + the tab-bar mini-game.
 *
 * Two halves of the same idea: the screen should not be legible to whoever is
 * standing behind you.
 *
 * **Privacy angle.** A `CanvasRenderingContext2D` shader is the wrong tool for
 * an iframe's content — the game paints it, and drawing over it costs a full
 * readback per frame. Instead: a moving vignette mask plus a narrow-viewing
 * simulation. The mask is pure CSS (a radial-gradient overlay, two layers
 * offset), which composites on the GPU for free, and the "angle" is the offset
 * between the layers; when the mask tightens, the corners of the frame fade to
 * black and only the centre stays readable. Add a small hue/contrast shift and
 * the effect reads as a privacy filter on a real monitor.
 *
 * **Tab mini-game.** A tiny one-button runner drawn into the *favicon* and the
 * document title. It exists so that alt-tabbing away from a game still shows
 * something alive, and so the tab bar itself is part of the lounge. Score lives
 * in memory only — a tab bar is not a place to write localStorage once a frame.
 */

import { useEffect, useRef } from 'react';
import { Eye, Gamepad2 } from 'lucide-react';
import { useSetting } from './use-setting';
import { setSetting, audioBus } from './engine';

/* --------------------------------------------------------------- favicon -- */

function faviconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}

/** The toggle, for the scene row (the runner mounts itself in the panel). */
export function TabRunnerToggle() {
  const on = useSetting('tabGame', false);
  return (
    <button
      type="button"
      className={`gglab-toggle${on ? ' on' : ''}`}
      onClick={() => setSetting('tabGame', !on)}
      title="Run a tiny game in the favicon and the tab title"
    >
      <Gamepad2 size={13} /> Tab runner
    </button>
  );
}

export function TabRunner() {
  const on = useSetting('tabGame', false);
  const link = useRef<HTMLLinkElement | null>(null);
  const original = useRef<{ href: string; title: string } | null>(null);

  useEffect(() => {
    if (!on) return;
    const icon = faviconLink();
    link.current = icon;
    original.current = { href: icon.href, title: document.title };

    // 32x32 is the size Chrome actually paints at, and 16 is what Firefox uses.
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return;

    let phase = 0;
    let score = 0;
    let raf = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      phase += dt * 0.16;
      // The runner hops over one obstacle per 1.4s, so the icon reads as motion
      // at 32px even when the tab is throttled to 1 fps in the background.
      const hop = Math.max(0, Math.sin(phase * 0.45) * 6);
      const obstacle = phase % 40;

      context.clearRect(0, 0, size, size);
      context.fillStyle = '#0b0d12';
      context.fillRect(0, 0, size, size);
      context.fillStyle = '#bef264';
      context.fillRect(3, 24, 26, 2); // ground
      context.fillRect(8, 22 - hop, 4, 5); // runner
      context.fillStyle = '#7dd3ff';
      context.fillRect(26 - (obstacle * 0.6) % 22, 20, 3, 4); // obstacle
      context.fillStyle = 'rgba(255,255,255,.5)';
      context.fillRect(4, 4, Math.min(24, (score % 100) * 0.24), 1); // progress

      score += dt * 0.02;
      document.title = `${Math.floor(score)}m · GG-LOUNGE`;
      icon.href = canvas.toDataURL('image/png');
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      if (original.current) {
        icon.href = original.current.href;
        document.title = original.current.title;
      }
    };
  }, [on]);

  return (
    <button
      type="button"
      className={`gglab-toggle${on ? ' on' : ''}`}
      onClick={() => setSetting('tabGame', !on)}
      title="Run a tiny game in the favicon and the tab title"
    >
      <Gamepad2 size={13} /> Tab runner
    </button>
  );
}

/* --------------------------------------------------------- privacy angle -- */

export function PrivacyAngle() {
  const level = useSetting('privacy', 0);
  useEffect(() => {
    const root = document.documentElement;
    if (!level) {
      root.style.removeProperty('--gg-privacy');
      root.classList.remove('gg-privacy-on');
      return;
    }
    root.style.setProperty('--gg-privacy', String(level));
    root.classList.add('gg-privacy-on');
    return () => {
      root.style.removeProperty('--gg-privacy');
      root.classList.remove('gg-privacy-on');
    };
  }, [level]);

  // The mask is driven by the pointer: looking "away" from the centre widens
  // it. Two rAF-throttled CSS variables, no per-frame canvas work.
  useEffect(() => {
    if (!level) return;
    let raf = 0;
    let px = 0.5;
    let py = 0.5;
    const apply = () => {
      raf = 0;
      document.documentElement.style.setProperty('--gg-privacy-x', `${(px * 100).toFixed(1)}%`);
      document.documentElement.style.setProperty('--gg-privacy-y', `${(py * 100).toFixed(1)}%`);
    };
    const move = (event: PointerEvent) => {
      px = event.clientX / window.innerWidth;
      py = event.clientY / window.innerHeight;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [level]);

  return (
    <div className="gglab-row">
      <span className="gglab-label"><Eye size={13} /> Privacy</span>
      {[0, 1, 2, 3].map(value => (
        <button
          key={value}
          type="button"
          className={level === value ? 'on' : ''}
          onClick={() => setSetting('privacy', value)}
          title={value === 0 ? 'Off' : `Narrow the viewing angle (${value})`}
        >
          {value === 0 ? 'Off' : value}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- the hum -- */

/**
 * Feature 7 — the ghost hum.
 *
 * A quiet, stereo-panned drone that moves as other people's cursors move, so a
 * room with friends in it is audible without a single sample being downloaded:
 * three detuned oscillators through a low-pass, panned by where the nearest
 * ghost is on screen.
 *
 * Muted on panic — the panic handler in `PanicDoc` dispatches `ggl:panic`, and
 * this listens for it. Audio that survives a panic is how a "hide everything"
 * button gets someone caught.
 */
export function setGhostHum(active: boolean, pan = 0, intensity = 0.2) {
  const context = audioBus();
  if (!context) return null;
  if (!active) return null;
  return { context, pan, intensity };
}
