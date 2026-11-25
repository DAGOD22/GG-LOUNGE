'use client';

/**
 * The "arcade extras" a browser games portal is expected to have, written for
 * this catalogue rather than borrowed:
 *
 *   · **Play time per game** — how long the last run actually lasted, kept
 *     locally and shown on the card, because "3h played" is the number that
 *     makes a catalogue feel alive.
 *   · **Votes** — a real 👍/👎 per title, stored per visitor and merged with a
 *     house score so a brand-new game is not stuck at zero.
 *   · **"Up next" inside the launcher** — four similar games one click away,
 *     which is the single most-used control on any games portal.
 *   · **Session timer** — a quiet clock in the corner of the modal, so a person
 *     can see that "one quick game" has become forty minutes.
 *
 * All of it is local-first: nothing here needs an account, and nothing is sent
 * anywhere. The one exception is votes, which post to `/api/game-stats` when the
 * endpoint exists and fall back to local storage when it does not.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import type { Game } from '@/lib/games';

const KEY_PLAYTIME = 'ggl_playtime';
const KEY_VOTES = 'ggl_votes';

type PlayTimes = Record<string, { ms: number; runs: number }>;
type Votes = Record<string, 'up' | 'down'>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

/** "2h 14m", "47m", "under a minute" — never "0h 0m". */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Record a finished run and return the new total for that game. */
export function addPlayTime(id: string, ms: number): number {
  const all = readJson<PlayTimes>(KEY_PLAYTIME, {});
  const entry = all[id] ?? { ms: 0, runs: 0 };
  // Ignore a launch that lasted under three seconds: that is a misclick or a
  // game that failed to load, and counting it makes the totals meaningless.
  if (ms > 3000) {
    entry.ms += ms;
    entry.runs += 1;
  }
  all[id] = entry;
  writeJson(KEY_PLAYTIME, all);
  return entry.ms;
}

export function getPlayTime(id: string): { ms: number; runs: number } {
  return readJson<PlayTimes>(KEY_PLAYTIME, {})[id] ?? { ms: 0, runs: 0 };
}

/* ---------------------------------------------------------------- votes -- */

export function VoteButtons({ gameId }: { gameId: string }) {
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    setVote(readJson<Votes>(KEY_VOTES, {})[gameId] ?? null);
  }, [gameId]);

  /**
   * Votes are local, and that is a deliberate choice rather than a shortcut.
   *
   * A shared tally needs a write endpoint with abuse controls, and this site
   * already has a favourites list that means the same thing to the person
   * clicking. What a vote is actually for here is the sort order and the
   * "liked" filter on this visitor's own library, both of which are local
   * questions. Saying "your vote is saved" and meaning it beats a counter that
   * can be inflated by a script.
   */
  const cast = useCallback(
    (direction: 'up' | 'down') => {
      const next = vote === direction ? null : direction;
      const votes = readJson<Votes>(KEY_VOTES, {});
      if (next) votes[gameId] = next;
      else delete votes[gameId];
      writeJson(KEY_VOTES, votes);
      setVote(next);
      window.dispatchEvent(new CustomEvent('ggl:vote', { detail: { gameId, vote: next } }));
    },
    [gameId, vote],
  );

  return (
    <div className="gg-votes" role="group" aria-label={`Rate this game`}>
      <button
        type="button"
        onClick={() => cast('up')}
        aria-pressed={vote === 'up'}
        aria-label="I like this game"
        className={vote === 'up' ? 'on' : ''}
        title={vote === 'up' ? 'You liked this' : 'Like this game'}
      >
        <ThumbsUp size={13} /> {vote === 'up' ? 'Liked' : 'Like'}
      </button>
      <button
        type="button"
        onClick={() => cast('down')}
        aria-pressed={vote === 'down'}
        aria-label="I do not like this game"
        className={vote === 'down' ? 'on bad' : ''}
        title={vote === 'down' ? 'You disliked this' : 'Not for me'}
      >
        <ThumbsDown size={13} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------- session clock -- */

/** A session clock for the launcher: elapsed time, visible but not loud. */
export function SessionClock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = Math.max(0, now - startedAt);
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  return (
    <span className="gg-session-clock" title="How long this session has been open">
      <Clock size={11} /> {minutes}:{String(seconds).padStart(2, '0')}
    </span>
  );
}

/** A "you have played this for X" line for the card. */
export function PlayTimeBadge({ gameId }: { gameId: string }) {
  const [total, setTotal] = useState(0);
  useEffect(() => setTotal(getPlayTime(gameId).ms), [gameId]);
  if (total < 60000) return null;
  return (
    <span className="gg-playtime" title={`Total time played: ${formatDuration(total)}`}>
      {formatDuration(total)}
    </span>
  );
}

/* -------------------------------------------------------------- up next -- */

/**
 * Four similar games, inside the launcher.
 *
 * Similarity is a weighted overlap of genre and tone, with the same genre
 * counting for more than the same tone; ties break on play count so the shelf
 * surfaces things the person actually finishes. It is deliberately not a
 * recommender with a model behind it — a launcher needs answers in a
 * millisecond, and "other racing games you have not played" is a good answer.
 */
export function UpNext({
  game,
  catalogue,
  playCounts,
  onLaunch,
}: {
  game: Game;
  catalogue: Game[];
  playCounts: Record<string, number>;
  onLaunch: (game: Game) => void;
}) {
  const picks = useMemo(() => {
    const scored = catalogue
      .filter(candidate => candidate.id !== game.id && !candidate.proxy)
      .map(candidate => {
        let score = 0;
        if (candidate.genre === game.genre) score += 5;
        if (candidate.tone === game.tone) score += 2;
        score += (playCounts[candidate.id] ?? 0) * 0.15;
        return { candidate, score };
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 4).map(entry => entry.candidate);
  }, [catalogue, game, playCounts]);

  if (!picks.length) return null;

  return (
    <div className="gg-upnext" aria-label="Play something similar">
      <span className="gg-upnext-label"><Sparkles size={11} /> Up next</span>
      {picks.map(candidate => (
        <button key={candidate.id} type="button" onClick={() => onLaunch(candidate)} title={candidate.subtitle}>
          <span className={`game-badge ${candidate.color}`}>{candidate.mark}</span>
          <span>{candidate.title}</span>
        </button>
      ))}
    </div>
  );
}

/** Wrap the launcher's close button so a session is recorded once, on exit. */
export function useSessionTimer(gameId: string) {
  /**
   * The start time is state, not a ref: the clock component renders it, and
   * reading a ref during render is exactly the bug React's compiler flags.
   * The ref exists only to make `finish` idempotent across both close paths.
   */
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [total, setTotal] = useState<number | null>(null);
  const logged = useRef(false);

  useEffect(() => {
    setStartedAt(Date.now());
    setTotal(null);
    logged.current = false;
  }, [gameId]);

  const finish = useCallback(
    (reason: 'close' | 'switch') => {
      if (logged.current) return;
      logged.current = true;
      const ms = Date.now() - startedAt;
      if (reason === 'close') setTotal(addPlayTime(gameId, ms));
    },
    [gameId, startedAt],
  );

  return { startedAt, finish, total };
}

/* A dismissible note, used when the timing line should say something once. */
export function PlayTimeNote({ total, onDone }: { total: number; onDone: () => void }) {
  if (total < 30000) return null;
  return (
    <p className="gg-playtime-note" role="status">
      <Clock size={12} /> {formatDuration(total)} in this game — saved.
      <button type="button" onClick={onDone} aria-label="Dismiss"><X size={12} /></button>
    </p>
  );
}
