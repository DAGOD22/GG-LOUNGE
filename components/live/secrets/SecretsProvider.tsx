'use client';

/**
 * The secret layer's host.
 *
 * One component, mounted once in the root layout, that owns the whole layer:
 *
 *   · a single keystroke listener that feeds a rolling character buffer (the
 *     typed codes) and a rolling key buffer (the konami sequence);
 *   · the warp layer — every toggled effect applied to the document;
 *   · discovery toasts — one per secret, first time only, no matter which
 *     part of the site discovered it (a chat command, the vault page, the
 *     runner's scoreboard all land here through the same subscription).
 *
 * It renders nothing visible until a secret fires, so the server render is an
 * empty fragment and there is nothing to give the layer away.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isTypingTarget } from '@/lib/customization/settings';
import {
  SECRETS,
  SECRETS_KEY,
  TYPED_CODES,
  activeWarps,
  discover,
  isDiscovered,
  isKonamiSuffix,
  isToggled,
  setToggle,
  subscribeSecrets,
  typedCodeMatch,
  type SecretId,
} from '@/lib/secrets';
import { Confetti } from './Overlays';
import { WarpLayer } from './WarpLayer';

/** The key sequence that is its own code, matched outside the typed buffer. */
const KONAMI = 'konami' as const;

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
      return 'Every secret, every code, every switch — all in the open.';
    default:
      return 'On. The same code switches it off — or use its switch in the vault.';
  }
}

export function SecretsProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [active, setActive] = useState<SecretId[]>([]);
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
   * One subscription drives the warp layer and the toasts: any component that
   * calls `discover` or `setToggle` — chat, the vault page, the runner —
   * lands here, wherever this provider is mounted.
   */
  const sync = useCallback(() => {
    for (const secret of SECRETS) {
      if (seen.current.has(secret.id)) continue;
      if (!isDiscovered(secret.id)) continue;
      seen.current.add(secret.id);
      toast(secret.name, discoveryBody(secret.id));
    }
    setActive(activeWarps());
  }, [toast]);

  useEffect(() => {
    // Secrets found in earlier sessions are known, not news: seed the set
    // silently, then toast only what lands after mount.
    for (const secret of SECRETS) {
      if (isDiscovered(secret.id)) seen.current.add(secret.id);
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
    const on = !isToggled(id);
    setToggle(id, on);
    if (id === KONAMI && on) setBurst(value => value + 1);
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
        activate(KONAMI);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activate]);

  return (
    <>
      <WarpLayer active={active} />
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
