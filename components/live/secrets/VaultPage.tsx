'use client';

/**
 * The Vault — the page behind /secrets.
 *
 * Everything is listed openly: all sixty secrets, every code, every switch.
 * Nothing here is hidden behind a discovery gate — the secrecy lives in the
 * address, not in the page. The page is in no nav, no sitemap, no
 * robots-allowed list and no link directory, and it noindexes itself, so the
 * only way in is to already know it exists.
 *
 * The game lives here too, because a vault with nothing in it is just a page.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, DoorOpen, Gamepad2, Eye, EyeOff, RotateCcw, Search, Shuffle, Sparkles, Trophy } from 'lucide-react';
import {
  GROUP_LABELS,
  SECRETS,
  type SecretDef,
  type SecretGroup,
  clearWarps,
  discover,
  isDiscovered,
  isToggled,
  resetSecrets,
  runnerBest,
  setToggle,
  subscribeSecrets,
} from '@/lib/secrets';
import { clearDiary, diaryWhen, readDiary } from '@/lib/play-diary';
import { readHidden, unhideAll } from '@/lib/hidden-games';
import { VaultRunner } from './VaultRunner';

const GROUP_ORDER: SecretGroup[] = ['classic', 'theme', 'layout', 'text', 'overlay', 'behavior'];

/** Kinds whose secret is an on/off switch with a real visual or behaviour. */
function isSwitchable(secret: SecretDef): boolean {
  return secret.kind === 'typed-toggle' || secret.kind === 'konami';
}

