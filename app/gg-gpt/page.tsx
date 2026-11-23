'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Brain, Image as ImageIcon, Loader2, Plus, Search, Send, Sparkles, Trash2, Video, X } from 'lucide-react';

type Chat = { id: string; title: string; updatedAt: string };
type ToolCard = { label: string; source: string; data?: Record<string, unknown> };
type Msg = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: string | null;
  media?: { kind: string; url: string; prompt: string };
  cards?: ToolCard[];
};
type Memory = { id: string; fact: string; createdAt: string };

/** Renders **bold**, `code`, fenced blocks and bullet lists without a dependency. */
function Markdown({ text }: { text: string }) {
  const blocks = text.split(/```(\w*)\n?([\s\S]*?)```/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i += 3) {
    const prose = blocks[i];
    if (prose) out.push(<Prose key={`p${i}`} text={prose} />);
    if (blocks[i + 2] !== undefined) {
      out.push(
        <pre key={`c${i}`} style={{ background: 'rgba(0,0,0,.45)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '12px 14px', overflowX: 'auto', fontSize: 12.5, lineHeight: 1.55 }}>
          <code>{blocks[i + 2]}</code>
        </pre>,
      );
    }
  }
  return <>{out}</>;
}

function Prose({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 8 }} />;
        const bullet = /^[-*•]\s+/.test(trimmed);
        const num = /^\d+\.\s+/.test(trimmed);
        const body = inline(bullet ? trimmed.replace(/^[-*•]\s+/, '') : num ? trimmed.replace(/^\d+\.\s+/, '') : trimmed);
        if (bullet || num) {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, margin: '3px 0', paddingLeft: 4 }}>
              <span style={{ opacity: 0.55, flex: '0 0 auto' }}>{bullet ? '•' : trimmed.match(/^\d+/)?.[0] + '.'}</span>
              <span>{body}</span>
            </div>
          );
        }
        return <p key={i} style={{ margin: '3px 0' }}>{body}</p>;
      })}
    </>
  );
}

function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={i} style={{ background: 'rgba(255,255,255,.1)', padding: '1px 5px', borderRadius: 5, fontSize: '0.92em' }}>{p.slice(1, -1)}</code>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

/**
 * Renders whatever a tool returned as a compact card: live game links, the
 * sources a search actually used, or the raw values behind a lookup. Seeing the
 * source is what makes a live-data answer trustworthy.
 */
function ToolCards({ cards }: { cards: ToolCard[] }) {
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {cards.map((card, i) => {
        const games = (card.data?.games as Array<{ id: string; title: string; genre: string }> | undefined) || [];
        const hits = (card.data?.hits as Array<{ title: string; url: string }> | undefined) || [];
        if (games.length) {
          return (
            <div key={i} style={cardBox}>
              <span style={cardLabel}>On GG-LOUNGE</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {games.map(g => (
                  <a key={g.id} href={`/g/${g.id}`} style={{ ...chip, textDecoration: 'none', cursor: 'pointer' }}>
                    {g.title} <span style={{ opacity: 0.5 }}>· {g.genre}</span>
                  </a>
                ))}
              </div>
            </div>
          );
        }
        if (hits.length) {
          return (
            <div key={i} style={cardBox}>
              <span style={cardLabel}>Sources · {card.source.replace('search:', '')}</span>
              <ol style={{ margin: '6px 0 0 16px', padding: 0, fontSize: 11.5, lineHeight: 1.5 }}>
                {hits.slice(0, 5).map((h, n) => (
                  <li key={n} style={{ marginBottom: 2 }}>
                    <a href={h.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', opacity: 0.85 }}>{h.title}</a>
                  </li>
                ))}
              </ol>
            </div>
          );
        }
        return (
          <div key={i} style={cardBox}>
            <span style={cardLabel}>{card.label} · {card.source}</span>
          </div>
        );
      })}
    </div>
  );
}

const SUGGESTIONS = [
  'What should I play tonight?',
  'What\'s the weather in Adelaide?',
  'Convert 180 USD to AUD',
  'Make a video of a cat surfing',
  'What\'s 15% off 240?',
  'Explain how raycasting works in Doom',
  'Generate an image of a neon arcade at midnight',
  'Best idle games on here and why',
];

