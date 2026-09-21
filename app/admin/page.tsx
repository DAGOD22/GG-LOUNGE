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
  Zap,
  TrendingUp,
  Sparkles,
  Activity,
  FileCode,
  Image as ImageIcon,
  Search,
  Filter,
  Crown,
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
  const [search, setSearch] = useState('')

  // publish form
  const [pubTitle, setPubTitle] = useState('');
  const [pubIcon, setPubIcon] = useState<File | null>(null);
  const [pubFile, setPubFile] = useState<File | null>(null);
  const [pubProgress, setPubProgress] = useState<{ done: number; total: number } | null>(null);
  const [pubMessage, setPubMessage] = useState('');
  const [pubIconPreview, setPubIconPreview] = useState<string | null>(null)

  useEffect(()=>{
    if(!pubIcon) { setPubIconPreview(null); return }
    const url = URL.createObjectURL(pubIcon)
    setPubIconPreview(url)
    return ()=> URL.revokeObjectURL(url)
  },[pubIcon])

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
    setPubIconPreview(null);
    (document.getElementById('pub-form') as HTMLFormElement | null)?.reset();
    setPubMessage('Published! It is live in the lounge now.');
    await load();
  }

  if (checking) {
    return (
      <main className="admin-shell">
        <section className="admin-login-card" style={{background:'linear-gradient(145deg, rgba(125,107,255,.12), rgba(215,243,74,.08))'}}>
          <div className="admin-spinner" aria-hidden />
          <p className="muted" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><Activity size={16} className="spin"/> Contacting control room…</p>
        </section>
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main className="admin-shell admin-gate" style={{background:'radial-gradient(circle at 20% 20%, rgba(125,107,255,.12), transparent 40%), radial-gradient(circle at 80% 80%, rgba(215,243,74,.10), transparent 40%), var(--background)'}}>
        <section className="admin-login-card" style={{border:'1px solid rgba(255,255,255,.12)', background:'linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', backdropFilter:'blur(16px)', boxShadow:'0 24px 80px rgba(0,0,0,.5)'}}>
          <div className="admin-lock" style={{width:64, height:64, borderRadius:18, background:'linear-gradient(135deg, var(--lime), #a8e600)', boxShadow:'0 12px 30px rgba(215,243,74,.35)'}}>
            <LockKeyhole size={28} />
          </div>
          <p className="eyebrow" style={{justifyContent:'center', marginTop:12}}>GG-LOUNGE™ / CONTROL ROOM</p>
          <h1 style={{fontSize:28, textAlign:'center'}}>Admin access.</h1>
          <p className="muted" style={{textAlign:'center', maxWidth:320, margin:'8px auto 0'}}>Unlock the moderation and publishing console. Encrypted • Audit logged.</p>
          <form onSubmit={login} className="admin-form">
            <label htmlFor="admin-password" style={{display:'flex',alignItems:'center',gap:6}}><LockKeyhole size={12}/> Admin password</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              placeholder="••••••"
              style={{padding:'14px 16px', borderRadius:14}}
            />
            <button type="submit" className="btn-primary" style={{borderRadius:14, padding:'14px', background:'linear-gradient(135deg, var(--lime), #c6ff00)', boxShadow:'0 8px 24px rgba(215,243,74,.25)'}}>Unlock console <Zap size={14}/></button>
          </form>
          {error && <p className="admin-error" style={{textAlign:'center', background:'rgba(255,92,92,.12)', border:'1px solid rgba(255,92,92,.22)', padding:'10px 14px', borderRadius:12}}>{error}</p>}
          <a className="admin-back" href="/" style={{display:'inline-flex', alignItems:'center', gap:6, justifyContent:'center', width:'100%', marginTop:16}}>
            ← Back to lounge
          </a>
        </section>
      </main>
    );
  }

  const pending = data.requests.filter((r) => r.status === 'pending');
  const stats = [
    { icon: <Users size={20} />, label: 'Visitors', value: data.visits.length, sub: 'last 50', color: 'lime', trend:'+12%' },
    { icon: <Inbox size={20} />, label: 'Requests', value: pending.length, sub: `${pending.length} pending`, color: 'violet', alert: pending.length > 0, trend: pending.length>0? 'needs review': 'clear' },
    { icon: <Gamepad2 size={20} />, label: 'Published', value: data.games.length, sub: 'community live', color: 'coral', trend: `${data.games.length} total` },
    { icon: <ShieldAlert size={20} />, label: 'Bans', value: data.bans.length, sub: data.bans.length? 'active':'peace', color: 'muted', trend: data.bans.length? 'enforced':'calm' },
  ];

  const filteredVisits = data.visits.filter(v=> !search || v.ip.includes(search) || v.path.toLowerCase().includes(search.toLowerCase()) || shortUa(v.ua).toLowerCase().includes(search.toLowerCase())).slice(0,20)
  const filteredBans = data.bans.filter(b=> !search || b.identifier.includes(search) || (b.reason||'').toLowerCase().includes(search.toLowerCase()))

  return (
    <main className="admin-shell" style={{maxWidth:1280}}>
      <header className="console-header" style={{background:'linear-gradient(135deg, rgba(215,243,74,.14) 0%, rgba(125,107,255,.12) 45%, rgba(255,255,255,.04) 100%)', border:'1px solid rgba(255,255,255,.10)', boxShadow:'0 16px 40px rgba(0,0,0,.25)', backdropFilter:'blur(12px)', padding:'22px 24px', borderRadius:22}}>
        <div className="console-brand" style={{gap:16}}>
          <span className="console-shield" style={{background:'linear-gradient(135deg, var(--lime), #b8ff00)', boxShadow:'0 10px 30px rgba(215,243,74,.35)', width:52, height:52, borderRadius:16}}>
            <ShieldCheck size={22} />
          </span>
          <div>
            <p className="eyebrow" style={{color:'var(--lime)', opacity:.9, letterSpacing:'.12em', display:'flex',alignItems:'center',gap:6}}><Crown size={12}/> GG-LOUNGE™ / CONTROL ROOM — v3 • PREMIUM</p>
            <h1 style={{display:'flex',alignItems:'center',gap:10, fontSize:26, letterSpacing:'-0.02em'}}>Moderation console <span style={{fontSize:10,padding:'5px 10px',borderRadius:999,background:'rgba(34,197,94,.14)', border:'1px solid rgba(34,197,94,.35)', color:'#22c55e', display:'inline-flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:999,background:'#22c55e', boxShadow:'0 0 8px #22c55e'}}/> LIVE</span> <span style={{fontSize:10,padding:'5px 10px',borderRadius:999,background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)'}}>{data.visits.length} online</span></h1>
            <p style={{margin:'6px 0 0',color:'rgba(255,255,255,.6)',fontSize:12, maxWidth:480}}>Real-time visitors, bans, community submissions and instant publishing. Every action is audit-logged and permanent when Postgres is connected.</p>
          </div>
          <span className={`mode-badge ${data.mode === 'postgres' ? 'pg' : 'local'}`} style={{alignSelf:'flex-start', padding:'8px 14px', borderRadius:999, fontSize:11, fontWeight:900, display:'inline-flex',alignItems:'center',gap:6}}>
            <Server size={14} /> {data.mode === 'postgres' ? 'Postgres • permanent' : 'Local • add DATABASE_URL'}
          </span>
        </div>
        <div className="console-actions" style={{flexDirection:'column',alignItems:'stretch',gap:12, minWidth:280}}>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <div style={{flex:1, display:'flex',alignItems:'center',gap:8, padding:'8px 12px', borderRadius:999, background:'rgba(0,0,0,.25)', border:'1px solid rgba(255,255,255,.08)'}}><Search size={14} style={{opacity:.5}}/><input value={search} onChange={e=> setSearch(e.target.value)} placeholder="Search IP, path, ban reason" style={{background:'transparent', border:0, outline:'none', color:'#fff', fontSize:12, flex:1}} /></div>
            <a className="btn-ghost" href="/" style={{padding:'10px 14px', borderRadius:12, background:'rgba(255,255,255,.06)', backdropFilter:'blur(6px)'}}><Gamepad2 size={14}/> Lounge</a>
            <button className="btn-ghost" onClick={() => void logout()} style={{padding:'10px 14px', borderRadius:12}}>
              <LogOut size={15} /> Log out
            </button>
          </div>
          <nav className="console-nav" style={{justifyContent:'flex-end', background:'rgba(0,0,0,.35)', border:'1px solid rgba(255,255,255,.08)', padding:4, borderRadius:14}}>
            {[
              ['overview','Overview'],
              ['users','Users'],
              ['publish','Publish'],
              ['requests',`Requests${pending.length?` • ${pending.length}`:''}`],
              ['games',`Games • ${data.games.length}`],
              ['bans',`Bans • ${data.bans.length}`],
            ].map(([id,label])=> (
              <a key={id} href={`#${id}`} onClick={(e)=>{e.preventDefault(); setActiveTab(id as never)}} style={{background: activeTab===id?'var(--lime)':'transparent', color: activeTab===id?'#0b0d12':'rgba(255,255,255,.72)', fontWeight:800, cursor:'pointer', padding:'8px 14px', borderRadius:10, fontSize:12, boxShadow: activeTab===id? '0 4px 14px rgba(215,243,74,.25)':''}}>
                {label as string}
                {id==='requests' && pending.length>0 && <em style={{background:'#e23b3b', marginLeft:6}}>{pending.length}</em>}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <section className="stat-row" style={{gap:14, marginBottom:20}}>
        {stats.map((s) => (
          <div key={s.label} className={`stat-card${s.alert ? ' alert' : ''}`} onClick={()=> setActiveTab(s.label==='Visitors'? 'users' : s.label==='Requests'? 'requests' : s.label==='Published'? 'games' : s.label==='Bans'? 'bans' : 'overview')} style={{cursor:'pointer', padding:'18px 20px', borderRadius:16, border:'1px solid rgba(255,255,255,.08)', background: s.color==='lime'? 'linear-gradient(135deg, rgba(215,243,74,.16), rgba(255,255,255,.03))' : s.color==='violet'? 'linear-gradient(135deg, rgba(125,107,255,.16), rgba(255,255,255,.03))' : s.color==='coral'? 'linear-gradient(135deg, rgba(255,108,131,.14), rgba(255,255,255,.03))' : 'linear-gradient(135deg, rgba(255,255,255,.04), rgba(255,255,255,.01))', position:'relative', overflow:'hidden', transition:'transform .2s, border-color .2s'}}>
            <div style={{position:'absolute', top:-20, right:-20, width:80, height:80, borderRadius:'50%', background: s.color==='lime'? 'radial-gradient(circle, rgba(215,243,74,.18), transparent 60%)': s.color==='violet'? 'radial-gradient(circle, rgba(125,107,255,.18), transparent 60%)': s.color==='coral'? 'radial-gradient(circle, rgba(255,108,131,.14), transparent 60%)':'', pointerEvents:'none'}}/>
            <span className="stat-icon" style={{width:36, height:36, borderRadius:10, background:'rgba(255,255,255,.08)', display:'grid', placeItems:'center', marginBottom:8}}>{s.icon}</span>
            <span className="stat-value" style={{fontSize:32, display:'flex', alignItems:'baseline', gap:8}}>{s.value} <span style={{fontSize:10, padding:'3px 7px', borderRadius:999, background: s.alert? 'rgba(255,92,92,.14)':'rgba(255,255,255,.08)', color: s.alert? '#ff8f8f':'rgba(255,255,255,.6)', fontWeight:800, letterSpacing:'.06em'}}>{s.trend}</span></span>
            <span className="stat-label" style={{display:'flex',alignItems:'center',gap:6}}>{s.label} <span style={{opacity:.5, fontWeight:400}}>— {s.sub}</span> {s.alert && <TrendingUp size={12} color="#ff8f8f"/>}</span>
          </div>
        ))}
      </section>

      {(activeTab==="overview" || activeTab==="users" || activeTab==="bans") && (
        <section className="admin-grid" id="users" style={{gap:16}}>
          <section className="admin-panel" style={{borderRadius:18, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', backdropFilter:'blur(8px)', padding:20}}>
            <div className="panel-heading" style={{marginBottom:14, paddingBottom:12, borderBottom:'1px solid rgba(255,255,255,.06)'}}>
              <span className="panel-icon" style={{width:40, height:40, borderRadius:12, background:'linear-gradient(135deg, rgba(125,107,255,.16), rgba(125,107,255,.06))'}}><Users size={18} /></span>
              <div>
                <h2 style={{display:'flex',alignItems:'center',gap:8}}>Recent visitors <span style={{fontSize:11, padding:'3px 8px', borderRadius:999, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.08)'}}>{filteredVisits.length} shown</span></h2>
                <p>Kick (15 min) or ban • Live • Searchable</p>
              </div>
              <span style={{marginLeft:'auto', display:'flex',alignItems:'center',gap:6, fontSize:11, opacity:.6}}><Activity size={12}/> Real-time</span>
            </div>
            <div className="visit-list" style={{gap:8, maxHeight:420}}>
              {filteredVisits.length === 0 && (
                <p className="empty-state" style={{border:'1px dashed rgba(255,255,255,.12)', background:'rgba(255,255,255,.02)', borderRadius:14, padding:22}}><LayoutDashboard size={20} /> No visits logged yet — play a game to see it here.</p>
              )}
              {filteredVisits.map((v) => (
                <div className="visit-row" key={v.id} style={{padding:'12px 14px', borderRadius:14, background:'rgba(0,0,0,.22)', border:'1px solid rgba(255,255,255,.06)', transition:'border-color .2s'}}>
                  <div className="row-main" style={{gap:4}}>
                    <strong style={{display:'flex',alignItems:'center',gap:8, fontSize:13}}><span style={{width:28, height:28, borderRadius:999, background:'linear-gradient(135deg, #7d6bff, #5a48d6)', color:'#fff', display:'grid', placeItems:'center', fontSize:10, fontWeight:900}}>{v.ip.slice(0,2).toUpperCase()}</span> {v.ip} <span style={{fontSize:10, padding:'2px 7px', borderRadius:999, background:'rgba(215,243,74,.14)', border:'1px solid rgba(215,243,74,.25)', color:'var(--lime)'}}>{v.path}</span></strong>
                    <span style={{display:'flex',alignItems:'center',gap:6, fontSize:11, opacity:.6}}>
                      {shortUa(v.ua)} • {timeAgo(v.createdAt)} <span style={{width:6,height:6,borderRadius:999,background:'#22c55e', display:'inline-block', boxShadow:'0 0 6px #22c55e'}}/>
                    </span>
                  </div>
                  <div className="row-actions" style={{gap:6}}>
                    <button className="btn-mini" title="Kick for 15 minutes" onClick={() => void action({ action: 'kick', identifier: v.ip, minutes: 15 })} style={{padding:'7px 12px', borderRadius:10, fontSize:11}}>
                      <Clock size={13} /> Kick
                    </button>
                    <button className="btn-mini danger" title="Ban permanently" onClick={() => void action({ action: 'ban', identifier: v.ip, reason: 'Banned by admin' })} style={{padding:'7px 12px', borderRadius:10}}>
                      <Ban size={13} /> Ban
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="side-stack" id="bans" style={{gap:14}}>
            <form
              className="admin-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void action({ action: 'ban', identifier, reason });
                setIdentifier('');
                setReason('');
              }}
              style={{borderRadius:18, background:'linear-gradient(135deg, rgba(255,108,131,.08), rgba(255,255,255,.02))', border:'1px solid rgba(255,255,255,.08)', padding:18}}
            >
              <div className="panel-heading" style={{marginBottom:12}}>
                <span className="panel-icon" style={{background:'rgba(255,108,131,.14)', color:'#ff6c83'}}><Gavel size={18} /></span>
                <div>
                  <h2 style={{fontSize:15}}>Ban a visitor</h2>
                  <p>Block an IP or fingerprint — instant.</p>
                </div>
              </div>
              <label htmlFor="identifier" style={{fontSize:10, letterSpacing:'.08em', opacity:.7}}>Identifier (IP)</label>
              <input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="1.2.3.4 or fingerprint" style={{padding:'12px 14px', borderRadius:12, background:'rgba(0,0,0,.28)', border:'1px solid rgba(255,255,255,.10)'}} />
              <label htmlFor="reason" style={{fontSize:10, letterSpacing:'.08em', opacity:.7, marginTop:10}}>Reason</label>
              <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why are they banned? (visible in logs)" style={{padding:'12px 14px', borderRadius:12, background:'rgba(0,0,0,.28)', border:'1px solid rgba(255,255,255,.10)', resize:'none'}} />
              <button type="submit" className="btn-primary" style={{width:'100%', marginTop:12, padding:'12px', borderRadius:12, background:'linear-gradient(135deg, #ff6c83, #ff3b6b)', boxShadow:'0 8px 20px rgba(255,108,131,.25)'}}><Ban size={15} /> Add ban</button>
            </form>

            <section className="admin-panel" style={{borderRadius:18, padding:18}}>
              <div className="panel-heading" style={{marginBottom:12}}>
                <span className="panel-icon"><Ban size={18} /></span>
                <div>
                  <h2 style={{fontSize:15}}>Active bans <span style={{fontSize:11, padding:'3px 8px', borderRadius:999, background: data.bans.length?'rgba(255,92,92,.14)':'rgba(255,255,255,.06)', border:'1px solid rgba(255,92,92,.22)', color: data.bans.length? '#ff8f8f':'rgba(255,255,255,.5)'}}>{data.bans.length}</span></h2>
                  <p>{data.bans.length === 0 ? 'Peace reigns' : 'Tap trash to lift'}</p>
                </div>
              </div>
              {filteredBans.length === 0 && <p className="empty-state" style={{padding:18, borderRadius:12}}><ShieldCheck size={18} /> {search? 'No bans match search.' : 'Nobody is banned. Peace reigns.'}</p>}
              <div style={{display:'grid', gap:8, maxHeight:260, overflowY:'auto'}}>
                {filteredBans.map((b) => (
                  <div className="ban-row" key={b.id} style={{padding:'10px 12px', borderRadius:12, background:'rgba(0,0,0,.22)', border:'1px solid rgba(255,255,255,.06)'}}>
                    <div className="row-main">
                      <strong style={{fontSize:13, display:'flex',alignItems:'center',gap:6}}><ShieldAlert size={12} color="#ff8f8f"/>{b.identifier}</strong>
                      <span style={{fontSize:11, opacity:.6}}>
                        {b.reason || 'No reason provided'}
                        {b.expiresAt ? ` • lifts ${timeAgo(b.expiresAt) === 'just now' ? 'soon' : timeAgo(b.expiresAt)}` : ' • permanent'}
                      </span>
                    </div>
                    <button className="btn-icon danger" onClick={() => void remove('ban', b.id)} aria-label="Remove ban" style={{width:32, height:32, borderRadius:10}}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}
      {(activeTab==="overview" || activeTab==="publish") && (
        <section className="admin-panel admin-wide" id="publish" style={{borderRadius:18, background:'linear-gradient(135deg, rgba(125,107,255,.10), rgba(255,255,255,.03))', border:'1px solid rgba(255,255,255,.08)', padding:20}}>
          <div className="panel-heading" style={{marginBottom:16}}>
            <span className="panel-icon" style={{background:'rgba(125,107,255,.16)', color:'var(--violet)'}}><Upload size={18} /></span>
            <div>
              <h2 style={{display:'flex',alignItems:'center',gap:8}}>Publish a game <span style={{fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(215,243,74,.14)', border:'1px solid rgba(215,243,74,.25)', color:'var(--lime)'}}>INSTANT • 50MB</span></h2>
              <p>Upload an index.html — it goes live in the lounge permanently.</p>
            </div>
          </div>
          <form id="pub-form" className="upload-form" onSubmit={publish} style={{gap:14, gridTemplateColumns:'1fr 1fr 1fr'}}>
            <div>
              <label htmlFor="pub-title" style={{display:'flex',alignItems:'center',gap:6, fontSize:10}}><FileCode size={12}/> Game title</label>
              <input id="pub-title" value={pubTitle} onChange={(e) => setPubTitle(e.target.value)} required maxLength={80} placeholder="My Awesome Game" style={{padding:'12px 14px', borderRadius:12}} />
            </div>
            <div>
              <label htmlFor="pub-icon" style={{display:'flex',alignItems:'center',gap:6, fontSize:10}}><ImageIcon size={12}/> Icon / favicon</label>
              <label htmlFor="pub-icon" style={{display:'flex',alignItems:'center',gap:10, padding:'10px 12px', borderRadius:12, border:'1px solid rgba(255,255,255,.12)', background:'rgba(0,0,0,.22)', cursor:'pointer'}}>
                {pubIconPreview ? <img src={pubIconPreview} alt="icon preview" style={{width:32, height:32, borderRadius:8, objectFit:'cover', border:'1px solid rgba(255,255,255,.12)'}}/> : <span style={{width:32, height:32, borderRadius:8, background:'rgba(255,255,255,.06)', display:'grid', placeItems:'center'}}><ImageIcon size={14}/></span>}
                <span style={{fontSize:12, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{pubIcon? pubIcon.name : 'Choose icon (optional)'}</span>
                <span style={{fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.08)'}}>{pubIcon? '✓': 'PNG'}</span>
                <input id="pub-icon" type="file" accept="image/*" onChange={(e) => setPubIcon(e.target.files?.[0] ?? null)} style={{display:'none'}} />
              </label>
            </div>
            <div>
              <label htmlFor="pub-file" style={{display:'flex',alignItems:'center',gap:6, fontSize:10}}><FileCode size={12}/> index.html</label>
              <label htmlFor="pub-file" style={{display:'flex',alignItems:'center',gap:10, padding:'10px 12px', borderRadius:12, border: pubFile? '1px solid rgba(215,243,74,.35)':'1px dashed rgba(255,255,255,.18)', background: pubFile? 'rgba(215,243,74,.08)':'rgba(255,255,255,.03)', cursor:'pointer'}}>
                <span style={{width:32, height:32, borderRadius:8, background: pubFile? 'var(--lime)':'rgba(255,255,255,.06)', color: pubFile? '#0b0d12':'var(--muted)', display:'grid', placeItems:'center'}}><Upload size={14}/></span>
                <span style={{fontSize:12, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontWeight:700}}>{pubFile? pubFile.name : 'Choose index.html'}</span>
                <input id="pub-file" type="file" accept=".html,text/html" required onChange={(e) => setPubFile(e.target.files?.[0] ?? null)} style={{display:'none'}} />
              </label>
            </div>
            <div className="upload-actions" style={{gridColumn:'1/-1', display:'flex',gap:10, alignItems:'center', marginTop:4}}>
              <button type="submit" className="btn-primary" disabled={!!pubProgress} style={{padding:'12px 22px', borderRadius:12, background:'linear-gradient(135deg, var(--violet), #7d6bff)', boxShadow:'0 8px 20px rgba(125,107,255,.25)'}}>
                <Gamepad2 size={15} /> {pubProgress ? `Uploading ${pubProgress.done}/${pubProgress.total}…` : 'Publish now'}
              </button>
              {pubProgress && (
                <div className="progress-bar" style={{flex:1, height:8, background:'rgba(125,107,255,.14)'}}>
                  <div style={{ width: `${Math.round((pubProgress.done / pubProgress.total) * 100)}%`, background:'var(--violet)' }} />
                </div>
              )}
              <span style={{fontSize:11, opacity:.6, display:'flex',alignItems:'center',gap:6}}><Zap size={12}/> Auto-chunked • Permanent</span>
            </div>
          </form>
          {pubMessage && <p className={`pub-message${pubMessage.startsWith('Published') ? ' ok' : ''}`} style={{marginTop:12, padding:'10px 14px', borderRadius:12, border: pubMessage.startsWith('Published')? '1px solid rgba(34,197,94,.25)':'1px solid rgba(255,92,92,.22)', background: pubMessage.startsWith('Published')? 'rgba(34,197,94,.12)':'rgba(255,92,92,.10)', display:'flex',alignItems:'center',gap:8}}>{pubMessage.startsWith('Published')? <Check size={14} color="#22c55e"/> : <ShieldAlert size={14} color="#ff8f8f"/>}{pubMessage}</p>}
        </section>
      )}
      {(activeTab==="overview" || activeTab==="requests") && (
        <section className="admin-panel admin-wide" id="requests" style={{borderRadius:18, padding:20}}>
          <div className="panel-heading" style={{marginBottom:14}}>
            <span className="panel-icon" style={{background:'rgba(215,243,74,.16)'}}><Inbox size={18} /></span>
            <div>
              <h2 style={{display:'flex',alignItems:'center',gap:8}}>Game requests <span style={{fontSize:11, padding:'4px 10px', borderRadius:999, background: pending.length? 'rgba(255,190,70,.14)':'rgba(255,255,255,.06)', border: pending.length? '1px solid rgba(255,190,70,.25)':'1px solid rgba(255,255,255,.08)', color: pending.length? '#f59e0b':'rgba(255,255,255,.6)'}}>{pending.length} pending</span></h2>
              <p>Approve or deny community HTML uploads — preview first, publish instantly.</p>
            </div>
          </div>
          {data.requests.length === 0 && <p className="empty-state" style={{padding:20}}><Inbox size={20} /> No requests yet — community is quiet.</p>}
          <div style={{display:'grid', gap:10}}>
            {data.requests.map((r) => (
              <div className="request-row" key={r.id} style={{padding:'12px 14px', borderRadius:14, background:'rgba(0,0,0,.22)', border:'1px solid rgba(255,255,255,.06)'}}>
                <div className="row-main">
                  <strong style={{display:'flex',alignItems:'center',gap:8, fontSize:14}}>
                    {r.icon ? <img src={r.icon} alt="" style={{width:28, height:28, borderRadius:8, objectFit:'cover', border:'1px solid rgba(255,255,255,.12)'}}/> : <span style={{width:28, height:28, borderRadius:8, background:'linear-gradient(135deg, #7d6bff, #5a48d6)', color:'#fff', display:'grid', placeItems:'center', fontSize:10, fontWeight:900}}>{r.title.slice(0,2).toUpperCase()}</span>}
                    {r.title}
                  </strong>
                  <span style={{display:'flex',alignItems:'center',gap:6}}>
                    <em className={`pill ${r.status}`} style={{fontSize:10}}>{r.status}</em> • {timeAgo(r.createdAt)} <span style={{opacity:.5}}>• ID {r.id.slice(0,6)}</span>
                  </span>
                </div>
                <div className="row-actions" style={{gap:6}}>
                  <a className="btn-mini" href={`/api/admin/preview?id=${encodeURIComponent(r.id)}&kind=request`} target="_blank" rel="noreferrer" style={{padding:'8px 12px', borderRadius:10}}>
                    <Eye size={13} /> Preview
                  </a>
                  {r.status === 'pending' && (
                    <>
                      <button className="btn-mini ok" onClick={() => void action({ action: 'publish', id: r.id })} style={{padding:'8px 12px', borderRadius:10}}>
                        <Check size={13} /> Publish
                      </button>
                      <button className="btn-mini danger" onClick={() => void action({ action: 'deny', id: r.id })} style={{padding:'8px 12px', borderRadius:10}}>
                        <X size={13} /> Deny
                      </button>
                    </>
                  )}
                  <button className="btn-icon danger" onClick={() => void remove('request', r.id)} aria-label="Delete request" style={{width:32, height:32, borderRadius:10}}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {(activeTab==="overview" || activeTab==="games") && (
        <section className="admin-panel admin-wide" id="games" style={{borderRadius:18, padding:20}}>
          <div className="panel-heading" style={{marginBottom:14}}>
            <span className="panel-icon" style={{background:'rgba(215,243,74,.16)'}}><Play size={18} /></span>
            <div>
              <h2 style={{display:'flex',alignItems:'center',gap:8}}>Published games <span style={{fontSize:11, padding:'4px 10px', borderRadius:999, background:'rgba(215,243,74,.14)', border:'1px solid rgba(215,243,74,.25)', color:'var(--lime)'}}>{data.games.length}</span></h2>
              <p>{data.games.length} permanent community games — visible in Library → Community.</p>
            </div>
          </div>
          {data.games.length === 0 && <p className="empty-state"><Gamepad2 size={20} /> Nothing published yet — use the publish form above or approve a request.</p>}
          <div style={{display:'grid', gap:10}}>
            {data.games.map((g) => (
              <div className="request-row" key={g.id} style={{padding:'12px 14px', borderRadius:14, background:'rgba(0,0,0,.22)', border:'1px solid rgba(255,255,255,.06)'}}>
                <div className="row-main">
                  <strong style={{display:'flex',alignItems:'center',gap:8}}>
                    {g.icon ? <img src={g.icon} alt="" style={{width:28, height:28, borderRadius:8, objectFit:'cover'}}/> : <span style={{width:28, height:28, borderRadius:8, background:'var(--lime)', color:'#0b0d12', display:'grid', placeItems:'center', fontSize:10, fontWeight:900}}>{g.title.slice(0,2).toUpperCase()}</span>}
                    {g.title}
                  </strong>
                  <span style={{opacity:.6, fontSize:11}}>Published {timeAgo(g.createdAt)} • ID {g.id.slice(0,6)}</span>
                </div>
                <div className="row-actions">
                  <a className="btn-mini" href={`/games/${encodeURIComponent(g.id)}`} target="_blank" rel="noreferrer" style={{borderRadius:10}}>
                    <Play size={13} /> Play
                  </a>
                  <button className="btn-mini danger" onClick={() => void remove('game', g.id)} style={{borderRadius:10}}>
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