export function VaultPage() {
  // `version` is the render clock: every store change bumps it, which both
  // re-renders and re-runs the memos below. The store lives in localStorage,
  // so nothing that reads it renders before mount — a server render would
  // disagree with this browser's real state and React would warn.
  const [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [diaryOpen, setDiaryOpen] = useState(false);

  useEffect(() => {
    // Visiting the door is itself a secret.
    discover('vault');
    setReady(true);
    setVersion(value => value + 1);
    return subscribeSecrets(() => setVersion(value => value + 1));
  }, []);

  const found = useMemo(() => SECRETS.filter(secret => isDiscovered(secret.id)).length, [version]);
  const liveCount = useMemo(() => SECRETS.filter(secret => isToggled(secret.id)).length, [version]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return SECRETS.filter(secret =>
      `${secret.name} ${secret.code} ${secret.about} ${secret.group}`.toLowerCase().includes(needle),
    );
  }, [query]);

  const cheatsheet = useMemo(
    () => SECRETS.map(secret => `${secret.name}: ${secret.code}`).join('\n'),
    [version],
  );

  const copySheet = async () => {
    try {
      await navigator.clipboard.writeText(cheatsheet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard refused: the list stays on screen either way */
    }
  };

  const luckyDip = () => {
    import('@/lib/games')
      .then(({ games }) => {
        const pick = games[Math.floor(Math.random() * games.length)];
        if (pick) window.location.assign(`/?game=${pick.id}`);
      })
      .catch(() => {});
  };

  const groups: SecretGroup[] = filtered
    ? [...new Set(filtered.map(secret => secret.group))].sort((a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b))
    : GROUP_ORDER;

  const ofGroup = (group: SecretGroup): SecretDef[] =>
    (filtered ?? SECRETS).filter(secret => secret.group === group);

  return (
    <main className="vault">
      <header className="vault-head">
        <span className="vault-kicker">
          <DoorOpen size={14} /> unlisted · not indexed · not linked
        </span>
        <h1>The Vault</h1>
        <p>
          Every secret this site has, listed in the open — all {SECRETS.length} of them, every code, every switch.
          The only thing secret about this page is its address. Nothing here is linked, indexed, or told to anyone.
        </p>
        {ready ? (
          <>
            <div className="vault-progress" role="status">
              <span className="vault-progress-fill" style={{ width: `${(found / SECRETS.length) * 100}%` }} />
              <span className="vault-progress-label">
                {found} of {SECRETS.length} tried · {liveCount} live right now
              </span>
            </div>
            <div className="vault-tools">
              <label className="vault-search">
                <Search size={13} aria-hidden="true" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Filter by name, code or effect…"
                  aria-label="Filter secrets"
                />
              </label>
              <button type="button" onClick={() => clearWarps()} disabled={!liveCount}>
                <RotateCcw size={13} /> Switch every warp off{liveCount ? ` (${liveCount})` : ''}
              </button>
            </div>
          </>
        ) : (
          <p className="vault-hint">Opening the vault…</p>
        )}
      </header>

      {ready &&
        groups.map(group => {
          const list = ofGroup(group);
          if (!list.length) return null;
          return (
            <section key={group} className="vault-group">
              <h2>{GROUP_LABELS[group]}</h2>
              <ul className="vault-grid">
                {list.map(secret => {
                  const toggleable = isSwitchable(secret);
                  const on = toggleable && isToggled(secret.id);
                  return (
                    <li key={secret.id} className={`vault-card${on ? ' live' : ''}${isDiscovered(secret.id) ? ' found' : ''}`}>
                      <span className="vault-card-badge">{on ? 'live' : 'off'}</span>
                      <h3>{secret.name}</h3>
                      <code className="vault-code">{secret.code}</code>
                      <p className="vault-about">{secret.about}</p>
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
                        {secret.id === 'vault' && <span className="vault-static">You are standing in it.</span>}
                        {secret.id === 'runner' && (
                          <span className="vault-static">
                            <Trophy size={12} /> Best score so far: {runnerBest() || 'none yet'}
                          </span>
                        )}
                        {secret.id === 'chat' && <span className="vault-static">Works in every chat room.</span>}
                        {secret.id === 'ghost' && <span className="vault-static">Silences presence until switched off.</span>}
                        {secret.id === 'counter' && (
                          <span className="vault-static">Real visitors, all devices — the strip sits at the bottom edge of every page.</span>
                        )}
                        {secret.id === 'incognito' && (
                          <span className="vault-static">History is wiped the moment it turns on; keep it on to stay unwritten.</span>
                        )}
                        {secret.id === 'resume' && (
                          <span className="vault-static">Look for the ▶ pill at the bottom-left of any page.</span>
                        )}
                        {secret.id === 'context' && (
                          <button type="button" onClick={() => unhideAll()} disabled={!ready || readHidden().length === 0}>
                            <RotateCcw size={13} /> Restore hidden games{ready && readHidden().length ? ` (${readHidden().length})` : ''}
                          </button>
                        )}
                        {secret.id === 'diary' && (() => {
                          const diary = ready ? readDiary() : [];
                          return (
                            <>
                              <button type="button" onClick={() => setDiaryOpen(value => !value)} disabled={!diary.length}>
                                {diaryOpen ? 'Close the diary' : `Read the diary (${diary.length})`}
                              </button>
                              {diary.length > 0 && (
                                <button type="button" onClick={() => { clearDiary(); setDiaryOpen(false); setVersion(value => value + 1); }}>
                                  <RotateCcw size={13} /> Clear the diary
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      {secret.id === 'diary' && diaryOpen && (
                        <div className="vault-diary">
                          {readDiary().slice(-40).reverse().map((entry, index) => (
                            <div key={`${entry.at}-${index}`} className="vault-diary-row">
                              <span>{entry.title}</span>
                              <time>{diaryWhen(entry.at)}</time>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

      {ready && filtered && !filtered.length && (
        <p className="vault-hint">Nothing matches “{query}”. Every secret is listed — try fewer words.</p>
      )}

      <section className="vault-runner" aria-label="Vault Runner">
        <h2>
          <Gamepad2 size={15} /> Vault Runner <span>· the hidden game, plays here</span>
        </h2>
        <VaultRunner />
      </section>

      <footer className="vault-foot">
        <button type="button" onClick={copySheet}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy every code'}
        </button>
        <button type="button" className="danger" onClick={() => resetSecrets()}>
          <RotateCcw size={13} /> Forget everything
        </button>
        <span className="vault-note">
          <Sparkles size={13} /> Kept on this device only. Nothing about secrets is sent anywhere.
        </span>
        <Link href="/">← back to the lounge</Link>
      </footer>
    </main>
  );
}
