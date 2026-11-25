'use client'
/**
 * The last few panels: name styles, slugs, anagrams, emoji search, ASCII art
 * and a typing test.
 *
 * These are the ones that are more fun than useful, which is a legitimate
 * reason for a page like this to exist. They still behave: the slug maker
 * produces a slug a router will accept, the ASCII banner is capped so it cannot
 * blow out a console width, and the typing test measures the time it actually
 * took rather than trusting a tick count.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'

import { TYPING_PASSAGE, anagrams, asciiBanner, EMOJI, slugify, usernameStyles } from '@/lib/tools/logic'
import { Button, CopyButton, Field, Output, Stat, TextInput } from './ui'

/* ---------------- username styles ---------------- */

export function UsernameTool() {
  const [name, setName] = useState('Ada Lovelace')
  const styles = useMemo(() => usernameStyles(name), [name])
  return (
    <div className="tool-panel">
      <Field label="Name" hint="Accents and spaces are stripped before the variants are built.">
        <TextInput value={name} onChange={setName} />
      </Field>
      {styles.length ? (
        <div className="tool-name-grid">
          {styles.map(entry => (
            <div key={entry.style} className="tool-name-card">
              <span>
                <span className="tool-label">{entry.style}</span>
                <br />
                {entry.value}
              </span>
              <CopyButton value={entry.value} label="" />
            </div>
          ))}
        </div>
      ) : <div className="tool-error">Type a name with at least two letters or digits.</div>}
      <Output label="All of them" value={styles.map(entry => entry.value).join('\n')} multiline />
    </div>
  )
}

/* ---------------- slug ---------------- */

export function SlugTool() {
  const [text, setText] = useState('GG Lounge — 100 free tools!')
  const slug = slugify(text)
  return (
    <div className="tool-panel">
      <Field label="Heading or title"><TextInput value={text} onChange={setText} /></Field>
      <Output label="Slug" value={slug} />
      <Output label="As a path" value={slug ? `/${slug}` : '—'} />
      <p className="tool-hint">
        Accents are folded to their plain letters (café → cafe), everything that is not a letter or digit becomes
        a single dash, and the result is capped at 80 characters.
      </p>
    </div>
  )
}

/* ---------------- anagrams ---------------- */

export function AnagramTool() {
  const [word, setWord] = useState('arc')
  const list = useMemo(() => anagrams(word), [word])
  return (
    <div className="tool-panel">
      <Field label="Word" hint="Up to eight letters — beyond that the list gets silly."><TextInput value={word} onChange={setWord} /></Field>
      <div className="tool-stats">
        <Stat label="arrangements" value={list.length} />
        <Stat label="letters" value={[...word].filter(char => /[a-z0-9]/i.test(char)).length} />
      </div>
      <Output label="Every arrangement" value={list.join(', ') || '—'} multiline />
      <p className="tool-hint">Duplicate letters are not double-counted, so “ll” does not produce the same word twice.</p>
    </div>
  )
}

/* ---------------- emoji ---------------- */

export function EmojiTool() {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return EMOJI
    return EMOJI.filter(emoji => emoji.name.includes(needle) || emoji.char === needle)
  }, [query])
  return (
    <div className="tool-panel">
      <Field label="Search"><TextInput value={query} onChange={setQuery} placeholder="trophy, fire, lock…" /></Field>
      <div className="tool-name-grid">
        {results.map(emoji => (
          <div key={emoji.char + emoji.name} className="tool-name-card" title={emoji.name}>
            <span style={{ fontSize: 20 }}>{emoji.char}</span>
            <span className="tool-hint" style={{ flex: 1 }}>{emoji.name}</span>
            <CopyButton value={emoji.char} label="" />
          </div>
        ))}
      </div>
      {results.length === 0 ? <div className="tool-empty">Nothing in this set matches “{query}”. It is a curated list, not the whole Unicode range.</div> : null}
      <p className="tool-hint">A small hand-picked set with real search names, because the full emoji database is megabytes and this page is meant to load instantly.</p>
    </div>
  )
}

/* ---------------- ASCII banner ---------------- */

export function AsciiTool() {
  const [text, setText] = useState('GG')
  const rows = asciiBanner(text)
  const banner = rows.join('\n')
  return (
    <div className="tool-panel">
      <Field label="Text" hint="Up to 24 characters."><TextInput value={text} onChange={setText} /></Field>
      <pre className="tool-output-body is-mono is-block" style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' }}>{banner}</pre>
      <CopyButton label="Copy banner" value={banner} />
      <p className="tool-hint">Three rows, fixed width — it stays readable in a terminal, a comment block or a chat message.</p>
    </div>
  )
}

/* ---------------- typing test ---------------- */

export function TypingTestTool() {
  const [started, setStarted] = useState(false)
  const [input, setInput] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(0)
  const finished = input === TYPING_PASSAGE

  useEffect(() => {
    if (!started || finished) return
    const interval = setInterval(() => setElapsed(Date.now() - startedAt.current), 200)
    return () => clearInterval(interval)
  }, [started, finished])

  useEffect(() => {
    if (!input) { setStarted(false); setElapsed(0); return }
    if (!started) { startedAt.current = Date.now(); setStarted(true) }
  }, [input, started])

  const minutes = elapsed / 60000
  const correct = useMemo(() => [...input].filter((char, index) => char === TYPING_PASSAGE[index]).length, [input])
  const wpm = minutes > 0 ? (input.length / 5) / minutes : 0
  const accuracy = input.length ? (correct / input.length) * 100 : 0

  return (
    <div className="tool-panel">
      <div className="tool-typing-passage" aria-label="Passage to copy">
        {[...TYPING_PASSAGE].map((char, index) => (
          <span
            key={index}
            className={
              index < input.length
                ? input[index] === char ? 'is-correct' : 'is-wrong'
                : 'is-pending'
            }
          >
            {char}
          </span>
        ))}
      </div>
      <textarea
        className="tool-textarea"
        rows={3}
        value={input}
        aria-label="Type the passage here"
        placeholder="Start typing the passage above…"
        onChange={event => setInput(event.target.value.slice(0, TYPING_PASSAGE.length))}
      />
      <div className="tool-stats">
        <Stat label="words per minute" value={finished ? wpm.toFixed(0) : wpm.toFixed(0)} />
        <Stat label="accuracy" value={`${accuracy.toFixed(0)}%`} />
        <Stat label="seconds" value={(elapsed / 1000).toFixed(1)} />
      </div>
      {finished ? <div className="tool-verdict good">{wpm.toFixed(0)} wpm at {accuracy.toFixed(0)}% accuracy.</div> : null}
      <Button variant="ghost" onClick={() => { setInput(''); setStarted(false); setElapsed(0) }}><RotateCcw size={14} /> Start again</Button>
      <p className="tool-hint">Words per minute counts five characters as a word, which is the convention typing tests use.</p>
    </div>
  )
}
