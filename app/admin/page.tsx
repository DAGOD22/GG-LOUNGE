'use client';

import { useEffect, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  Eye,
  Gamepad2,
  Gavel,
  LockKeyhole,
  LogOut,
  Play,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { readFileAsDataUrl, uploadGameHtml } from '@/lib/upload-client';

type BanRow = { id: string; identifier: string; reason: string | null; createdAt: string; expiresAt: string | null };
type RequestRow = { id: string; title: string; icon: string | null; status: string; createdAt: string };
type GameRow = { id: string; title: string; icon: string | null; createdAt: string };
type VisitRow = { id: string; ip: string; ua: string; path: string; createdAt: string };
type Data = { bans: BanRow[]; requests: RequestRow[]; games: GameRow[]; visits: VisitRow[]; mode: string };

const empty: Data = { bans: [], requests: [], games: [], visits: [], mode: 'local' };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function shortUa(ua: string): string {
  if (!ua) return '—';
  if (ua.includes('Chrome/')) return 'Chrome ' + (ua.split('Chrome/')[1] || '').split(' ')[0].split('.')[0];
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && ua.includes('Mobile')) return 'Mobile Safari';
  if (ua.includes('Safari/')) return 'Safari';
  if (ua.includes('Edg/')) return 'Edge';
  return ua.slice(0, 28);
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<Data>(empty);
  const [identifier, setIdentifier] = useState('');
  const [reason, setReason] = useState('');

  // publish form
  const [pubTitle, setPubTitle] = useState('');
  const [pubIcon, setPubIcon] = useState<File | null>(null);
  const [pubFile, setPubFile] = useState<File | null>(null);
  const [pubProgress, setPubProgress] = useState<{ done: number; total: number } | null>(null);
  const [pubMessage, setPubMessage] = useState('');

  async function load(): Promise<boolean> {
    try {
      const r = await fetch('/api/admin', { cache: 'no-store' });
      if (!r.ok) return false;
      setData(await r.json());
      setUnlocked(true);
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    void load().finally(() => setChecking(false));
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'login', password }),
    });
    if (!r.ok) {
      setError('Incorrect admin password.');
      return;
    }
    setPassword('');
    await load();
  }

  async function logout() {
    await fetch('/api/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    setUnlocked(false);
    setData(empty);
  }

  async function action(body: object) {
    await fetch('/api/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await load();
  }

  async function remove(type: string, id: string) {
    if (!window.confirm('Delete this? This cannot be undone.')) return;
    await fetch('/api/admin', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, id }),
    });
    await load();
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setPubMessage('');
    if (!pubTitle.trim() || !pubFile) {
      setPubMessage('Give the game a title and choose its index.html file.');
      return;
    }
    setPubProgress({ done: 0, total: 1 });
    let icon: string | null = null;
    try {
      if (pubIcon) icon = await readFileAsDataUrl(pubIcon, 300 * 1024);
    } catch (err) {
      setPubProgress(null);
      setPubMessage(err instanceof Error ? err.message : 'Bad icon file.');
      return;
    }
    const result = await uploadGameHtml(
      pubFile,
      { kind: 'publish', title: pubTitle.trim(), icon },
      (done, total) => setPubProgress({ done, total }),
    );
    setPubProgress(null);
    if (!result.ok) {
      setPubMessage(result.error || 'Publish failed.');
      return;
    }
    setPubTitle('');
    setPubIcon(null);
    setPubFile(null);
    (document.getElementById('pub-form') as HTMLFormElement | null)?.reset();
    setPubMessage('Published! It is live in the lounge now.');
    await load();
  }

  if (checking) {
    return (
      <main className="admin-shell">
        <section className="admin-login">
          <p className="muted">Loading console…</p>
        </section>
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main className="admin-shell">
        <section className="admin-login">
          <div className="admin-lock">
            <LockKeyhole />
          </div>
          <p className="eyebrow">GG-LOUNGE™ / CONTROL ROOM</p>
          <h1>Admin access.</h1>
          <p>Unlock the moderation and publishing console.</p>
          <form onSubmit={login}>
            <label htmlFor="admin-password">Admin password</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
            <button type="submit">Unlock console</button>
          </form>
          {error && <p className="admin-error">{error}</p>}
          <a className="admin-back" href="/">
            Back to lounge
          </a>
        </section>
      </main>
    );
  }

  const pending = data.requests.filter((r) => r.status === 'pending');

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">
            <ShieldCheck size={14} /> GG-LOUNGE™ / CONTROL ROOM
          </p>
          <h1>Moderation console</h1>
          <span className={`mode-badge ${data.mode === 'postgres' ? 'pg' : 'local'}`}>
            {data.mode === 'postgres' ? 'Postgres • permanent' : 'Local mode • connect Postgres for permanence'}
          </span>
        </div>
        <div className="admin-header-actions">
          <a href="/">Back to lounge</a>
          <button onClick={() => void logout()}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      </header>

      <section className="admin-grid">
        <section className="admin-panel">
          <div className="panel-heading">
            <Users size={19} />
            <div>
              <h2>Recent visitors</h2>
              <p>Kick (15 min) or ban visitors by IP.</p>
            </div>
          </div>
          <div className="visit-list">
            {data.visits.length === 0 && <p className="muted">No visits logged yet.</p>}
            {data.visits.slice(0, 20).map((v) => (
              <div className="visit-row" key={v.id}>
                <div>
                  <strong>{v.ip}</strong>
                  <span>
                    {v.path} • {shortUa(v.ua)} • {timeAgo(v.createdAt)}
                  </span>
                </div>
                <div className="row-actions">
                  <button title="Kick for 15 minutes" onClick={() => void action({ action: 'kick', identifier: v.ip, minutes: 15 })}>
                    <Clock size={14} /> Kick
                  </button>
                  <button title="Ban permanently" onClick={() => void action({ action: 'ban', identifier: v.ip, reason: 'Banned by admin' })}>
                    <Ban size={14} /> Ban
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div>
          <form
            className="admin-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void action({ action: 'ban', identifier, reason });
              setIdentifier('');
              setReason('');
            }}
          >
            <div className="panel-heading">
              <Gavel size={19} />
              <div>
                <h2>Ban a visitor</h2>
                <p>Block an IP address or identifier.</p>
              </div>
            </div>
            <label htmlFor="identifier">Identifier (IP)</label>
            <input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="1.2.3.4" />
            <label htmlFor="reason">Reason</label>
            <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            <button type="submit">Add ban</button>
          </form>

          <section className="admin-panel">
            <div className="panel-heading">
              <Ban size={19} />
              <div>
                <h2>Active bans</h2>
                <p>{data.bans.length} records</p>
              </div>
            </div>
            {data.bans.length === 0 && <p className="muted">Nobody is banned.</p>}
            {data.bans.map((b) => (
              <div className="ban-row" key={b.id}>
                <div>
                  <strong>{b.identifier}</strong>
                  <span>
                    {b.reason || 'No reason provided'}
                    {b.expiresAt ? ` • lifts ${timeAgo(b.expiresAt) === 'just now' ? 'soon' : timeAgo(b.expiresAt)}` : ' • permanent'}
                  </span>
                </div>
                <button onClick={() => void remove('ban', b.id)} aria-label="Remove ban">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </section>
        </div>
      </section>

      <section className="admin-panel admin-wide">
        <div className="panel-heading">
          <Upload size={19} />
          <div>
            <h2>Publish a game</h2>
            <p>Upload an index.html file — it goes live in the lounge permanently.</p>
          </div>
        </div>
        <form id="pub-form" className="upload-form" onSubmit={publish}>
          <div>
            <label htmlFor="pub-title">Game title</label>
            <input id="pub-title" value={pubTitle} onChange={(e) => setPubTitle(e.target.value)} required maxLength={80} placeholder="My Awesome Game" />
          </div>
          <div>
            <label htmlFor="pub-icon">Icon / favicon (optional)</label>
            <input id="pub-icon" type="file" accept="image/*" onChange={(e) => setPubIcon(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label htmlFor="pub-file">index.html file</label>
            <input id="pub-file" type="file" accept=".html,text/html" required onChange={(e) => setPubFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="upload-actions">
            <button type="submit" disabled={!!pubProgress}>
              <Gamepad2 size={15} /> {pubProgress ? `Uploading ${pubProgress.done}/${pubProgress.total}…` : 'Publish now'}
            </button>
            {pubProgress && (
              <div className="progress-bar">
                <div style={{ width: `${Math.round((pubProgress.done / pubProgress.total) * 100)}%` }} />
              </div>
            )}
          </div>
        </form>
        {pubMessage && <p className="muted">{pubMessage}</p>}
      </section>

      <section className="admin-panel admin-wide">
        <div className="panel-heading">
          <Check size={19} />
          <div>
            <h2>Game requests</h2>
            <p>{pending.length} pending — approve or deny community HTML uploads.</p>
          </div>
        </div>
        {data.requests.length === 0 && <p className="muted">No requests yet.</p>}
        {data.requests.map((r) => (
          <div className="request-row" key={r.id}>
            <div>
              <strong>
                {r.icon && <img src={r.icon} alt="" />}
                {r.title}
              </strong>
              <span>
                {r.status} • {timeAgo(r.createdAt)}
              </span>
            </div>
            <div className="row-actions">
              <a className="admin-btn" href={`/api/admin/preview?id=${encodeURIComponent(r.id)}&kind=request`} target="_blank" rel="noreferrer">
                <Eye size={15} /> Preview
              </a>
              {r.status === 'pending' && (
                <>
                  <button onClick={() => void action({ action: 'publish', id: r.id })}>
                    <Check size={15} /> Publish
                  </button>
                  <button className="danger" onClick={() => void action({ action: 'deny', id: r.id })}>
                    <X size={15} /> Deny
                  </button>
                </>
              )}
              <button className="danger" onClick={() => void remove('request', r.id)}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="admin-panel admin-wide">
        <div className="panel-heading">
          <Play size={19} />
          <div>
            <h2>Published games</h2>
            <p>{data.games.length} permanent community games in the lounge.</p>
          </div>
        </div>
        {data.games.length === 0 && <p className="muted">Nothing published yet — use the form above.</p>}
        {data.games.map((g) => (
          <div className="request-row" key={g.id}>
            <div>
              <strong>
                {g.icon && <img src={g.icon} alt="" />}
                {g.title}
              </strong>
              <span>{timeAgo(g.createdAt)}</span>
            </div>
            <div className="row-actions">
              <a className="admin-btn" href={`/games/${encodeURIComponent(g.id)}`} target="_blank" rel="noreferrer">
                <Play size={15} /> Play
              </a>
              <button className="danger" onClick={() => void remove('game', g.id)}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
