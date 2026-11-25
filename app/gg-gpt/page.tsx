'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Brain, Cpu, Image as ImageIcon, Loader2, PlayCircle, Plus, Search, Send, Sparkles, Trash2, Video, X } from 'lucide-react';
import { BrowserVideo } from '@/components/gg-gpt/BrowserVideo';
import { CodeSandbox } from '@/components/gg-gpt/CodeSandbox';

type Chat = { id: string; title: string; updatedAt: string };
type ToolCard = { label: string; source: string; data?: Record<string, unknown> };
type Msg = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: string | null;
  media?: {
    kind: string;
    url: string;
    prompt: string;
    frames?: Array<{ url: string; move: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'tilt-up' }>;
    width?: number; height?: number; durationSec?: number; fps?: number;
  };
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
        if (/^#{1,6}\s+/.test(trimmed)) {
          const level = trimmed.match(/^#+/)?.[0].length ?? 1;
          return (
            <div key={i} style={{ fontWeight: 800, fontSize: level <= 2 ? 15 : 13.5, margin: '12px 0 5px', letterSpacing: '-0.01em' }}>
              {inline(trimmed.replace(/^#{1,6}\s+/, ''))}
            </div>
          );
        }
        if (/^(?:---+|\*\*\*+)$/.test(trimmed)) {
          return <div key={i} style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '10px 0' }} />;
        }
        const quote = /^>\s+/.test(trimmed);
        if (quote) {
          return (
            <div key={i} style={{ borderLeft: '2px solid rgba(255,255,255,.22)', paddingLeft: 10, margin: '6px 0', opacity: 0.85 }}>
              {inline(trimmed.replace(/^>\s+/, ''))}
            </div>
          );
        }
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
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g);
  return parts.map((p, i) => {
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
    if (link) {
      // Only ever render an http(s) link: a model could echo a javascript: URL.
      const href = /^https?:\/\//i.test(link[2]) ? link[2] : /^\//.test(link[2]) ? link[2] : null;
      if (!href) return <span key={i}>{link[1]}</span>;
      const external = /^https?:/i.test(href);
      return (
        <a
          key={i}
          href={href}
          {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
          style={{ color: 'var(--accent, #d7f34a)', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          {link[1]}
        </a>
      );
    }
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
  'What kind of player am I?',
  'Plan a 45 minute session',
  'Compare Doom (13 KB) and Quake',
  "What\'s the weather in Adelaide?",
  'Make a video of a cat surfing',
  'Generate an image of a neon arcade at midnight',
  'Which achievement is closest?',
  'Quiz me on the catalogue',
  'Challenge me with something new',
];

/** The ten things only this assistant can do, surfaced so people find them. */
const ABILITIES = [
  { label: 'Taste card', ask: 'What kind of player am I?' },
  { label: 'Backlog', ask: 'What should I play with 20 minutes' },
  { label: 'Compare', ask: 'Compare Doom (13 KB) and Quake' },
  { label: 'Achievements', ask: 'Which achievement is closest' },
  { label: 'Session plan', ask: 'Plan a 90 minute session' },
  { label: 'Progress', ask: 'Give me my progress report' },
  { label: 'Challenge', ask: 'Challenge me with something new' },
  { label: 'Genres', ask: 'What is a puzzle game' },
  { label: 'Controls', ask: 'How do I play Suika controls' },
  { label: 'Quiz', ask: 'Quiz me on the catalogue' },
];


/**
 * Downscale an image to something a model can use.
 *
 * 1024px on the long edge, JPEG at 0.82 — the point at which a screenshot's
 * text is still legible to a vision model but the payload is ~120 KB instead of
 * several megabytes. Transparent PNGs stay PNG so nothing gains a black box.
 */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('That file is not a readable image.'));
      image.onload = () => {
        const max = 1024;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable.'));
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const keepAlpha = /png|webp|avif/i.test(file.type);
        resolve(canvas.toDataURL(keepAlpha ? 'image/webp' : 'image/jpeg', 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function GgGptPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [chatId, setChatId] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  /**
   * Attachments and model choice.
   *
   * Images are resized here, in the browser, before they go anywhere: a phone
   * screenshot is 4-8 MB, the model only needs about 1024px, and uploading the
   * original would make the feature unusable on a school connection. The
   * resized data URL is what travels.
   */
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [models, setModels] = useState<Array<{ id: string; label: string; vision: boolean }>>([]);
  const [task, setTask] = useState<'auto' | 'chat' | 'code' | 'vision' | 'long'>('auto');
  const [sandbox, setSandbox] = useState<{ markdown?: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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
        setModels(d.models ?? []);
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
        body: JSON.stringify({
          action: 'chat',
          message,
          chatId,
          stream: true,
          images: attachments.length ? attachments : undefined,
          task,
        }),
      });
      // Attachments belong to the message that carried them, not to the next one.
      setAttachments([]);

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
    <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--background)' }} id="main-content">
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
                <p style={{ fontSize: 13, opacity: 0.65, marginBottom: 14 }}>
                  Text, web search, image and video generation — plus ten things built on this site&apos;s own data that a general chatbot cannot do.
                  No API key, no sign-up to try it. Sign in and it remembers you between chats.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 18 }}>
                  {ABILITIES.map(a => (
                    <button key={a.label} onClick={() => send(a.ask)} title={a.ask} style={{ ...chip, cursor: 'pointer', fontSize: 11, opacity: 0.9 }}>{a.label}</button>
                  ))}
                </div>
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
                      ) : m.media.kind === 'video-frames' && m.media.frames?.length ? (
                        <BrowserVideo
                          frames={m.media.frames}
                          width={m.media.width ?? 768}
                          height={m.media.height ?? 768}
                          durationSec={m.media.durationSec ?? 6}
                          fps={m.media.fps ?? 24}
                          name={m.media.prompt}
                        />
                      ) : (
                        <video src={m.media.url} controls loop style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
                      )}
                      {m.media.kind !== 'video-frames' && (
                        <a href={m.media.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, opacity: 0.6, display: 'inline-block', marginTop: 6 }}>Open full size</a>
                      )}
                    </div>
                  )}
                  {!!m.cards?.length && <ToolCards cards={m.cards} />}
                </div>
              </div>
            ))}

            {messages.map((m, index) => (
              m.role === 'assistant' && /```/.test(m.content) ? (
                <button
                  key={`run-${index}`}
                  type="button"
                  className="gg-run-code"
                  onClick={() => setSandbox({ markdown: m.content })}
                >
                  <PlayCircle size={13} /> Run this code
                </button>
              ) : null
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: '8px 10px' }}>
              {attachments.length > 0 && (
                <div className="gg-attach-row">
                  {attachments.map((src, index) => (
                    <span key={index} className="gg-attach">
                      <img src={src} alt={`Attachment ${index + 1}`} />
                      <button
                        type="button"
                        aria-label={`Remove attachment ${index + 1}`}
                        onClick={() => setAttachments(list => list.filter((_, i) => i !== index))}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onPaste={async e => {
                  // Pasting a screenshot is how people actually send images.
                  const files = Array.from(e.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'));
                  if (!files.length) return;
                  e.preventDefault();
                  setAttaching(true);
                  try {
                    const made = await Promise.all(files.slice(0, 4).map(shrinkImage));
                    setAttachments(list => [...list, ...made].slice(0, 4));
                  } catch (cause) { setError((cause as Error).message); }
                  finally { setAttaching(false); }
                }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask GG-GPT anything — attach an image, or say “write a game and run it”"
                rows={1}
                style={{ flex: 1, background: 'transparent', border: 0, color: 'inherit', resize: 'none', outline: 'none', fontSize: 13.5, lineHeight: 1.5, maxHeight: 160, fontFamily: 'inherit' }}
              />
              <label title="Attach an image or video" className="gg-icon-btn">
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  hidden
                  onChange={async event => {
                    const files = Array.from(event.target.files ?? []).slice(0, 4);
                    event.target.value = '';
                    if (!files.length) return;
                    setAttaching(true);
                    try {
                      const images = files.filter(file => file.type.startsWith('image/'));
                      if (images.length < files.length) {
                        setError('Video attachments need a link — paste a YouTube or Vimeo URL and GG-GPT will play it inline.');
                      }
                      const made = await Promise.all(images.map(shrinkImage));
                      setAttachments(list => [...list, ...made].slice(0, 4));
                      if (files.some(file => file.type.startsWith('video/'))) {
                        setTask('vision');
                      }
                    } catch (cause) { setError((cause as Error).message); }
                    finally { setAttaching(false); }
                  }}
                />
                {attaching ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ImageIcon size={15} />}
              </label>
              <button
                type="button"
                className="gg-icon-btn"
                title={`Task: ${task} — GG-GPT routes to the model best at it`}
                onClick={() => { const order = ['auto', 'code', 'vision', 'chat', 'long'] as const; setTask(current => order[(order.indexOf(current) + 1) % order.length]); }}
              >
                <Search size={15} />
              </button>
              {models.length > 0 && (
                <div className="gg-models">
                  <button type="button" className="gg-icon-btn" onClick={() => setPickerOpen(open => !open)} title="Model routing">
                    <Cpu size={15} />
                  </button>
                  {pickerOpen && (
                    <div className="gg-models-menu" role="menu">
                      {(['auto', 'chat', 'code', 'vision', 'long'] as const).map(kind => (
                        <button
                          key={kind}
                          type="button"
                          role="menuitemradio"
                          aria-checked={task === kind}
                          className={task === kind ? 'on' : ''}
                          onClick={() => { setTask(kind); setPickerOpen(false); }}
                        >
                          {kind}
                        </button>
                      ))}
                      <div className="gg-models-list">
                        {models.map(model => (
                          <span key={model.id} title={model.vision ? 'Can read images' : 'Text only'}>
                            {model.label}{model.vision ? ' · vision' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <Video size={15} style={{ opacity: 0.35 }} />
              </div>
            </div>
            <button type="submit" disabled={busy || (!input.trim() && !attachments.length)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 12,
              background: busy || (!input.trim() && !attachments.length) ? 'rgba(255,255,255,.08)' : 'var(--lime)',
              color: busy || (!input.trim() && !attachments.length) ? 'inherit' : '#0b0d12', border: 0, fontWeight: 900, fontSize: 13, cursor: busy || (!input.trim() && !attachments.length) ? 'default' : 'pointer',
            }}>
              <Send size={15} /> Send
            </button>
          </form>
        </div>
      </div>
      {sandbox && <CodeSandbox initial={sandbox} onClose={() => setSandbox(null)} />}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:700px){aside{display:none}}
        .gg-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;border:0;background:transparent;color:inherit;opacity:.6;cursor:pointer}
        .gg-icon-btn:hover{opacity:1;background:rgba(255,255,255,.08)}
        .gg-attach-row{display:flex;gap:6px;flex-wrap:wrap}
        .gg-attach{position:relative;display:inline-flex;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.16)}
        .gg-attach img{width:56px;height:56px;object-fit:cover;display:block}
        .gg-attach button{position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;border:0;background:rgba(0,0,0,.7);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
        .gg-models{position:relative}
        .gg-models-menu{position:absolute;bottom:34px;right:0;z-index:40;min-width:190px;padding:6px;border-radius:12px;background:#12151c;border:1px solid rgba(255,255,255,.14);box-shadow:0 18px 40px rgba(0,0,0,.5)}
        .gg-models-menu>button{display:block;width:100%;text-align:left;padding:6px 9px;border-radius:7px;border:0;background:transparent;color:inherit;font-size:12.5px;cursor:pointer;text-transform:capitalize}
        .gg-models-menu>button:hover{background:rgba(255,255,255,.07)}
        .gg-models-menu>button.on{background:rgba(190,242,100,.16);color:var(--lime)}
        .gg-run-code{display:inline-flex;align-items:center;gap:6px;margin:0 18px 10px;padding:6px 11px;border-radius:9px;border:1px solid rgba(190,242,100,.35);background:rgba(190,242,100,.1);color:var(--lime);font-size:12px;font-weight:700;cursor:pointer;align-self:flex-start}
        .gg-models-list{display:flex;flex-direction:column;gap:2px;padding:6px 9px 2px;margin-top:4px;border-top:1px solid rgba(255,255,255,.1);font-size:11px;opacity:.6}
      `}</style>
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