export default function GgGptPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [chatId, setChatId] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showMemory, setShowMemory] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollDown = () => {
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const loadChat = useCallback(async (id: string) => {
    setChatId(id);
    setMessages([]);
    const res = await fetch('/api/gg-gpt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'messages', chatId: id }),
    });
    const data = await res.json().catch(() => ({ messages: [] }));
    const loaded: Msg[] = (data.messages || []).map((m: { id: string; role: string; content: string; meta: string | null }) => {
      let media;
      let cards;
      try {
        const parsed = m.meta ? JSON.parse(m.meta) : null;
        if (parsed?.kind && parsed?.url) media = parsed;
        else if (Array.isArray(parsed?.cards)) cards = parsed.cards;
      } catch { /* not media or cards */ }
      return { id: m.id, role: m.role === 'user' ? 'user' : 'assistant', content: m.content, meta: m.meta, media, cards };
    });
    setMessages(loaded);
    scrollDown();
  }, []);

  useEffect(() => {
    fetch('/api/gg-gpt')
      .then(r => r.json())
      .then(d => {
        setSignedIn(!!d.signedIn);
        setUsername(d.username ?? null);
        setChats(d.chats ?? []);
        setMemories(d.memories ?? []);
        if (d.chats?.length) loadChat(d.chats[0].id);
      })
      .catch(() => setError('Could not reach GG-GPT.'));
  }, [loadChat]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setError('');
    setMessages(m => [...m, { role: 'user', content: message }]);
    setBusy(true);
    scrollDown();

    // The assistant's bubble is created empty and filled as tokens arrive, so
    // the first words appear in about a second instead of after the whole reply.
    const assistantIndex = { current: -1 };
    setMessages(m => {
      assistantIndex.current = m.length;
      return [...m, { role: 'assistant', content: '' }];
    });

    const appendDelta = (delta: string) => {
      setMessages(m => {
        const next = [...m];
        const i = assistantIndex.current;
        if (i >= 0 && next[i]) next[i] = { ...next[i], content: next[i].content + delta };
        return next;
      });
      scrollDown();
    };

    try {
      const res = await fetch('/api/gg-gpt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'chat', message, chatId, stream: true }),
      });

      // A non-streaming response (media, rate limit, error) still arrives as JSON.
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('text/event-stream') || !res.body) {
        const data = await res.json().catch(() => ({ error: 'GG-GPT could not answer.' }));
        if (!res.ok) throw new Error(data.error || 'GG-GPT could not answer.');
        setMessages(m => {
          const next = [...m];
          const i = assistantIndex.current;
          if (i >= 0) next[i] = { role: 'assistant', content: data.text || '', media: data.media, cards: data.cards };
          return next;
        });
        if (data.chatId && data.chatId !== chatId) {
          setChatId(data.chatId);
          const list = await fetch('/api/gg-gpt').then(r => r.json()).catch(() => null);
          if (list?.chats) setChats(list.chats);
          if (list?.memories) setMemories(list.memories);
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let newChatId = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const cut = buffer.lastIndexOf('\n\n');
        if (cut === -1) continue;
        const frames = buffer.slice(0, cut).split('\n\n');
        buffer = buffer.slice(cut + 2);
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;
          let evt: { delta?: string; done?: boolean; chatId?: string; cards?: never[] } | null = null;
          try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (evt?.delta) appendDelta(evt.delta);
          if (evt?.done) {
            newChatId = evt.chatId || '';
            if (evt.cards?.length) {
              setMessages(m => {
                const next = [...m];
                const i = assistantIndex.current;
                if (i >= 0 && next[i]) next[i] = { ...next[i], cards: evt!.cards };
                return next;
              });
            }
          }
        }
      }
      if (newChatId && newChatId !== chatId) {
        setChatId(newChatId);
        const list = await fetch('/api/gg-gpt').then(r => r.json()).catch(() => null);
        if (list?.chats) setChats(list.chats);
        if (list?.memories) setMemories(list.memories);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      // Drop the empty bubble rather than leaving a blank reply on screen.
      setMessages(m => m.filter((_, i) => i !== assistantIndex.current));
    } finally {
      setBusy(false);
      scrollDown();
      inputRef.current?.focus();
    }
  }

  async function newChat() {
    setChatId('');
    setMessages([]);
    setError('');
    inputRef.current?.focus();
  }

  async function removeChat(id: string) {
    await fetch('/api/gg-gpt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', chatId: id }),
    });
    const list = await fetch('/api/gg-gpt').then(r => r.json()).catch(() => null);
    if (list?.chats) setChats(list.chats);
    if (chatId === id) newChat();
  }

  async function dropMemory(id: string) {
    const res = await fetch('/api/gg-gpt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'memory', memoryId: id }),
    });
    const d = await res.json().catch(() => null);
    if (d?.memories) setMemories(d.memories);
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--background)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.08)', flexWrap: 'wrap' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, letterSpacing: '.02em' }}>
          <ArrowLeft size={16} /> GG-LOUNGE
        </Link>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 900, fontSize: 14 }}>
          <Sparkles size={16} color="var(--lime)" /> GG-GPT
        </span>
        <span style={{ fontSize: 11, opacity: 0.55 }}>
          {signedIn ? `signed in as ${username} — chats and memories save to your account` : 'guest mode — chats stay in this browser, sign in to save them'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setSidebar(s => !s)} style={ghostBtn} aria-label="Toggle chat list">{sidebar ? 'Hide chats' : 'Chats'}</button>
        <button onClick={() => setShowMemory(v => !v)} style={ghostBtn}>
          <Brain size={14} /> Memory {memories.length ? `(${memories.length})` : ''}
        </button>
        <button onClick={newChat} style={{ ...ghostBtn, borderColor: 'rgba(215,243,74,.45)', color: 'var(--lime)' }}>
          <Plus size={14} /> New chat
        </button>
      </header>

      {showMemory && (
        <section style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)', maxHeight: 220, overflowY: 'auto' }}>
          <p style={{ fontSize: 12, opacity: 0.65, marginBottom: 8 }}>
            GG-GPT keeps these facts about you and uses them in every chat. Remove anything you would rather it forgot.
          </p>
          {memories.length === 0 && <p style={{ fontSize: 12, opacity: 0.5 }}>Nothing remembered yet — tell it something about yourself.</p>}
          {memories.map(m => (
            <span key={m.id} style={chip}>
              {m.fact}
              <button onClick={() => dropMemory(m.id)} aria-label={`Forget ${m.fact}`} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', display: 'grid', placeItems: 'center', opacity: 0.6 }}>
                <X size={11} />
              </button>
            </span>
          ))}
        </section>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {sidebar && (
          <aside style={{ width: 230, flex: '0 0 auto', borderRight: '1px solid rgba(255,255,255,.08)', overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {!signedIn && <p style={{ fontSize: 11, opacity: 0.5, padding: '4px 6px' }}>Sign in to keep your chats on your account.</p>}
            {chats.length === 0 && signedIn && <p style={{ fontSize: 11, opacity: 0.5, padding: '4px 6px' }}>No saved chats yet.</p>}
            {chats.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => loadChat(c.id)}
                  style={{
                    flex: 1, textAlign: 'left', background: chatId === c.id ? 'rgba(215,243,74,.12)' : 'transparent',
                    border: '1px solid ' + (chatId === c.id ? 'rgba(215,243,74,.3)' : 'transparent'),
                    color: 'inherit', borderRadius: 8, padding: '7px 9px', fontSize: 12, cursor: 'pointer',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {c.title}
                </button>
                <button onClick={() => removeChat(c.id)} aria-label={`Delete ${c.title}`} style={{ background: 'none', border: 0, color: 'inherit', opacity: 0.35, cursor: 'pointer' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </aside>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {messages.length === 0 && (
              <div style={{ maxWidth: 620, margin: '40px auto', textAlign: 'center' }}>
                <div style={{ display: 'grid', placeItems: 'center', width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(135deg, rgba(215,243,74,.22), rgba(125,107,255,.28))', margin: '0 auto 16px' }}>
                  <Sparkles size={26} color="var(--lime)" />
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>GG-GPT</h1>
                <p style={{ fontSize: 13, opacity: 0.65, marginBottom: 20 }}>
                  Text, web search, image and video generation. No API key, no sign-up to try it. Sign in and it remembers you between chats.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)} style={{ ...chip, cursor: 'pointer', fontSize: 12 }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={m.id || i} style={{ display: 'flex', gap: 10, flexDirection: m.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 9, flex: '0 0 auto', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900,
                  background: m.role === 'user' ? 'rgba(125,107,255,.28)' : 'linear-gradient(135deg, rgba(215,243,74,.3), rgba(125,107,255,.34))',
                }}>
                  {m.role === 'user' ? (username?.[0]?.toUpperCase() || 'U') : <Sparkles size={14} />}
                </div>
                <div style={{
                  maxWidth: 'min(720px, 92%)', fontSize: 13.5, lineHeight: 1.62, borderRadius: 14, padding: '10px 14px',
                  background: m.role === 'user' ? 'rgba(125,107,255,.16)' : 'rgba(255,255,255,.05)',
                  border: '1px solid ' + (m.role === 'user' ? 'rgba(125,107,255,.25)' : 'rgba(255,255,255,.08)'),
                  overflowWrap: 'anywhere',
                }}>
                  <Markdown text={m.content} />
                  {m.media && (
                    <div style={{ marginTop: 10 }}>
                      {m.media.kind === 'image' ? (
                        <img src={m.media.url} alt={m.media.prompt} style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} loading="lazy" />
                      ) : (
                        <video src={m.media.url} controls style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
                      )}
                      <a href={m.media.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, opacity: 0.6, display: 'inline-block', marginTop: 6 }}>Open full size</a>
                    </div>
                  )}
                  {!!m.cards?.length && <ToolCards cards={m.cards} />}
                </div>
              </div>
            ))}

            {busy && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', opacity: 0.7, fontSize: 12.5 }}>
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> GG-GPT is thinking…
              </div>
            )}
          </div>

          {error && (
            <div role="alert" style={{ margin: '0 18px 10px', padding: '10px 14px', borderRadius: 10, background: 'rgba(174,89,96,.16)', border: '1px solid rgba(174,89,96,.4)', fontSize: 12.5 }}>
              {error}
            </div>
          )}

          <form
            onSubmit={e => { e.preventDefault(); send(); }}
            style={{ padding: '0 18px 18px', display: 'flex', gap: 10, alignItems: 'flex-end' }}
          >
            <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'flex-end', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: '8px 10px' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask GG-GPT anything — or say “generate an image of …”"
                rows={1}
                style={{ flex: 1, background: 'transparent', border: 0, color: 'inherit', resize: 'none', outline: 'none', fontSize: 13.5, lineHeight: 1.5, maxHeight: 160, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 4, opacity: 0.5 }} title="GG-GPT can search the web and make images or videos">
                <Search size={15} /><ImageIcon size={15} /><Video size={15} />
              </div>
            </div>
            <button type="submit" disabled={busy || !input.trim()} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 12,
              background: busy || !input.trim() ? 'rgba(255,255,255,.08)' : 'var(--lime)',
              color: busy || !input.trim() ? 'inherit' : '#0b0d12', border: 0, fontWeight: 900, fontSize: 13, cursor: busy || !input.trim() ? 'default' : 'pointer',
            }}>
              <Send size={15} /> Send
            </button>
          </form>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:700px){aside{display:none}}`}</style>
    </main>
  );
}

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
  border: '1px solid rgba(255,255,255,.16)', color: 'inherit', borderRadius: 9,
  padding: '6px 11px', fontSize: 12, cursor: 'pointer',
};

const cardBox: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.1)',
  background: 'rgba(0,0,0,.22)',
  borderRadius: 10,
  padding: '8px 11px',
  fontSize: 12,
};

const cardLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '.07em',
  textTransform: 'uppercase',
  opacity: 0.5,
};

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, margin: '3px 5px 3px 0',
  padding: '5px 10px', borderRadius: 999, fontSize: 11.5,
  background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)',
};
