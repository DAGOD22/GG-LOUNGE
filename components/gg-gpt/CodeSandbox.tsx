'use client';

/**
 * The sandbox panel.
 *
 * Runs what the model wrote, in the browser, in an opaque-origin iframe. The
 * frame is created with `sandbox="allow-scripts"` — no `allow-same-origin`, so
 * it cannot touch this page's storage, cookies or DOM; no `allow-popups`, no
 * `allow-top-navigation`, no network (the document's own CSP says
 * `connect-src 'none'`).
 *
 * Three details that matter to the person using it:
 *
 *   · The code is editable. A model's first attempt is rarely the one you want,
 *     and re-prompting for a one-line change is worse than a text box.
 *   · It re-runs on demand, not on every keystroke — a runaway `while(true)`
 *     would otherwise lock the tab on the third character you delete.
 *   · A hung script is recoverable: "Stop" replaces the iframe, which kills the
 *     running document outright. That is the sandbox's whole safety valve.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, RotateCcw, Code2, Maximize2, X, Copy, Check, Download } from 'lucide-react';

export function CodeSandbox({
  initial,
  onClose,
}: {
  /** Either a full model reply (fences are extracted server-side) or raw parts. */
  initial: { markdown?: string; html?: string; css?: string; js?: string };
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'html' | 'css' | 'js'>(initial.js && !initial.markdown ? 'js' : 'html');
  const [parts, setParts] = useState({ html: initial.html ?? '', css: initial.css ?? '', js: initial.js ?? '' });
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [big, setBig] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const ran = useRef(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      // A markdown payload goes back through the extractor so the fences are
      // split the first time the panel opens; after that we send the parts.
      const payload = initial.markdown && !ran.current ? { markdown: initial.markdown } : parts;
      const response = await fetch('/api/gg-gpt/sandbox', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? 'Could not build the sandbox');
      if (data.parts) setParts(data.parts);
      ran.current = true;
      // `srcDoc` rather than a blob URL: a blob would share this origin, and
      // that is exactly what the sandbox attribute is here to prevent.
      setSrc(data.document);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, [initial.markdown, parts]);

  // Run once on mount, then only when the person asks. `run` changes identity
  // whenever the code does, so an effect depending on it directly would re-run
  // the sandbox on every keystroke — including half-typed, infinite loops.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  function stop() {
    setSrc('');
    if (frame.current) frame.current.srcdoc = '';
  }

  async function copyAll() {
    const combined = `<!-- html -->\n${parts.html}\n\n<!-- css -->\n${parts.css}\n\n<!-- js -->\n${parts.js}`;
    try {
      await navigator.clipboard.writeText(combined);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard denied; the text is on screen anyway */
    }
  }

  function download() {
    const blob = new Blob([src || ''], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gg-gpt-sandbox.html';
    link.click();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const labels: Array<[typeof tab, string]> = [
    ['html', 'HTML'],
    ['css', 'CSS'],
    ['js', 'JS'],
  ];

  return (
    <div className={`gsand${big ? ' big' : ''}`} role="dialog" aria-label="Code sandbox">
      <header className="gsand-head">
        <span className="gsand-title">
          <Code2 size={14} aria-hidden="true" /> Sandbox
        </span>
        <div className="gsand-tabs" role="tablist" aria-label="Code">
          {labels.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'on' : ''}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="gsand-actions">
          <button type="button" onClick={() => void run()} disabled={busy} title="Run">
            <Play size={13} />
          </button>
          <button type="button" onClick={stop} title="Stop (replaces the frame)">
            <Square size={12} />
          </button>
          <button type="button" onClick={() => void run()} title="Re-run">
            <RotateCcw size={13} />
          </button>
          <button type="button" onClick={() => void copyAll()} title="Copy all three parts">
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button type="button" onClick={download} title="Download as one .html file">
            <Download size={13} />
          </button>
          <button type="button" onClick={() => setBig(value => !value)} title={big ? 'Shrink' : 'Expand'}>
            <Maximize2 size={13} />
          </button>
          <button type="button" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="gsand-body">
        <div className="gsand-editor">
          <label className="sr-only" htmlFor="gsand-code">
            {tab.toUpperCase()} source
          </label>
          <textarea
            id="gsand-code"
            spellCheck={false}
            value={parts[tab]}
            onChange={event => setParts(current => ({ ...current, [tab]: event.target.value }))}
            placeholder={tab === 'html' ? '<h1>Hello</h1>' : tab === 'css' ? 'h1 { color: lime }' : 'console.log("hi")'}
          />
          {error && <p className="gsand-error" role="alert">{error}</p>}
        </div>

        <div className="gsand-output">
          {src ? (
            <iframe
              ref={frame}
              title="Code sandbox output"
              // The security boundary. See the note at the top of this file.
              sandbox="allow-scripts"
              srcDoc={src}
            />
          ) : (
            <p className="gsand-idle">{busy ? 'Building…' : 'Press Run to execute the code.'}</p>
          )}
        </div>
      </div>

      <style>{`
        .gsand{position:fixed;inset:auto 0 0 0;z-index:2147482000;height:min(62vh,620px);display:flex;flex-direction:column;
          background:#0c0f15;border-top:1px solid rgba(255,255,255,.14);box-shadow:0 -24px 60px rgba(0,0,0,.55)}
        .gsand.big{height:92vh}
        .gsand-head{display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.1);flex-wrap:wrap}
        .gsand-title{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--lime,#bef264)}
        .gsand-tabs{display:flex;gap:2px}
        .gsand-tabs button{border:0;background:transparent;color:inherit;opacity:.55;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:7px;cursor:pointer}
        .gsand-tabs button.on{opacity:1;background:rgba(255,255,255,.1)}
        .gsand-actions{margin-left:auto;display:flex;gap:2px;align-items:center}
        .gsand-actions button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:inherit;opacity:.7;cursor:pointer}
        .gsand-actions button:hover{opacity:1;background:rgba(255,255,255,.09)}
        .gsand-body{flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:0}
        @media(max-width:820px){.gsand-body{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
        .gsand-editor{display:flex;flex-direction:column;min-height:0;border-right:1px solid rgba(255,255,255,.1)}
        .gsand-editor textarea{flex:1;min-height:0;width:100%;box-sizing:border-box;resize:none;border:0;outline:none;background:#0a0c11;color:#d7e2ee;
          font:12.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;padding:12px 14px;tab-size:2}
        .gsand-error{margin:0;padding:8px 14px;background:rgba(174,89,96,.18);color:#ffd0d4;font-size:12px;border-top:1px solid rgba(174,89,96,.4)}
        .gsand-output{position:relative;min-height:0;background:#fff}
        .gsand-output iframe{width:100%;height:100%;border:0;display:block;background:#fff}
        .gsand-idle{margin:0;padding:24px;color:#8b94a3;font-size:13px;text-align:center}
        .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      `}</style>
    </div>
  );
}
