'use client';

/**
 * The secret layer's host.
 *
 * One component, mounted once in the root layout, that owns the whole layer:
 *
 *   · a single keystroke listener that feeds a rolling character buffer (the
 *     typed codes) and a rolling key buffer (the konami sequence);
 *   · the toggled overlays, rendered only while their secret is on;
 *   · discovery toasts — one per secret, first time only, no matter which
 *     part of the site discovered it (a chat command, the vault page, the
 *     runner's scoreboard all land here through the same subscription).
 *
 * It renders nothing visible until a secret fires, so the server render is an
 * empty fragment and there is nothing to hide from anyone who does not know.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isTypingTarget } from '@/lib/customization/settings';
import {
  SECRETS,
  SECRETS_KEY,
  TYPED_CODES,
  discover,
  isKonamiSuffix,
  isToggled,
  setToggle,
  subscribeSecrets,
  typedCodeMatch,
  type SecretId,
} from '@/lib/secrets';
import { CodeRain, Confetti, RetroMode, Snowfall, Spotlight, TimeWarp } from './Overlays';

/** Secrets that behave as switches: the same trigger toggles them off again. */
const TOGGLEABLE = new Set<SecretId>(['konami', 'matrix', 'snow', 'xyzzy', 'timewarp', 'ghost']);

type Toast = { key: number; name: string; body: string };

function discoveryBody(id: SecretId): string {
  switch (id) {
    case 'konami':
      return 'Godmode on. Type the sequence again to return to reality.';
    case 'shuffle':
      return 'A random game is loading…';
    case 'chat':
      return 'The chat now answers to /roll, /flip, /8ball and /pick.';
    case 'runner':
      return 'A best score is saved from here on.';
    case 'vault':
      return 'Ten secrets live here. The hints are the rest of the map.';
    default:
      return 'On. The same code switches it off.';
  }
}

export function SecretsProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toggles, setToggles] = useState({
    konami: false,
    matrix: false,
    snow: false,
    xyzzy: false,
    timewarp: false,
  });
  const [burst, setBurst] = useState(0);

  const buffer = useRef('');
  const keys = useRef<string[]>([]);
  /** Secrets already toasted this session (seeded from the store on mount). */
  const seen = useRef<Set<SecretId>>(new Set());

  const toast = useCallback((name: string, body: string) => {
    const key = Date.now() + Math.random();
    setToasts(current => [...current.slice(-2), { key, name, body }]);
    window.setTimeout(() => {
      setToasts(current => current.filter(entry => entry.key !== key));
    }, 4600);
  }, []);

  /**
   * One subscription drives both the overlays and the toasts: any component
   * that calls `discover` or `setToggle` — chat, the vault page, the runner —
   * lands here, wherever this provider is mounted.
   */
  const sync = useCallback(() => {
    for (const secret of SECRETS) {
      if (seen.current.has(secret.id)) continue;
      if (!isToggled(secret.id) && !isDiscoveredQuiet(secret.id)) continue;
      seen.current.add(secret.id);
      toast(secret.name, discoveryBody(secret.id));
    }
    setToggles({
      konami: isToggled('konami'),
      matrix: isToggled('matrix'),
      snow: isToggled('snow'),
      xyzzy: isToggled('xyzzy'),
      timewarp: isToggled('timewarp'),
    });
  }, [toast]);

  useEffect(() => {
    // Secrets found in earlier sessions are known, not news: seed the set
    // silently, then toast only what lands after mount.
    for (const secret of SECRETS) {
      if (isDiscoveredQuiet(secret.id)) seen.current.add(secret.id);
    }
    sync();
    const unsubscribe = subscribeSecrets(sync);
    // Another tab found something: the storage event is the cross-tab bell.
    const onStorage = (event: StorageEvent) => {
      if (event.key === SECRETS_KEY) sync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, [sync]);

  const activate = useCallback((id: SecretId) => {
    if (id === 'shuffle') {
      discover(id);
      import('@/lib/games')
        .then(({ games }) => {
          const pick = games[Math.floor(Math.random() * games.length)];
          if (!pick) return;
          window.location.assign(`/?game=${pick.id}`);
        })
        .catch(() => {});
      return;
    }
    if (!TOGGLEABLE.has(id)) return;
    const on = !isToggled(id);
    setToggle(id, on);
    if (id === 'konami' && on) setBurst(value => value + 1);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      // A secret that fires while someone types a message or a search is not
      // a secret, it is a bug. Text fields are off limits.
      if (isTypingTarget(event.target)) return;
      if (event.key.length === 1) {
        buffer.current = (buffer.current + event.key.toLowerCase()).slice(-16);
        const code = typedCodeMatch(buffer.current);
        if (code) {
          buffer.current = '';
          activate(TYPED_CODES[code]);
        }
      }
      keys.current = [...keys.current, event.key.toLowerCase()].slice(-12);
      if (isKonamiSuffix(keys.current)) {
        keys.current = [];
        activate('konami');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activate]);

  return (
    <>
      {toggles.konami && <RetroMode />}
      {toggles.matrix && <CodeRain />}
      {toggles.snow && <Snowfall />}
      {toggles.xyzzy && <Spotlight />}
      {toggles.timewarp && <TimeWarp />}
      {burst > 0 && <Confetti key={burst} />}
      <div className="gg-secret-toast-stack" aria-live="polite">
        {toasts.map(entry => (
          <div key={entry.key} className="gg-secret-toast">
            <strong>Secret found — {entry.name}</strong>
            <span>{entry.body}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Read without importing the whole store surface — a narrow local helper. */
function isDiscoveredQuiet(id: SecretId): boolean {
  return readFound().includes(id);
}

function readFound(): SecretId[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(SECRETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { found?: string[] };
    return (parsed.found ?? []) as SecretId[];
  } catch {
    return [];
  }
}
