'use client';

import { useEffect, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  Eye,
  Gamepad2,
  Gavel,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Play,
  Server,
  ShieldAlert,
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
  const [activeTab, setActiveTab] = useState<'overview'|'users'|'bans'|'publish'|'requests'|'games'>('overview');

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
      body: JSON.stringify({ action: 'login', password: password.trim() }),
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
        <section className="admin-login-card">
          <div className="admin-spinner" aria-hidden />
          <p className="muted">Contacting control room…</p>
        </section>
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main className="admin-shell admin-gate">
        <section className="admin-login-card">
          <div className="admin-lock">
            <LockKeyhole size={26} />
          </div>
          <p className="eyebrow">GG-LOUNGE™ / CONTROL ROOM</p>
          <h1>Admin access.</h1>
          <p className="muted">Unlock the moderation and publishing console.</p>
          <form onSubmit={login} className="admin-form">
            <label htmlFor="admin-password">Admin password</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              placeholder="••••••"
            />
            <button type="submit" className="btn-primary">Unlock console</button>
          </form>
          {error && <p className="admin-error">{error}</p>}
          <a className="admin-back" href="/">
            ← Back to lounge
          </a>
        </section>
      </main>
    );
  }

  const pending = data.requests.filter((r) => r.status === 'pending');
  const stats = [
    { icon: <Users size={18} />, label: 'Visitors', value: data.visits.length, sub: 'last 50 unique', color: 'lime' },
    { icon: <Inbox size={18} />, label: 'Requests', value: pending.length, sub: `${pending.length} pending`, color: 'violet', alert: pending.length > 0 },
    { icon: <Gamepad2 size={18} />, label: 'Published', value: data.games.length, sub: 'community live', color: 'coral' },
    { icon: <ShieldAlert size={18} />, label: 'Bans', value: data.bans.length, sub: data.bans.length? 'active': 'peace', color: 'muted' },
  ];

  return (
    <main className="admin-shell">
      <header className="console-header" style={{background:'linear-gradient(135deg,rgba(215,243,74,.12),rgba(125,107,255,.10) 45%, rgba(0,0,0,.2))', border:'1px solid rgba(255,255,255,.08)'}}>
        <div className="console-brand">
          <span className="console-shield" style={{background:'var(--lime)', boxShadow:'0 8px 30px rgba(215,243,74,.35)'}}>
            <ShieldCheck size={20} />
          </span>
          <div>
            <p className="eyebrow" style={{color:'var(--lime)', opacity:.9}}>GG-LOUNGE™ / CONTROL ROOM — v2</p>
            <h1 style={{display:'flex',alignItems:'center',gap:10}}>Moderation console <span style={{fontSize:10,padding:'4px 8px',borderRadius:99,background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.12)',letterSpacing:'.08em'}}>LIVE</span></h1>
            <p style={{margin:'6px 0 0',color:'rgba(255,255,255,.55)',fontSize:12}}>Manage visitors, bans, game submissions and live publishing. Everything here is real-time.</p>
          </div>
          <span className={`mode-badge ${data.mode === 'postgres' ? 'pg' : 'local'}`} style={{alignSelf:'flex-start'}}>
            <Server size={12} /> {data.mode === 'postgres' ? 'Postgres • permanent' : 'Local • add DATABASE_URL for permanence'}
          </span>
        </div>
        <div className="console-actions" style={{flexDirection:'column',alignItems:'stretch',gap:10}}>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <a className="btn-ghost" href="/" style={{padding:'8px 14px'}}><Gamepad2 size={14}/> Lounge</a>
            <button className="btn-ghost" onClick={() => void logout()} style={{padding:'8px 14px'}}>
              <LogOut size={15} /> Log out
            </button>
          </div>
          <nav className="console-nav" style={{justifyContent:'flex-end', background:'rgba(0,0,0,.35)'}}>
            {[
              ['overview','Overview'],
              ['users','Users'],
              ['publish','Publish'],
              ['requests',`Requests${pending.length?` • ${pending.length}`:''}`],
              ['games',`Games • ${data.games.length}`],
              ['bans',`Bans • ${data.bans.length}`],
            ].map(([id,label])=> (
              <a key={id} href={`#${id}`} onClick={(e)=>{e.preventDefault(); setActiveTab(id as never)}} style={{background: activeTab===id?'var(--lime)':'transparent', color: activeTab===id?'#111':'rgba(255,255,255,.75)', fontWeight:800, cursor:'pointer'}}>
                {label as string}
                {id==='requests' && pending.length>0 && <em style={{background:'#e23b3b'}}>{pending.length}</em>}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <section className="stat-row">
        {stats.map((s) => (
          <div key={s.label} className={`stat-card${s.alert ? ' alert' : ''}`} onClick={()=> setActiveTab(s.label==='Visitors'? 'users' : s.label==='Requests'? 'requests' : s.label==='Published'? 'games' : s.label==='Bans'? 'bans' : 'overview')} style={{cursor:'pointer', background: s.color==='lime'? 'linear-gradient(135deg,rgba(215,243,74,.14),rgba(255,255,255,.02))' : s.color==='violet'? 'linear-gradient(135deg,rgba(125,107,255,.14),rgba(255,255,255,.02))' : s.color==='coral'? 'linear-gradient(135deg,rgba(255,108,131,.14),rgba(255,255,255,.02))' : 'rgba(255,255,255,.04)'}}>
            <span className="stat-icon">{s.icon}</span>
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label} <span style={{opacity:.5, fontWeight:400}}>— {s.sub}</span></span>
          </div>
        ))}
      </section>

      {(activeTab==="overview" || activeTab==="users" || activeTab==="bans") && (<section className="admin-grid" id="users">
        <section className="admin-panel">
          <div className="panel-heading">
            <span className="panel-icon"><Users size={18} /></span>
            <div>
              <h2>Recent visitors</h2>
              <p>Kick (15 min) or ban visitors by IP.</p>
            </div>
          </div>
          <div className="visit-list">
            {data.visits.length === 0 && (
              <p className="empty-state"><LayoutDashboard size={20} /> No visits logged yet.</p>
            )}
            {data.visits.slice(0, 20).map((v) => (
              <div className="visit-row" key={v.id}>
                <div className="row-main">
                  <strong>{v.ip}</strong>
                  <span>
                    {v.path} • {shortUa(v.ua)} • {timeAgo(v.createdAt)}
                  </span>
                </div>
                <div className="row-actions">
                  <button className="btn-mini" title="Kick for 15 minutes" onClick={() => void action({ action: 'kick', identifier: v.ip, minutes: 15 })}>
                    <Clock size={14} /> Kick
                  </button>
                  <button className="btn-mini danger" title="Ban permanently" onClick={() => void action({ action: 'ban', identifier: v.ip, reason: 'Banned by admin' })}>
                    <Ban size={14} /> Ban
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="side-stack" id="bans">
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
              <span className="panel-icon"><Gavel size={18} /></span>
              <div>
                <h2>Ban a visitor</h2>
                <p>Block an IP address or identifier.</p>
              </div>
            </div>
            <label htmlFor="identifier">Identifier (IP)</label>
            <input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="1.2.3.4" />
            <label htmlFor="reason">Reason</label>
            <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why are they banned?" />
            <button type="submit" className="btn-primary"><Ban size={15} /> Add ban</button>
          </form>

          <section className="admin-panel">
            <div className="panel-heading">
              <span className="panel-icon"><Ban size={18} /></span>
              <div>
                <h2>Active bans</h2>
                <p>{data.bans.length} record{data.bans.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            {data.bans.length === 0 && <p className="empty-state"><ShieldCheck size={20} /> Nobody is banned. Peace reigns.</p>}
            {data.bans.map((b) => (
              <div className="ban-row" key={b.id}>
                <div className="row-main">
                  <strong>{b.identifier}</strong>
                  <span>
                    {b.reason || 'No reason provided'}
                    {b.expiresAt ? ` • lifts ${timeAgo(b.expiresAt) === 'just now' ? 'soon' : timeAgo(b.expiresAt)}` : ' • permanent'}
                  </span>
                </div>
                <button className="btn-icon danger" onClick={() => void remove('ban', b.id)} aria-label="Remove ban">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </section>
        </div>
      </section>

      )}
      {(activeTab==="overview" || activeTab==="publish") && (<section className="admin-panel admin-wide" id="publish">
        <div className="panel-heading">
          <span className="panel-icon"><Upload size={18} /></span>
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
            <button type="submit" className="btn-primary" disabled={!!pubProgress}>
              <Gamepad2 size={15} /> {pubProgress ? `Uploading ${pubProgress.done}/${pubProgress.total}…` : 'Publish now'}
            </button>
            {pubProgress && (
              <div className="progress-bar">
                <div style={{ width: `${Math.round((pubProgress.done / pubProgress.total) * 100)}%` }} />
              </div>
            )}
          </div>
        </form>
        {pubMessage && <p className={`pub-message${pubMessage.startsWith('Published') ? ' ok' : ''}`}>{pubMessage}</p>}
      </section>

      )}
      {(activeTab==="overview" || activeTab==="requests") && (<section className="admin-panel admin-wide" id="requests">
        <div className="panel-heading">
          <span className="panel-icon"><Inbox size={18} /></span>
          <div>
            <h2>Game requests</h2>
            <p>{pending.length} pending — approve or deny community HTML uploads.</p>
          </div>
        </div>
        {data.requests.length === 0 && <p className="empty-state"><Inbox size={20} /> No requests yet.</p>}
        {data.requests.map((r) => (
          <div className="request-row" key={r.id}>
            <div className="row-main">
              <strong>
                {r.icon && <img src={r.icon} alt="" />}
                {r.title}
              </strong>
              <span>
                <em className={`pill ${r.status}`}>{r.status}</em> • {timeAgo(r.createdAt)}
              </span>
            </div>
            <div className="row-actions">
              <a className="btn-mini" href={`/api/admin/preview?id=${encodeURIComponent(r.id)}&kind=request`} target="_blank" rel="noreferrer">
                <Eye size={15} /> Preview
              </a>
              {r.status === 'pending' && (
                <>
                  <button className="btn-mini ok" onClick={() => void action({ action: 'publish', id: r.id })}>
                    <Check size={15} /> Publish
                  </button>
                  <button className="btn-mini danger" onClick={() => void action({ action: 'deny', id: r.id })}>
                    <X size={15} /> Deny
                  </button>
                </>
              )}
              <button className="btn-icon danger" onClick={() => void remove('request', r.id)} aria-label="Delete request">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </section>

      )}
      {(activeTab==="overview" || activeTab==="games") && (<section className="admin-panel admin-wide" id="games">
        <div className="panel-heading">
          <span className="panel-icon"><Play size={18} /></span>
          <div>
            <h2>Published games</h2>
            <p>{data.games.length} permanent community game{data.games.length === 1 ? '' : 's'} in the lounge.</p>
          </div>
        </div>
        {data.games.length === 0 && <p className="empty-state"><Gamepad2 size={20} /> Nothing published yet — use the form above.</p>}
        {data.games.map((g) => (
          <div className="request-row" key={g.id}>
            <div className="row-main">
              <strong>
                {g.icon && <img src={g.icon} alt="" />}
                {g.title}
              </strong>
              <span>{timeAgo(g.createdAt)}</span>
            </div>
            <div className="row-actions">
              <a className="btn-mini" href={`/games/${encodeURIComponent(g.id)}`} target="_blank" rel="noreferrer">
                <Play size={15} /> Play
              </a>
              <button className="btn-mini danger" onClick={() => void remove('game', g.id)}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>
        ))}
      </section>)}
    </main>
  );
}
