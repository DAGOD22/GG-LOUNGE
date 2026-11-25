'use client';

/**
 * Feature 5 — voice commands and automatic panic.
 *
 * Two independent pieces that happen to share a microphone permission:
 *
 * **Voice commands.** `SpeechRecognition` (Chrome/Edge; Safari has it
 * prefixed, Firefox has neither) with a fixed grammar of intents — "full
 * screen", "mute", "panic", "next game", "split screen". Nothing is sent
 * anywhere by this component: the browser's own recogniser does the work and we
 * only see a transcript. Commands are matched on whole words so "panic" does not
 * fire on "picnic".
 *
 * **Loud-noise auto-panic.** An `AnalyserNode` on the same stream, sampled at
 * 10 Hz. When the RMS stays above a threshold for ~600 ms, the site runs its
 * panic action — this is the "someone walked in and it got loud" button, and it
 * has to be more reliable than the person's reflexes.
 *
 * The threshold is relative, not absolute: it calibrates against the quietest
 * ambient level it has seen, so a quiet room and a loud one both work. An
 * absolute dB threshold is the classic bug here — it either fires constantly on
 * a laptop fan or never fires at all with music playing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { audioBus } from './engine';
import { useSetting } from './use-setting';
import { setSetting } from './engine';

type Command = { match: RegExp; action: string; run: () => void };

/**
 * The grammar.
 *
 * Whole-word matches, ordered specific-to-general: "close" must not fire on
 * "close the door" any more than "panic" should fire on "picnic", and "split"
 * has to be checked before "close" ever could be. The buttons are found by
 * their existing accessible names rather than by wiring a callback chain,
 * because the voice layer must work on any page with a launcher without that
 * page knowing it exists.
 */
const commands: Command[] = [
  { match: /\b(full ?screen|fullscreen)\b/, action: 'fullscreen', run: () => document.querySelector<HTMLButtonElement>('.modal-actions button[aria-label*="ullscreen" i]')?.click() },
  { match: /\b(mute|silence|quiet)\b/, action: 'mute', run: () => document.querySelector<HTMLButtonElement>('.controls-toggle[title*="ound" i]')?.click() },
  { match: /\b(panic|hide|get me out)\b/, action: 'panic', run: () => window.dispatchEvent(new CustomEvent('ggl:panic')) },
  { match: /\b(split|two player)\b/, action: 'split', run: () => document.querySelector<HTMLButtonElement>('.controls-toggle[title*="plit" i]')?.click() },
  { match: /\b(close|exit|quit)\b/, action: 'close', run: () => document.querySelector<HTMLButtonElement>('.modal-actions button[aria-label="Close game"]')?.click() },
  { match: /\b(scroll down|next)\b/, action: 'next', run: () => window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }) },
  { match: /\b(scroll up|back)\b/, action: 'back', run: () => window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }) },
];

