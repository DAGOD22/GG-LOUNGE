'use client';

/**
 * The fake Google Doc panic surface.
 *
 * This has to survive a teacher looking over a shoulder for ten seconds, so it
 * is built from the details rather than the general shape: the Docs menu bar,
 * the toolbar icons, the tab strip, the page, the grain of the paper, the
 * blinking caret after the last word, the word count that only updates when it
 * is clicked, and the comment bubble in the margin.
 *
 * Typing is driven by the user's actual keystrokes — nothing types by itself.
 * Any printable key advances the document by a small burst, backspace removes,
 * and the caret, word count and scroll all derive from one character count.
 *
 * Three ways out, and none of them is on screen:
 *
 *   · the panic combo again (handled by the provider, which closes this)
 *   · typing "ggout"
 *   · clicking the word count seven times
 *
 * The game underneath is paused and muted before this covers it, so the sound
 * of a game never gives the page away.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DOC_ESSAYS, burstFor, docSlice, essayLength, shouldExitOnWord, wordCount } from '@/lib/panic-doc';

export function PanicDoc({ onExit }: { onExit: () => void }) {
  // Pick the essay once, on mount, so a panic does not reshuffle mid-session.
  const essay = useMemo(() => {
    const index = Math.floor(Math.random() * DOC_ESSAYS.length);
    return DOC_ESSAYS[index];
  }, []);

  const [typed, setTyped] = useState(() => Math.floor(essayLength(essay) * 0.18));
  const [caretVisible, setCaretVisible] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const keystrokes = useRef(0);
  const typedRef = useRef(typed);
  const wordBuffer = useRef('');
  const clicks = useRef<number[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    typedRef.current = typed;
  }, [typed]);

  /* blinking caret */
  useEffect(() => {
    const timer = window.setInterval(() => setCaretVisible(value => !value), 530);
    return () => window.clearInterval(timer);
  }, []);

  /* keep the caret in view as the page fills */
  useEffect(() => {
    const node = scroller.current;
    const marker = caret.current;
    if (!node || !marker) return;
    const nodeRect = node.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    if (markerRect.bottom > nodeRect.bottom - 80) {
      node.scrollTop += markerRect.bottom - nodeRect.bottom + 120;
    }
  }, [typed]);

  const type = useCallback(
    (characters: number) => {
      const total = essayLength(essay);
      setTyped(current => Math.min(total, current + characters));
    },
    [essay],
  );

  const erase = useCallback(() => {
    setTyped(current => Math.max(0, current - 1));
  }, []);

  /* ---- keyboard -------------------------------------------------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Leave browser and OS shortcuts alone; intercepting Ctrl+R here would
      // look far more suspicious than allowing it.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === 'Backspace') {
        event.preventDefault();
        erase();
        wordBuffer.current = wordBuffer.current.slice(0, -1);
        return;
      }
      if (event.key === 'Escape') {
        // Not an exit: a stray Escape must not drop the disguise.
        event.preventDefault();
        return;
      }
      if (event.key.length !== 1 && event.key !== 'Enter') return;
      if (event.key === ' ') event.preventDefault();

      keystrokes.current += 1;
      const burst = event.key === 'Enter' ? 1 : burstFor(keystrokes.current);
      type(burst);

      // The exit word is tracked separately from the visible text, so typing it
      // never appears in the essay.
      if (event.key.length === 1) {
        wordBuffer.current = (wordBuffer.current + event.key).slice(-8);
        if (shouldExitOnWord(wordBuffer.current)) {
          event.preventDefault();
          onExit();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [erase, onExit, type]);

  const { text, done } = docSlice(essay, typed);
  const words = wordCount(essay, typed);

  const onWordCountClick = () => {
    const now = Date.now();
    clicks.current = [...clicks.current.filter(time => now - time < 2500), now];
    if (clicks.current.length >= 7) {
      clicks.current = [];
      onExit();
    }
  };

  return (
    <div className="gg-doc" role="dialog" aria-modal="true" aria-label="Document">
      {/* top bar: logo, title, account, share */}
      <header className="gg-doc-top">
        <span className="gg-doc-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22"><path fill="#4285f4" d="M6 2h8l6 6v14H6z" opacity=".9" /><path fill="#fbbc04" d="M14 2l6 6h-6z" /></svg>
        </span>
        <div className="gg-doc-titleblock">
          <div className="gg-doc-titleline">
            <span className="gg-doc-title">{essay.title}</span>
            <span className="gg-doc-star" aria-hidden="true">☆</span>
            <span className="gg-doc-move" aria-hidden="true">▾</span>
          </div>
          <nav className="gg-doc-menus" aria-hidden="true">
            {['File', 'Edit', 'View', 'Insert', 'Format', 'Tools', 'Extensions', 'Help'].map(item => (
              <span key={item}>{item}</span>
            ))}
          </nav>
        </div>
        <div className="gg-doc-right">
          <span className="gg-doc-saved" aria-hidden="true">Saved to Drive</span>
          <span className="gg-doc-avatar" aria-hidden="true">AC</span>
          <span className="gg-doc-share" aria-hidden="true">Share</span>
        </div>
      </header>

      {/* toolbar */}
      <div className={`gg-doc-toolbar${focusMode ? ' is-dim' : ''}`} aria-hidden="true">
        <span className="gg-doc-tool">↶</span>
        <span className="gg-doc-tool">↷</span>
        <span className="gg-doc-tool">🖨</span>
        <span className="gg-doc-sep" />
        <span className="gg-doc-zoom">100%</span>
        <span className="gg-doc-sep" />
        <span className="gg-doc-style">Normal text</span>
        <span className="gg-doc-sep" />
        <span className="gg-doc-font">Arial</span>
        <span className="gg-doc-sep" />
        <span className="gg-doc-tool">−</span>
        <span className="gg-doc-size">11</span>
        <span className="gg-doc-tool">+</span>
        <span className="gg-doc-sep" />
        <span className="gg-doc-tool"><b>B</b></span>
        <span className="gg-doc-tool"><i>I</i></span>
        <span className="gg-doc-tool"><u>U</u></span>
        <span className="gg-doc-tool"><s>A</s></span>
        <span className="gg-doc-sep" />
        <span className="gg-doc-tool">≡</span>
        <span className="gg-doc-tool">☰</span>
        <span className="gg-doc-sep" />
        <span className="gg-doc-tool">🔗</span>
        <span className="gg-doc-tool">💬</span>
        <span className="gg-doc-tool">🖼</span>
        <span className="gg-doc-spacer" />
        <button type="button" className="gg-doc-focus" onClick={() => setFocusMode(value => !value)}>
          {focusMode ? 'Show toolbar' : 'Focus mode'}
        </button>
      </div>

      {/* the page */}
      <div className="gg-doc-scroll" ref={scroller}>
        <div className="gg-doc-page">
          <h1 className="gg-doc-h1">{essay.subtitle}</h1>
          <p className="gg-doc-meta" aria-hidden="true">
            {essay.title} · Word count {words}
          </p>
          {text.map((paragraph, index) => (
            <p key={index} className="gg-doc-para">
              {paragraph}
              {index === text.length - 1 && (
                <span
                  ref={caret}
                  className="gg-doc-caret"
                  style={{ opacity: caretVisible ? 1 : 0 }}
                  aria-hidden="true"
                />
              )}
            </p>
          ))}
          {text.length === 0 && (
            <p className="gg-doc-para">
              <span className="gg-doc-caret" style={{ opacity: caretVisible ? 1 : 0 }} />
            </p>
          )}
          {done && <p className="gg-doc-endnote" aria-hidden="true">Bibliography to follow.</p>}
        </div>
        <div className="gg-doc-gutter" aria-hidden="true">
          <span className="gg-doc-comment">💬</span>
        </div>
      </div>

      {/* footer: the word count is the hidden exit target */}
      <footer className="gg-doc-footer">
        <span className="gg-doc-pages" aria-hidden="true">Page 1 of 1</span>
        <button type="button" className="gg-doc-words" onClick={onWordCountClick}>
          {words} words
        </button>
        <span className="gg-doc-spacer" />
        <span className="gg-doc-lang" aria-hidden="true">English (Australia)</span>
        <span className="gg-doc-comments" aria-hidden="true">0 comments</span>
      </footer>
    </div>
  );
}
