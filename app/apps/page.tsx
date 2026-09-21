'use client';
import { useEffect, useState } from 'react';
import { Gamepad2, Globe, Search, Heart, ArrowUpRight } from 'lucide-react';
import { apps, appLaunchUrl } from '@/lib/apps';
export default function AppsPage() {
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
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 22 }}>The launcher checks its connection before opening a site. Video and realtime apps need a reachable Wisp backend; school filters, accounts, DRM and cloud-provider restrictions may still prevent playback.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}><label className="search-box" style={{ flex: 1, minWidth: 240 }}><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search apps" placeholder="Search apps…"/></label><select aria-label="App category" value={category} onChange={event => setCategory(event.target.value)} style={{ background: 'var(--panel)', color: 'var(--foreground)', padding: 12, borderRadius: 8 }}>{['All', ...new Set(apps.map(app => app.genre))].map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="game-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 18 }}>{filtered.map(app => <article key={app.id} className={`game-card ${app.color}`} style={{ padding: 22, minHeight: 245 }}>
        <button className="favorite-button" aria-label={`${favorites.includes(app.id) ? 'Unsave' : 'Save'} ${app.title}`} onClick={() => toggle(app.id)}><Heart size={16} fill={favorites.includes(app.id) ? 'currentColor' : 'none'}/></button>
        <span className={`game-badge ${app.color}`} style={{ display: 'grid', placeItems: 'center', width: 52, height: 52, fontSize: 22 }}>{app.mark}</span><p className="card-kicker" style={{ marginTop: 16 }}>{app.genre}</p><h2 style={{ fontSize: 23, margin: '6px 0' }}>{app.title}</h2><p style={{ color: 'var(--muted)', fontSize: 13, minHeight: 60 }}>{app.description}</p><a className="play-button" href={appLaunchUrl(app.url)}>Open in Scramjet <ArrowUpRight size={14}/></a>
      </article>)}</div>{!filtered.length && <p className="empty-state">No apps match this search.</p>}
    </section>
  </main>;
}