export function VoiceControl() {
  const armed = useSetting('voiceOn', false);
  const autoPanic = useSetting('autoPanic', true);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [meter, setMeter] = useState(0);
  const [error, setError] = useState('');
  const stream = useRef<MediaStream | null>(null);
  const recognition = useRef<{ stop: () => void } | null>(null);
  const quietFloor = useRef(0.06);

  const fire = useCallback((name: string) => {
    setHeard(name);
    window.dispatchEvent(new CustomEvent('gg:voice', { detail: { command: name } }));
  }, []);

  useEffect(() => {
    if (!armed) {
      recognition.current?.stop();
      recognition.current = null;
      stream.current?.getTracks().forEach(track => track.stop());
      stream.current = null;
      setListening(false);
      setMeter(0);
      return;
    }

    let cancelled = false;
    let raf = 0;

    (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false } });
        if (cancelled) {
          media.getTracks().forEach(track => track.stop());
          return;
        }
        stream.current = media;
        setError('');

        /* ---- loudness -------------------------------------------------- */
        const context = audioBus();
        if (context && autoPanic) {
          const source = context.createMediaStreamSource(media);
          const analyser = context.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          const buffer = new Float32Array(analyser.fftSize);
          let loudSince = 0;
          let lastSample = 0;

          const check = (now: number) => {
            raf = requestAnimationFrame(check);
            if (now - lastSample < 100) return; // 10 Hz is plenty
            lastSample = now;
            analyser.getFloatTimeDomainData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
            const rms = Math.sqrt(sum / buffer.length);
            setMeter(rms);

            // Track the floor downward slowly, upward immediately — a room that
            // gets quieter should raise sensitivity, a room that gets louder
            // should not make the detector deaf.
            quietFloor.current = rms < quietFloor.current
              ? quietFloor.current * 0.985 + rms * 0.015
              : Math.min(rms, quietFloor.current * 1.02 + 0.001);

            const threshold = Math.max(0.14, quietFloor.current * 4.2);
            if (rms > threshold) {
              if (!loudSince) loudSince = now;
              // 600ms of sustained noise, not a single clap. A door slam should
              // not end a session; a voice at the door should.
              if (now - loudSince > 600) {
                loudSince = 0;
                setSetting('voiceOn', false);
                window.dispatchEvent(new CustomEvent('ggl:panic', { detail: { reason: 'loud-noise' } }));
                fire('auto-panic');
                return;
              }
            } else {
              loudSince = 0;
            }
          };
          raf = requestAnimationFrame(check);
        }

        /* ---- recognition ----------------------------------------------- */
        const globalWindow = window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        };
        const Recognition = globalWindow.SpeechRecognition ?? globalWindow.webkitSpeechRecognition;
        if (!Recognition) {
          setError('This browser cannot recognise speech — the noise detector still works.');
          return;
        }
        const instance = new Recognition();
        instance.lang = navigator.language || 'en-AU';
        instance.continuous = true;
        instance.interimResults = false;
        instance.onresult = (event: SpeechEventLike) => {
          const text = event.results?.[event.results.length - 1]?.[0]?.transcript?.toLowerCase() ?? '';
          for (const command of commands) {
            if (command.match.test(text)) {
              command.run();
              fire(command.action);
              break;
            }
          }
        };
        instance.onerror = () => setError('Microphone access was interrupted.');
        instance.onend = () => {
          // Chrome stops after a pause; restart unless the person turned it off.
          if (!cancelled) {
            try { instance.start(); } catch { /* already running */ }
          }
        };
        try {
          instance.start();
          recognition.current = instance;
          setListening(true);
        } catch {
          setError('Could not start listening.');
        }
      } catch {
        setError('Microphone permission was denied.');
        setSetting('voiceOn', false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try { recognition.current?.stop(); } catch { /* not started */ }
      recognition.current = null;
      stream.current?.getTracks().forEach(track => track.stop());
      stream.current = null;
      setListening(false);
    };
  }, [armed, autoPanic, fire]);

  return (
    <>
      <button
        type="button"
        className={`gglab-toggle${armed ? ' on' : ''}`}
        onClick={() => setSetting('voiceOn', !armed)}
        title={armed ? 'Stop listening' : 'Voice commands — say “panic”, “full screen”, “mute”'}
        aria-pressed={armed}
      >
        {armed ? <Mic size={13} /> : <MicOff size={13} />} {listening ? 'Listening' : 'Voice'}
        {armed && <span className="gglab-meter" style={{ ['--v' as string]: Math.min(1, meter * 6) }} aria-hidden="true" />}
      </button>
      {armed && (
        <div className="gglab-row">
          <span className="gglab-label">Heard</span>
          <span className="gglab-heard">{heard || (error || 'say “full screen”, “mute” or “panic”')}</span>
        </div>
      )}
    </>
  );
}

/* The Web Speech API has no reliable DOM lib typing; these are the only fields
   this component touches, so a narrow local shape is more honest than `any`. */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechEventLike = {
  results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
};
