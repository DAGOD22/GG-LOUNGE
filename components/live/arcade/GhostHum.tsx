'use client';

/**
 * Feature 7 — the ghost hum (the engine half).
 *
 * A stereo-panned drone that follows the nearest ghost cursor. Three detuned
 * oscillators through a low-pass give it a theremin-ish quality that reads as
 * "someone is here" rather than "a sine wave is playing"; the pan and the
 * filter both track the ghost's position, so moving your friend's cursor across
 * the screen moves the sound across your headphones.
 *
 * Three rules this obeys:
 *   · **Opt-in.** Nothing is created until the toggle is on and the person has
 *     interacted with the page — `AudioContext` will be suspended until then
 *     anyway, and a hum nobody asked for is a bug, not a feature.
 *   · **Panic mutes it.** `ggl:panic` is the site-wide "hide me" event; audio
 *     that outlives it is how someone gets caught. The listener disconnects the
 *     gain, not just sets it to zero.
 *   · **One context.** `audioBus()` is shared with the noise detector; browsers
 *     cap contexts per page at around six, and creating one per toggle is how
 *     you reach that cap in a long session.
 */

import { useEffect, useRef } from 'react';
import { Volume2 } from 'lucide-react';
import { audioBus } from './engine';
import { useSetting } from './use-setting';
import { setSetting } from './engine';

type Node = {
  context: AudioContext;
  oscillators: OscillatorNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
};

/** Where the ghosts are, published by GhostCursors via a CustomEvent. */
export type GhostSample = { x: number; y: number; count: number };

export function GhostHum() {
  const on = useSetting('ghostHum', false);
  const nodes = useRef<Node | null>(null);

  useEffect(() => {
    if (!on) {
      const current = nodes.current;
      nodes.current = null;
      if (current) {
        current.gain.gain.setTargetAtTime(0, current.context.currentTime, 0.08);
        window.setTimeout(() => current.oscillators.forEach(oscillator => {
          try { oscillator.stop(); } catch { /* already stopped */ }
        }), 260);
      }
      return;
    }

    const context = audioBus();
    if (!context) return;

    const gain = context.createGain();
    gain.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    filter.Q.value = 6;
    const panner = context.createStereoPanner();
    panner.pan.value = 0;

    // A minor third apart, slightly detuned: beating between them is what makes
    // it sound alive instead of synthetic.
    const oscillators = [110, 130.81, 164.81].map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 2 ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency + (index - 1) * 0.6;
      oscillator.connect(filter);
      oscillator.start();
      return oscillator;
    });
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(context.destination);
    gain.gain.setTargetAtTime(0.035, context.currentTime, 0.6);

    nodes.current = { context, oscillators, gain, filter, panner };

    const onSample = (event: Event) => {
      const detail = (event as CustomEvent<GhostSample>).detail;
      if (!detail || !nodes.current) return;
      const { panner: stereo, filter: lowpass, gain: volume } = nodes.current;
      const now = context.currentTime;
      // -1..1 across the viewport.
      stereo.pan.setTargetAtTime(Math.max(-1, Math.min(1, (detail.x / window.innerWidth) * 2 - 1)) * 0.85, now, 0.15);
      // Closer to the centre of the screen = more present.
      const centre = 1 - Math.min(1, Math.hypot(detail.x - window.innerWidth / 2, detail.y - window.innerHeight / 2) / (window.innerWidth * 0.7));
      lowpass.frequency.setTargetAtTime(420 + centre * 900, now, 0.2);
      volume.gain.setTargetAtTime(detail.count ? 0.03 + centre * 0.025 : 0, now, 0.3);
    };

    const panic = () => {
      const current = nodes.current;
      nodes.current = null;
      if (!current) return;
      current.gain.gain.setTargetAtTime(0, current.context.currentTime, 0.02);
      window.setTimeout(() => current.oscillators.forEach(oscillator => {
        try { oscillator.stop(); } catch { /* already stopped */ }
      }), 120);
      setSetting('ghostHum', false);
    };

    window.addEventListener('gg:ghosts', onSample);
    window.addEventListener('ggl:panic', panic);

    return () => {
      window.removeEventListener('gg:ghosts', onSample);
      window.removeEventListener('ggl:panic', panic);
      const current = nodes.current;
      nodes.current = null;
      if (current) {
        current.gain.gain.setTargetAtTime(0, current.context.currentTime, 0.05);
        window.setTimeout(() => current.oscillators.forEach(oscillator => {
          try { oscillator.stop(); } catch { /* already stopped */ }
        }), 200);
      }
    };
  }, [on]);

  return (
    <button
      type="button"
      className={`gglab-toggle${on ? ' on' : ''}`}
      onClick={event => {
        // A click is the gesture the AudioContext needs; pass it along.
        void (event.currentTarget as HTMLElement).blur();
        setSetting('ghostHum', !on);
      }}
      title="Hear the room: a quiet drone panned to wherever your friends' cursors are"
    >
      <Volume2 size={13} /> Ghost hum
    </button>
  );
}
