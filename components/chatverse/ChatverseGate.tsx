'use client';

/**
 * The door to CHATVERSE.
 *
 * One field, one button, no hints. The password is checked on the server and
 * the cookie it sets is httpOnly, so nothing here can be read or replayed by a
 * script on the page.
 *
 * Why a full page rather than a modal: the password is the only thing standing
 * between a stranger and a room full of messages, and a modal invites casual
 * guessing. A page you had to type a URL for does not.
 */

import { useEffect, useRef, useState } from 'react';
import { Lock, ArrowRight, Loader2 } from 'lucide-react';

export function ChatverseGate({ cookieName }: { cookieName: string }) {
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'wrong'>('idle');
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || state === 'checking') return;
    setState('checking');
    setError('');
    try {
      const response = await fetch('/api/chat/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState('wrong');
        setError(data?.error ?? 'That password is not right.');
        setPassword('');
        field.current?.focus();
        return;
      }
      // Full navigation, not a client route change: the server has to decide
      // what to render now that the cookie exists.
      window.location.reload();
    } catch {
      setState('wrong');
      setError('Could not reach the lounge. Check your connection.');
    }
  }

  return (
    <div className="cv-gate">
      <div className="cv-gate-card">
        <span className="cv-gate-badge" aria-hidden="true">
          <Lock size={20} />
        </span>
        <p className="cv-overline">PRIVATE · INVITE ONLY</p>
        <h1>CHATVERSE</h1>
        <p className="cv-gate-copy">
          A room for the people who run the lounge. Enter the password to open it.
        </p>
        <form onSubmit={submit} className="cv-gate-form">
          <label className="sr-only" htmlFor="cv-password">
            CHATVERSE password
          </label>
          <input
            id="cv-password"
            ref={field}
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={event => {
              setPassword(event.target.value);
              if (state === 'wrong') setState('idle');
            }}
            aria-invalid={state === 'wrong'}
            aria-describedby={error ? 'cv-error' : undefined}
            data-cookie={cookieName}
          />
          <button type="submit" disabled={!password || state === 'checking'}>
            {state === 'checking' ? <Loader2 size={16} className="cv-spin" /> : <ArrowRight size={16} />}
            {state === 'checking' ? 'Checking…' : 'Enter'}
          </button>
        </form>
        {error && (
          <p className="cv-gate-error" id="cv-error" role="alert">
            {error}
          </p>
        )}
        <p className="cv-gate-foot">
          Nothing here is indexed, linked or searchable. Messages and uploads belong to this room
          only, and the session ends when you close it or after twelve hours.
        </p>
      </div>
    </div>
  );
}
