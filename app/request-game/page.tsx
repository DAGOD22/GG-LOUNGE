'use client';

import { useState } from 'react';
import { Send, Upload } from 'lucide-react';
import { readFileAsDataUrl, uploadGameHtml } from '@/lib/upload-client';

export default function RequestGame() {
  const [title, setTitle] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    if (!title.trim() || !htmlFile) {
      setMessage('Give the game a title and choose its index.html file.');
      return;
    }
    setProgress({ done: 0, total: 1 });
    let icon: string | null = null;
    try {
      if (iconFile) icon = await readFileAsDataUrl(iconFile, 300 * 1024);
    } catch (err) {
      setProgress(null);
      setMessage(err instanceof Error ? err.message : 'Bad icon file.');
      return;
    }
    const result = await uploadGameHtml(
      htmlFile,
      { kind: 'request', title: title.trim(), icon },
      (done, total) => setProgress({ done, total }),
    );
    setProgress(null);
    if (!result.ok) {
      setMessage(result.error || 'Request failed. Try again.');
      return;
    }
    setTitle('');
    setIconFile(null);
    setHtmlFile(null);
    (document.getElementById('request-form') as HTMLFormElement | null)?.reset();
    setMessage('Request submitted for admin review. Approved games are published permanently.');
  }

  return (
    <main className="admin-shell">
      <section className="admin-panel request-form">
        <p className="eyebrow">GG-LOUNGE™ / COMMUNITY</p>
        <h1>Request a game.</h1>
        <p>
          Submit a self-contained <strong>index.html</strong> file for review. Big files are fine —
          they upload in pieces automatically (50MB max).
        </p>
        <form id="request-form" onSubmit={submit}>
          <label htmlFor="title">Game title</label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={80}
            placeholder="My Awesome Game"
          />
          <label htmlFor="icon">Favicon / icon (optional)</label>
          <input
            id="icon"
            type="file"
            accept="image/*"
            onChange={(e) => setIconFile(e.target.files?.[0] ?? null)}
          />
          <label htmlFor="html">index.html file</label>
          <input
            id="html"
            type="file"
            accept=".html,text/html"
            required
            onChange={(e) => setHtmlFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" disabled={!!progress}>
            {progress ? (
              <>
                <Upload size={15} /> Uploading {progress.done}/{progress.total}…
              </>
            ) : (
              <>
                <Send size={15} /> Submit for review
              </>
            )}
          </button>
          {progress && (
            <div className="progress-bar">
              <div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            </div>
          )}
        </form>
        {message && <p className="muted">{message}</p>}
        <a className="admin-back" href="/">
          Back to lounge
        </a>
      </section>
    </main>
  );
}
