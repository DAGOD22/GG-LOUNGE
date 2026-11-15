'use client';
import { useEffect, useState } from 'react';
import { Gamepad2, Globe, Search, Heart, ArrowUpRight } from 'lucide-react';
import { apps, appLaunchUrl } from '@/lib/apps';
type RelayStatus = { ok: boolean; reason: string; detail: string; instance: string | null };

/**
 * Tells the truth about why a proxied app may not load.
 *
 * "No internet" was being shown whenever the relay/channel failed, even when
 * the visitor's connection was perfectly fine. This probe distinguishes the
 * visitor's connection from ours and only mentions the network when the
 * browser really is offline.
 */
function RelayNotice({ status, browserOnline }: { status: RelayStatus | null; browserOnline: boolean }) {
  if (!browserOnline) {
    return <p className="notice notice-warn" role="status">This browser reports no internet connection. Reconnect and the launcher will pick up automatically.</p>;
  }
  if (!status) return <p className="notice" role="status">Checking the proxy relay…</p>;
  if (status.ok) {
    const remote = /^wss?:\/\//i.test(status.instance || '');
    return <p className="notice" role="status">{remote
      ? `Proxy relay reachable via ${String(status.instance).replace(/^wss?:\/\//, '')}.`
      : 'This server runs its own proxy relay, so proxied sites are reachable from here.'} Sites that refuse proxies (accounts, DRM, cloud streaming) still fail by design.</p>;
  }
  const message = status.reason === 'egress_blocked'
    ? 'Your connection is fine — this deployment cannot reach the proxy relay from its server network. Set WISP_URL to a relay you control, or self-host the Wisp backend.'
    : status.reason === 'timeout'
      ? 'Your connection is fine — the proxy relay did not answer in time. Retry in a moment.'
      : 'Your connection is fine — every known proxy relay is currently refusing requests. This is an upstream outage, not your network.';
  return <p className="notice notice-warn" role="status">{message}</p>;
}

export default function AppsPage() {
  const [relay, setRelay] = useState<RelayStatus | null>(null);
  const [browserOnline, setBrowserOnline] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const sync = () => setBrowserOnline(navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    fetch('/api/proxy/config', { cache: 'no-store' })
      .then(response => (response.ok ? response.json() : null))
      .then(config => {
        if (cancelled) return;
        if (!config) { setRelay({ ok: false, reason: 'relay_down', detail: 'config unavailable', instance: null }); return; }
        // A local/relative Wisp (server picks it up at runtime) is reachable;
        // only a deployment with no relay at all counts as blocked.
        const endpoint = typeof config.wisp === 'string' ? config.wisp : '';
        setRelay(endpoint
          ? { ok: true, reason: 'ok', detail: '', instance: endpoint }
          : { ok: false, reason: 'egress_blocked', detail: 'no Wisp relay on this deployment', instance: null });
      })
      .catch(() => { if (!cancelled) setRelay({ ok: false, reason: 'relay_down', detail: 'config request failed', instance: null }); });
    return () => { cancelled = true; window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem('ggl_app_fav') || '[]'); if (Array.isArray(saved)) setFavorites(saved.filter(value => typeof value === 'string')); } catch {} }, []);
  function toggle(id: string) { setFavorites(current => { const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id]; try { localStorage.setItem('ggl_app_fav', JSON.stringify(next)); } catch {} return next; }); }
  const filtered = apps.filter(app => (category === 'All' || app.genre === category) && `${app.title} ${app.description}`.toLowerCase().includes(query.toLowerCase()));
  return <main>
    <header className="site-header"><a className="brand" href="/"><span className="brand-mark"><Gamepad2 size={17}/></span><span>GG-LOUNGE<span className="tm">™</span></span></a><nav className="header-nav"><a href="/">Library</a><a href="/apps" aria-current="page">Apps</a><a href="/proxy">Proxy</a><a href="/request-game">Request</a></nav></header>
    <section className="hero" style={{ minHeight: 300, paddingBottom: 38 }}><div className="hero-copy"><p className="eyebrow">POWERED BY SCRAMJET</p><h1>One place.<br/><em>Your apps.</em></h1><p className="hero-text">A shared, self-hosted browser engine—not a collection of broken embedded launch pages.</p><a className="hero-link" href="/proxy"><Globe size={16}/> Open browser <ArrowUpRight size={16}/></a></div></section>
    <section style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px 60px' }}>
      <RelayNotice status={relay} browserOnline={browserOnline} />
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 22 }}>Video and realtime apps need a reachable Wisp backend; school filters, accounts, DRM and cloud-provider restrictions may still prevent playback.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}><label className="search-box" style={{ flex: 1, minWidth: 240 }}><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search apps" placeholder="Search apps…"/></label><select aria-label="App category" value={category} onChange={event => setCategory(event.target.value)} style={{ background: 'var(--panel)', color: 'var(--foreground)', padding: 12, borderRadius: 8 }}>{['All', ...new Set(apps.map(app => app.genre))].map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="game-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 18 }}>{filtered.map(app => <article key={app.id} className={`game-card ${app.color}`} style={{ padding: 22, minHeight: 245 }}>
        <button className="favorite-button" aria-label={`${favorites.includes(app.id) ? 'Unsave' : 'Save'} ${app.title}`} onClick={() => toggle(app.id)}><Heart size={16} fill={favorites.includes(app.id) ? 'currentColor' : 'none'}/></button>
        <span className={`game-badge ${app.color}`} style={{ display: 'grid', placeItems: 'center', width: 52, height: 52, fontSize: 22 }}>{app.mark}</span><p className="card-kicker" style={{ marginTop: 16 }}>{app.genre}</p><h2 style={{ fontSize: 23, margin: '6px 0' }}>{app.title}</h2><p style={{ color: 'var(--muted)', fontSize: 13, minHeight: 60 }}>{app.description}</p><a className="play-button" href={app.id === 'youtube' ? '/youtube' : appLaunchUrl(app.url)}>{app.id === 'youtube' ? 'Open player' : 'Open in Scramjet'} <ArrowUpRight size={14}/></a>
      </article>)}</div>{!filtered.length && <p className="empty-state">No apps match this search.</p>}
    </section>
  </main>;
}
