'use client';

/**
 * CHATVERSE — the room.
 *
 * The whole design is around one promise: **what you see is what people typed.**
 * There is no welcome message, no system line, no bot, no seed data. An empty
 * room renders "no messages yet" because that is the truth.
 *
 * Realtime is a long poll (`/api/chat/poll`), not a socket, because the host
 * cannot hold one open. The poll carries a message id watermark, so:
 *
 *   · the first load after opening a room asks for everything at once (fast),
 *   · after that each poll returns only what arrived since, and returns
 *     immediately when something does,
 *   · a dropped connection just retries — there is no state to rebuild, because
 *     the watermark is the state.
 *
 * Sending is optimistic but *not* silently: the message is drawn with a "sending"
 * mark, and if the server refuses it is removed and the text is put back in the
 * box, so a failed send never looks like a sent one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, Hash, Plus, X, LogOut, Image as ImageIcon, Loader2, Users, Trash2, Check, AlertTriangle, CornerDownLeft,
} from 'lucide-react';
import type { ChatMessage, ChatRoom } from '@/lib/db/chat';

type Pending = ChatMessage & { pending?: boolean; failed?: boolean };

const NAME_KEY = 'ggl_chatverse_name';

export function ChatverseApp() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [room, setRoom] = useState<string>('');
  const [messages, setMessages] = useState<Pending[]>([]);
  const [here, setHere] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [name, setName] = useState('Member');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newRoom, setNewRoom] = useState('');
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');

  const watermark = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const stop = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) setName(saved);
  }, []);

  /* ------------------------------- rooms ---------------------------------- */

  const loadRooms = useCallback(async () => {
    const response = await fetch('/api/chat/rooms', { cache: 'no-store' });
    if (response.status === 401) {
      window.location.reload();
      return;
    }
    const data = await response.json().catch(() => ({ rooms: [] }));
    const list: ChatRoom[] = data.rooms ?? [];
    setRooms(list);
    setStatus('ready');
    // Land in the most recently active room, or the first one. Never invent a
    // room: if there are none, the empty state explains how to make one.
    setRoom(current => current || list[0]?.id || '');
  }, []);

  useEffect(() => {
    loadRooms().catch(() => {
      setStatus('error');
      setError('Could not load the rooms.');
    });
  }, [loadRooms]);

  /* ------------------------------ messages -------------------------------- */

  /** Replace the list with what the server has, keeping any in-flight sends. */
  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages(current => {
      const byId = new Map<number, Pending>();
      for (const message of current) byId.set(message.id, message);
      // Any optimistic row the server has now confirmed is dropped, because the
      // authoritative copy is about to be inserted under its real id.
      for (const message of incoming) {
        byId.set(message.id, message);
        if (message.author === name && message.body) {
          for (const [id, row] of byId) if (row.pending && row.body === message.body) byId.delete(id);
        }
      }
      const next = [...byId.values()].sort((a, b) => a.id - b.id);
      const highest = next.reduce((max, message) => Math.max(max, message.id), 0);
      watermark.current = Math.max(watermark.current, highest);
      return next;
    });
  }, [name]);

  // Opening a room: reset the watermark and fetch the backlog once.
  useEffect(() => {
    if (!room) return;
    stop.current = false;
    watermark.current = 0;
    setMessages([]);
    setHere([]);
    stick.current = true;
    (async () => {
      try {
        const response = await fetch(
          `/api/chat/messages?room=${encodeURIComponent(room)}&after=0&who=${encodeURIComponent(name)}`,
          { cache: 'no-store' },
        );
        const data = await response.json().catch(() => ({ messages: [] }));
        merge(data.messages ?? []);
        setHere(data.here ?? []);
      } catch {
        setError('Could not load this room.');
      }
    })();
  }, [room, name, merge]);

  // The long poll. One in flight at a time; it self-heals on any error.
  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    const tick = async () => {
      while (!cancelled && !stop.current) {
        try {
          const response = await fetch(
            `/api/chat/poll?room=${encodeURIComponent(room)}&after=${watermark.current}`,
            { cache: 'no-store' },
          );
          if (response.status === 401) {
            window.location.reload();
            return;
          }
          if (!response.ok) {
            await sleep(1500);
            continue;
          }
          const data = await response.json().catch(() => ({ messages: [] }));
          if (cancelled) return;
          merge(data.messages ?? []);
          if (data.messages?.length) {
            // Presence piggybacks on the poll so "who is here" is never stale.
            void refreshHere();
          }
        } catch {
          await sleep(2000);
        }
      }
    };
    const refreshHere = async () => {
      try {
        const response = await fetch(
          `/api/chat/messages?room=${encodeURIComponent(room)}&after=${watermark.current}&who=${encodeURIComponent(name)}`,
          { cache: 'no-store' },
        );
        if (!response.ok) return;
        const data = await response.json();
        setHere(data.here ?? []);
        merge(data.messages ?? []);
      } catch {
        /* presence is best-effort */
      }
    };
    void tick();
    const heartbeat = window.setInterval(refreshHere, 9000);
    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
    };
  }, [room, name, merge]);

  // Keep the newest message in view, but only if the reader is already at the
  // bottom — scrolling someone away from history they are reading is worse than
  // missing a line.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const activeRoom = useMemo(() => rooms.find(entry => entry.id === room) ?? null, [rooms, room]);

  /* -------------------------------- send ---------------------------------- */

  const send = useCallback(async (body: string, media?: { url: string; name: string }) => {
    const text = body.trim();
    if ((!text && !media) || !room) return;
    const temp: Pending = {
      id: -Date.now(),
      room,
      author: name,
      body: text,
      media: media?.url ?? '',
      mediaName: media?.name ?? '',
      at: Date.now(),
      pending: true,
    };
    setMessages(current => [...current, temp]);
    setDraft('');
    stick.current = true;
    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room, author: name, body: text, media: media?.url, mediaName: media?.name }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Message not sent');
      }
      const data = await response.json();
      if (data?.message) merge([data.message]);
      setMessages(current => current.filter(message => message.id !== temp.id));
    } catch (cause) {
      // Never leave a failed send looking delivered.
      setMessages(current =>
        current.map(message =>
          message.id === temp.id ? { ...message, pending: false, failed: true } : message,
        ),
      );
      if (!text) setError((cause as Error).message);
    }
  }, [room, name, merge]);

  /* ------------------------------- rooms UI -------------------------------- */

  async function createRoom(event: React.FormEvent) {
    event.preventDefault();
    const value = newRoom.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/chat/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: value, by: name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? 'Could not create that room');
      setNewRoom('');
      setShowNewRoom(false);
      await loadRooms();
      if (data?.room?.id) setRoom(data.room.id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeRoom(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete('');
    await fetch('/api/chat/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    }).catch(() => {});
    if (room === id) setRoom('');
    await loadRooms();
  }

  /* ------------------------------- uploads --------------------------------- */

  async function upload(file: File | undefined) {
    if (!file || !room) return;
    setUploading(true);
    setError('');
    try {
      const response = await fetch(`/api/chat/media?room=${encodeURIComponent(room)}`, {
        method: 'POST',
        headers: { 'x-file-name': encodeURIComponent(file.name) },
        body: file,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? 'Could not upload that file');
      await send('', { url: data.url, name: data.name ?? file.name });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setUploading(false);
    }
  }

  // Paste a screenshot straight into the room.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find(entry => entry.type.startsWith('image/'));
      if (!item) return;
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        void upload(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  async function leave() {
    await fetch('/api/chat/logout', { method: 'POST' }).catch(() => {});
    window.location.reload();
  }

  if (status === 'loading') {
    return (
      <div className="cv-loading">
        <Loader2 size={20} className="cv-spin" />
        Opening CHATVERSE…
      </div>
    );
  }

  return (
    <div className="cv-app">
      {/* ---- rooms ---- */}
      <aside className="cv-rooms" aria-label="Rooms">
        <header className="cv-rooms-head">
          <p className="cv-overline">CHATVERSE</p>
          <h1>Rooms</h1>
          <button type="button" className="cv-icon-btn" onClick={leave} title="Lock CHATVERSE" aria-label="Lock CHATVERSE">
            <LogOut size={15} />
          </button>
        </header>

        <button type="button" className="cv-new-room" onClick={() => setShowNewRoom(v => !v)}>
          <Plus size={14} /> New room
        </button>

        {showNewRoom && (
          <form className="cv-new-room-form" onSubmit={createRoom}>
            <label className="sr-only" htmlFor="cv-room-name">Room name</label>
            <input
              id="cv-room-name"
              autoFocus
              maxLength={40}
              placeholder="e.g. late night"
              value={newRoom}
              onChange={event => setNewRoom(event.target.value)}
            />
            <button type="submit" disabled={!newRoom.trim() || busy}>
              {busy ? <Loader2 size={13} className="cv-spin" /> : <Check size={13} />}
            </button>
          </form>
        )}

        <ul className="cv-room-list">
          {rooms.map(entry => (
            <li key={entry.id}>
              <button
                type="button"
                className={`cv-room${entry.id === room ? ' active' : ''}`}
                onClick={() => setRoom(entry.id)}
                aria-current={entry.id === room ? 'page' : undefined}
              >
                <Hash size={13} />
                <span className="cv-room-name">{entry.name}</span>
                {entry.messages > 0 && <span className="cv-room-count">{entry.messages}</span>}
              </button>
              <button
                type="button"
                className={`cv-room-del${confirmDelete === entry.id ? ' armed' : ''}`}
                onClick={() => removeRoom(entry.id)}
                title={confirmDelete === entry.id ? 'Click again to delete' : 'Delete room'}
                aria-label={confirmDelete === entry.id ? `Delete ${entry.name} for everyone` : `Delete ${entry.name}`}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>

        {!rooms.length && (
          <p className="cv-empty-rooms">
            No rooms yet. Make the first one — it is the only way a room ever exists here.
          </p>
        )}

        <footer className="cv-rooms-foot">
          <label className="cv-name-field">
            <span>You are</span>
            <input
              value={name}
              maxLength={24}
              onChange={event => {
                const next = event.target.value;
                setName(next);
                localStorage.setItem(NAME_KEY, next);
              }}
              aria-label="Your display name in CHATVERSE"
            />
          </label>
        </footer>
      </aside>

      {/* ---- the room ---- */}
      <section className="cv-room-view" aria-label={activeRoom ? `Room ${activeRoom.name}` : 'No room selected'}>
        {!activeRoom ? (
          <div className="cv-room-empty">
            <Hash size={26} aria-hidden="true" />
            <h2>Pick a room</h2>
            <p>Or make one. Rooms are shared by everyone who has the password.</p>
          </div>
        ) : (
          <>
            <header className="cv-room-head">
              <div>
                <h2>
                  <Hash size={16} aria-hidden="true" />
                  {activeRoom.name}
                </h2>
                <p>
                  {activeRoom.messages === 0
                    ? 'No messages yet'
                    : `${activeRoom.messages} message${activeRoom.messages === 1 ? '' : 's'}`}
                  {activeRoom.createdBy ? ` · opened by ${activeRoom.createdBy}` : ''}
                </p>
              </div>
              <span className="cv-here" title="People in the room right now">
                <Users size={13} aria-hidden="true" />
                {Math.max(1, here.length)}
                <span className="cv-here-names">{here.slice(0, 4).join(', ')}</span>
              </span>
            </header>

            <div
              className="cv-messages"
              ref={scroller}
              onScroll={event => {
                const el = event.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
              {!messages.length && (
                <p className="cv-no-messages">
                  Nothing here yet. Messages appear for everyone in this room the moment they are sent —
                  and only when somebody sends one.
                </p>
              )}
              {messages.map(message => (
                <article
                  key={message.id}
                  className={`cv-msg${message.author === name ? ' mine' : ''}${message.pending ? ' pending' : ''}${message.failed ? ' failed' : ''}`}
                >
                  <span className="cv-msg-who">{message.author}</span>
                  <div className="cv-msg-body">
                    {message.body && <p>{message.body}</p>}
                    {message.media && (
                      <img
                        className="cv-msg-media"
                        src={message.media}
                        alt={message.mediaName || `Image from ${message.author}`}
                        loading="lazy"
                      />
                    )}
                  </div>
                  <span className="cv-msg-time">
                    {new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {message.pending && ' · sending'}
                    {message.failed && ' · not sent'}
                  </span>
                </article>
              ))}
            </div>

            <form
              className="cv-compose"
              onSubmit={event => {
                event.preventDefault();
                void send(draft);
              }}
            >
              <button
                type="button"
                className="cv-icon-btn"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                title="Upload a screenshot or image (or just paste one)"
                aria-label="Upload an image"
              >
                {uploading ? <Loader2 size={15} className="cv-spin" /> : <ImageIcon size={15} />}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/heic,video/mp4,video/webm"
                hidden
                onChange={event => {
                  void upload(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
                placeholder={`Message ${activeRoom.name}`}
                rows={1}
                maxLength={2000}
                aria-label="Message"
              />
              <button type="submit" className="cv-send" disabled={!draft.trim()}>
                <Send size={15} />
                <span className="sr-only">Send</span>
              </button>
            </form>
            <p className="cv-compose-hint">
              <CornerDownLeft size={11} aria-hidden="true" /> Enter sends · Shift+Enter is a new line · paste a screenshot
            </p>
          </>
        )}
      </section>

      {error && (
        <div className="cv-error" role="alert">
          <AlertTriangle size={14} />
          {error}
          <button type="button" onClick={() => setError('')} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
