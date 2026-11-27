'use client';

/**
 * The Vault — the page behind /secrets.
 *
 * This is the one place the secrets are written down, and it is reachable
 * only if someone told you the address: it is in no nav, no sitemap, no
 * robots-allowed list and no link directory. Inside, the page is honest with
 * its owner: every secret is listed, undiscovered ones show only their hint,
 * discovered ones show the code and a switch where one exists.
 *
 * The game lives here too, because a vault with nothing in it is just a page.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, DoorOpen, Eye, EyeOff, Gamepad2, RotateCcw, Shuffle, Sparkles } from 'lucide-react';
import {
  SECRETS,
  type SecretDef,
  discover,
  isDiscovered,
  isToggled,
  resetSecrets,
  runnerBest,
  setToggle,
  subscribeSecrets,
} from '@/lib/secrets';
import { VaultRunner } from './VaultRunner';

const TOGGLE_KINDS = new Set<SecretDef['kind']>(['typed-toggle', 'konami']);

export function VaultPage() {
  // `version` is the render clock: every store change bumps it, which both
  // re-renders and re-runs the memos below. The memos must not be computed
  // before mount — the store lives in localStorage, so a server render would
  // disagree with the client's first paint and React would warn.
  const [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Visiting the door is itself a secret. The store event re-renders the
    // cards; the bump is for callers outside the provider's subscription.
    discover('vault');
    setReady(true);
    setVersion(value => value + 1);
    return subscribeSecrets(() => setVersion(value => value + 1));
  }, []);

  const found = useMemo(() => SECRETS.filter(secret => isDiscovered(secret.id)).length, [version]);

  const cheatsheet = useMemo(
    () =>
      SECRETS.filter(secret => isDiscovered(secret.id))
        .map(secret => `${secret.name}: ${secret.code}`)
        .join('\n'),
    [version],
  );

  const copySheet = async () => {
    try {
      await navigator.clipboard.writeText(cheatsheet || 'Nothing discovered yet.');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard refused: the list stays on screen either way */
    }
  };

  const forget = () => {
    resetSecrets();
    setVersion(value => value + 1);
  };

  const luckyDip = () => {
    import('@/lib/games')
      .then(({ games }) => {
        const pick = games[Math.floor(Math.random() * games.length)];
        if (pick) window.location.assign(`/?game=${pick.id}`);
      })
      .catch(() => {});
  };

  return (
    <main className="vault">
      <header className="vault-head">
        <span className="vault-kicker">
          <DoorOpen size={14} /> unlisted · not indexed · not linked
        </span>
        <h1>The Vault</h1>
        <p>
          Ten things this site does that nobody is told about. No menu entry, no tour step, no shortcut card. You are
          here because you know something.
        </p>
        {/* The progress bar and cards read localStorage, so they render only
            after mount: a server render would guess, and the guess would
            disagree with this browser's real state. */}
        {ready ? (
          <div className="vault-progress" role="status">
            <span className="vault-progress-fill" style={{ width: `${(found / SECRETS.length) * 100}%` }} />
            <span className="vault-progress-label">
              {found} of {SECRETS.length} found
            </span>
          </div>
        ) : (
          <p className="vault-hint">Opening the vault…</p>
        )}
      </header>

      {ready && (
        <ul className="vault-grid">
        {SECRETS.map(secret => {
          const unlocked = isDiscovered(secret.id);
          const toggleable = TOGGLE_KINDS.has(secret.kind);
          const on = toggleable && isToggled(secret.id);
          return (
            <li key={secret.id} className={`vault-card${unlocked ? ' found' : ''}`}>
              <span className="vault-card-badge">{unlocked ? 'found' : 'undiscovered'}</span>
              <h2>
                {unlocked ? secret.name : '???'}
                {on && <em className="vault-on">on</em>}
              </h2>
              {unlocked ? (
                <>
                  <code className="vault-code">{secret.code}</code>
                  <div className="vault-actions">
                    {toggleable && (
                      <button type="button" className={on ? 'on' : ''} onClick={() => setToggle(secret.id, !on)}>
                        {on ? <EyeOff size={13} /> : <Eye size={13} />} {on ? 'Switch off' : 'Switch on'}
                      </button>
                    )}
                    {secret.id === 'shuffle' && (
                      <button type="button" onClick={luckyDip}>
                        <Shuffle size={13} /> Open a random game
                      </button>
                    )}
                    {secret.id === 'vault' && (
                      <span className="vault-static">You are standing in it.</span>
                    )}
                    {secret.id === 'runner' && (
                      <span className="vault-static">Best score so far: {runnerBest() || 'none yet'}</span>
                    )}
                    {secret.id === 'chat' && (
                      <span className="vault-static">Works in every chat room.</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="vault-hint">{secret.hint}</p>
              )}
            </li>
          );
        })}
        </ul>
      )}

      <section className="vault-runner" aria-label="Vault Runner">
        <h2>
          <Gamepad2 size={15} /> Vault Runner <span>· found here, plays here</span>
        </h2>
        <VaultRunner />
      </section>

      <footer className="vault-foot">
        <button type="button" onClick={copySheet}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy your cheatsheet'}
        </button>
        <button type="button" className="danger" onClick={forget}>
          <RotateCcw size={13} /> Forget everything
        </button>
        <span className="vault-note">
          <Sparkles size={13} /> Found on this device only. Nothing about secrets is sent anywhere.
        </span>
        <Link href="/">← back to the lounge</Link>
      </footer>
    </main>
  );
}
