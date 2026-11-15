'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Search, Video } from 'lucide-react';

/**
 * GG-Lounge YouTube player.
 *
 * Why not youtube.com? The official site and embed are blocked on most school
 * networks and cannot be proxied reliably. This page instead uses the app's own
 * relay (`/api/yt/*`), which speaks to YouTube through the same relay pool the
 * rest of the lounge uses, and plays the proxied stream in a native <video>
 * element. Everything is served same-origin.
 *
 * Failure states are explicit: an offline browser, a relay outage, and an
 * unavailable video are three different things and get three different
 * messages instead of a generic "no internet".
 */

type VideoItem = {
  url?: string;
  type?: string;
  title?: string;
  name?: string;
  thumbnail?: string;
  uploaderName?: string;
  uploader?: string;
  duration?: number;
  views?: number;
  uploadedDate?: string;
  uploaded?: number;
};

type RelayState = { state: 'checking' | 'ok' | 'offline' | 'relay-down'; detail: string };

function normalise(item: VideoItem) {
  const id = (item.url || '').replace(/^\/watch\?v=/, '').split('&')[0];
  return {
    id,
    title: item.title || item.name || 'Untitled',
    thumbnail: item.thumbnail,
    channel: item.uploaderName || item.uploader || '',
    duration: item.duration ?? null,
    views: item.views ?? null,
    uploaded: item.uploadedDate || '',
  };
}

const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

export default function YouTubePage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ReturnType<typeof normalise>[]>([]);
  const [loading, setLoading] = useState(false);
  const [relay, setRelay] = useState<RelayState>({ state: 'checking', detail: '' });
  const [playing, setPlaying] = useState<{ id: string; title: string; src: string; audio: string } | null>(null);
  const [playError, setPlayError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const probeRelay = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setRelay({ state: 'offline', detail: 'This browser reports no network connection.' });
      return;
    }
    try {
      const response = await fetch('/api/yt/status', { cache: 'no-store' });
      const data = await response.json();
      setRelay(data.ok
        ? { state: 'ok', detail: `Relay ${String(data.instance || '').replace(/^https?:\/\//, '')}` }
        : { state: 'relay-down', detail: data.reason === 'egress_blocked' ? 'This deployment cannot reach any video relay.' : 'Every video relay is refusing requests right now.' });
    } catch {
      setRelay({ state: 'relay-down', detail: 'The status check itself failed.' });
    }
  }, []);

  const load = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/yt/${path}`, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setRelay({ state: 'relay-down', detail: body?.detail || `Relay returned ${response.status}.` });
        setItems([]);
        return;
      }
      const data = await response.json();
      const list: VideoItem[] = Array.isArray(data) ? data : data.items || data.relatedStreams || [];
      setItems(list.map(normalise).filter(item => item.id));
      setRelay(current => (current.state === 'checking' ? { state: 'ok', detail: '' } : current));
    } catch {
      setRelay({ state: 'relay-down', detail: 'Could not reach this deployment’s relay.' });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const openVideo = useCallback(async (id: string, title: string) => {
    setPlayError('');
    setLoading(true);
    try {
      const response = await fetch(`/api/yt/streams/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setPlayError(data?.detail || 'This video could not be resolved by the relay.');
        return;
      }
      const streams: Array<{ url: string; videoOnly?: boolean; mimeType?: string }> = data.videoStreams || [];
      const audios: Array<{ url: string; mimeType?: string }> = data.audioStreams || [];
      const combined = streams.find(stream => !stream.videoOnly) || streams[0];
      const audio = audios[0];
      if (!combined) { setPlayError('No playable stream was returned for this video.'); return; }
      setPlaying({
        id,
        title: data.title || title,
        src: `/api/yt/media?url=${encodeURIComponent(combined.url)}`,
        audio: audio ? `/api/yt/media?url=${encodeURIComponent(audio.url)}` : '',
      });
    } catch {
      setPlayError('The relay did not answer when resolving this video.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { probeRelay(); load('trending?region=US'); }, [probeRelay, load]);
  useEffect(() => {
    const online = () => probeRelay();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [probeRelay]);

  function search(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    load(`search?q=${encodeURIComponent(term)}&filter=videos`);
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/"><span className="brand-mark"><Video size={17} /></span><span>GG-LOUNGE<span className="tm">™</span></span></a>
        <nav className="header-nav"><a href="/">Library</a><a href="/apps">Apps</a><a href="/proxy">Proxy</a></nav>
      </header>
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 24px 60px' }}>
        <a href="/apps" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}><ArrowLeft size={14} /> Apps</a>
        <h1 style={{ margin: '10px 0 4px', fontSize: 32 }}>YouTube</h1>
        <p role="status" style={{ color: relay.state === 'ok' ? 'var(--muted)' : '#ffb4a2', fontSize: 13, minHeight: 20 }}>
          {relay.state === 'checking' && 'Checking the video relay…'}
          {relay.state === 'ok' && `Working${relay.detail ? ` · ${relay.detail}` : ''}`}
          {relay.state === 'offline' && 'This browser reports no network connection — reconnect and try again.'}
          {relay.state === 'relay-down' && `${relay.detail} Your own connection is not the problem.`}
        </p>

        <form onSubmit={search} className="search-box" style={{ margin: '14px 0 22px' }}>
          <Search size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search YouTube…" aria-label="Search YouTube" />
        </form>

        {playing && (
          <div style={{ marginBottom: 26 }}>
            <video
              ref={videoRef}
              key={playing.src}
              src={playing.src}
              controls
              autoPlay
              playsInline
              onError={() => setPlayError('The stream could not be played through this relay (it may be region-locked or removed).')}
              style={{ width: '100%', borderRadius: 14, background: '#000', maxHeight: '62vh' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 12 }}>
              <strong style={{ fontSize: 15 }}>{playing.title}</strong>
              <button onClick={() => { setPlaying(null); setPlayError(''); }} style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 999, padding: '6px 14px', color: 'inherit', cursor: 'pointer' }}>Close</button>
            </div>
            {playing.audio && <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>If the audio track is separate, it is proxied at the same origin and will play in sync in most browsers.</p>}
            {playError && <p style={{ color: '#ffb4a2', fontSize: 13 }}>{playError}</p>}
          </div>
        )}

        {playError && !playing && <p style={{ color: '#ffb4a2', fontSize: 13 }}>{playError}</p>}
        {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}

        <div className="game-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
          {items.map(item => (
            <button key={item.id} onClick={() => openVideo(item.id, item.title)} className="game-card" style={{ textAlign: 'left', padding: 0, overflow: 'hidden', cursor: 'pointer', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14 }}>
              <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#111' }}>
                {item.thumbnail && <img src={`/api/yt/img?url=${encodeURIComponent(item.thumbnail)}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', opacity: 0.85 }}><Play size={26} /></span>
                {item.duration && <span style={{ position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,.75)', color: '#fff', fontSize: 11, padding: '2px 6px', borderRadius: 5 }}>{formatDuration(item.duration)}</span>}
              </div>
              <div style={{ padding: '10px 12px 14px' }}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.title}</p>
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>{item.channel}{item.uploaded ? ` · ${item.uploaded}` : ''}</p>
              </div>
            </button>
          ))}
        </div>
        {!loading && !items.length && relay.state !== 'checking' && (
          <p className="empty-state">Nothing to show yet. {relay.state === 'relay-down' ? 'The relay is unavailable, so search results cannot load.' : 'Try a search.'}</p>
        )}
      </section>
    </main>
  );
}
