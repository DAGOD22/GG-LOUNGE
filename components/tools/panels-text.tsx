'use client'
/**
 * Text tools.
 *
 * The theme here is that text from a Google Doc arrives with invisible damage:
 * smart quotes, non-breaking spaces, trailing whitespace. Several of these
 * panels exist purely to make that visible or to strip it.
 */
import { useMemo, useState } from 'react'

import {
  acronym, dedupeLines, diffLines, findReplace, isPalindrome, letterFrequency,
  loremIpsum, reverseText, slugify, sortLines, textStats, toCamelCase,
  toConstantCase, toKebabCase, toSentenceCase, toTitleCase, toNato, toMorse,
  fromMorse, toBinaryText, fromBinaryText, toSpongeCase,
} from '@/lib/tools/logic'
import { Button, CopyButton, Field, Output, Select, Stat, TextArea, TextInput } from './ui'

/* ---------------- case converter ---------------- */

const CASE_MODES = [
  { value: 'upper', label: 'UPPER CASE' },
  { value: 'lower', label: 'lower case' },
  { value: 'title', label: 'Title Case' },
  { value: 'sentence', label: 'Sentence case' },
  { value: 'camel', label: 'camelCase' },
  { value: 'pascal', label: 'PascalCase' },
  { value: 'snake', label: 'snake_case' },
  { value: 'kebab', label: 'kebab-case' },
  { value: 'constant', label: 'CONSTANT_CASE' },
  { value: 'slug', label: 'url-slug' },
] as const

type CaseMode = (typeof CASE_MODES)[number]['value']

export function CaseTool() {
  const [text, setText] = useState('the quick brown fox jumps over the lazy dog')
  const [mode, setMode] = useState<CaseMode>('title')

  const converted = useMemo(() => {
    switch (mode) {
      case 'upper': return text.toUpperCase()
      case 'lower': return text.toLowerCase()
      case 'title': return toTitleCase(text)
      case 'sentence': return toSentenceCase(text)
      case 'camel': return toCamelCase(text)
      case 'pascal': return toCamelCase(text).replace(/^./, char => char.toUpperCase())
      case 'snake': return text.split('\n').map(line => toKebabCase(line).replace(/-/g, '_')).join('\n')
      case 'kebab': return toKebabCase(text)
      case 'constant': return toConstantCase(text)
      case 'slug': return slugify(text)
    }
  }, [text, mode])

  return (
    <div className="tool-panel">
      <div className="tool-grid-2">
        <Field label="Input"><TextArea value={text} onChange={setText} rows={8} /></Field>
        <div className="tool-column">
          <Field label="Convert to">
            <Select value={mode} onChange={setMode} label="Case" options={CASE_MODES.map(item => ({ value: item.value, label: item.label }))} />
          </Field>
          <Output label={CASE_MODES.find(item => item.value === mode)!.label} value={converted} multiline />
        </div>
      </div>
    </div>
  )
}

/* ---------------- word count ---------------- */

export function WordCountTool() {
  const [text, setText] = useState('')
  const stats = useMemo(() => textStats(text), [text])
  const minutes = Math.floor(stats.readingSeconds / 60)
  const seconds = stats.readingSeconds % 60

  return (
    <div className="tool-panel">
      <TextArea value={text} onChange={setText} rows={10} placeholder="Paste an essay, a message or a caption…" label="Text to count" />
      <div className="tool-stats">
        <Stat label="words" value={stats.words.toLocaleString()} />
        <Stat label="characters" value={stats.characters.toLocaleString()} />
        <Stat label="no spaces" value={stats.charactersNoSpaces.toLocaleString()} />
        <Stat label="sentences" value={stats.sentences} />
        <Stat label="paragraphs" value={stats.paragraphs} />
        <Stat label="lines" value={stats.lines} />
        <Stat label="reading time" value={minutes ? `${minutes}m ${seconds}s` : `${seconds}s`} />
      </div>
      <p className="tool-hint">Reading time is at 200 words per minute — about average for a comfortable pace.</p>
    </div>
  )
}

/* ---------------- reading level ---------------- */

export function TextStatsTool() {
  const [text, setText] = useState('')
  const stats = useMemo(() => textStats(text), [text])
  const words = stats.words
  const letters = useMemo(() => (text.match(/[A-Za-z]/g) ?? []).length, [text])
  const averageWord = words ? (letters / words) : 0
  const averageSentence = stats.sentences ? words / stats.sentences : 0
  // Flesch reading ease, the common school formula.
  const ease = words && stats.sentences
    ? 206.835 - 1.015 * averageSentence - 84.6 * (letters / words) * (averageWord > 0 ? 1 : 1)
    : null
  const band = ease === null ? '—' : ease >= 80 ? 'Very easy' : ease >= 60 ? 'Plain English' : ease >= 40 ? 'Fairly hard' : 'Difficult'

  return (
    <div className="tool-panel">
      <TextArea value={text} onChange={setText} rows={8} placeholder="Paste a passage…" label="Passage" />
      <div className="tool-stats">
        <Stat label="avg word length" value={averageWord ? averageWord.toFixed(2) : '—'} />
        <Stat label="avg sentence length" value={averageSentence ? averageSentence.toFixed(1) : '—'} />
        <Stat label="reading ease" value={ease === null ? '—' : ease.toFixed(0)} />
        <Stat label="verdict" value={band} />
      </div>
      <p className="tool-hint">
        Flesch reading ease: higher is easier. It counts letters per word and words per sentence, so it is a
        blunt instrument — technical writing with short sentences will score higher than it reads.
      </p>
    </div>
  )
}

/* ---------------- sort lines ---------------- */

export function SortLinesTool() {
  const [text, setText] = useState('banana\nApple\ncherry\napple\nbanana')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [unique, setUnique] = useState(true)
  const [trim, setTrim] = useState(true)
  const result = useMemo(() => sortLines(text, { direction, unique, trim }), [text, direction, unique, trim])

  return (
    <div className="tool-panel">
      <div className="tool-grid-2">
        <Field label="Lines"><TextArea value={text} onChange={setText} rows={10} /></Field>
        <div className="tool-column">
          <div className="tool-row">
            <Field label="Order">
              <Select value={direction} onChange={setDirection} label="Order" options={[{ value: 'asc', label: 'A → Z' }, { value: 'desc', label: 'Z → A' }]} />
            </Field>
            <Field label="Remove duplicates">
              <Select value={unique ? 'yes' : 'no'} onChange={value => setUnique(value === 'yes')} label="Unique" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
            </Field>
            <Field label="Trim blank lines">
              <Select value={trim ? 'yes' : 'no'} onChange={value => setTrim(value === 'yes')} label="Trim" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
            </Field>
          </div>
          <Output label={`${result.split('\n').filter(Boolean).length} lines`} value={result} multiline />
        </div>
      </div>
      <p className="tool-hint">Sorting is numeric-aware, so item2 comes before item10 rather than after it.</p>
    </div>
  )
}

/* ---------------- duplicate remover ---------------- */

export function DuplicateTool() {
  const [text, setText] = useState('')
  const { kept, removed } = useMemo(() => dedupeLines(text), [text])
  return (
    <div className="tool-panel">
      <div className="tool-grid-2">
        <Field label="Lines"><TextArea value={text} onChange={setText} rows={10} placeholder="One item per line" /></Field>
        <div className="tool-column">
          <div className="tool-stats"><Stat label="kept" value={kept.split('\n').filter(Boolean).length} /><Stat label="removed" value={removed} /></div>
          <Output label="Result" value={kept} multiline />
        </div>
      </div>
      <p className="tool-hint">Matching is exact, so “Apple” and “apple ” are treated as different. Trim the list first if that is not what you want.</p>
    </div>
  )
}

/* ---------------- find and replace ---------------- */

export function FindReplaceTool() {
  const [text, setText] = useState('')
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const { result, count } = useMemo(
    () => findReplace(text, find, replace, { caseSensitive, wholeWord }),
    [text, find, replace, caseSensitive, wholeWord],
  )
  return (
    <div className="tool-panel">
      <TextArea value={text} onChange={setText} rows={8} label="Text" placeholder="Paste the text to edit" />
      <div className="tool-row">
        <Field label="Find"><TextInput value={find} onChange={setFind} placeholder="text to find" /></Field>
        <Field label="Replace with"><TextInput value={replace} onChange={setReplace} placeholder="replacement" /></Field>
      </div>
      <div className="tool-row">
        <Button variant={caseSensitive ? 'primary' : 'ghost'} onClick={() => setCaseSensitive(!caseSensitive)}>Match case</Button>
        <Button variant={wholeWord ? 'primary' : 'ghost'} onClick={() => setWholeWord(!wholeWord)}>Whole words only</Button>
      </div>
      <Output label={count === 1 ? '1 replacement' : `${count} replacements`} value={result} multiline />
      <p className="tool-hint">The search text is treated literally — a dot matches a dot, not any character.</p>
    </div>
  )
}

/* ---------------- diff ---------------- */

export function DiffTool() {
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const diff = useMemo(() => diffLines(before, after), [before, after])
  const changed = diff.filter(line => line.kind !== 'same').length

  return (
    <div className="tool-panel">
      <div className="tool-grid-2">
        <Field label="Before"><TextArea value={before} onChange={setBefore} rows={9} /></Field>
        <Field label="After"><TextArea value={after} onChange={setAfter} rows={9} /></Field>
      </div>
      <div className="tool-output">
        <div className="tool-output-head">
          <span className="tool-label">{changed} changed lines</span>
          <CopyButton value={diff.map(line => `${line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  '}${line.text}`).join('\n')} label="Copy patch" />
        </div>
        <div className="tool-diff">
          {diff.length === 0 ? <span className="tool-hint">Paste text into both boxes.</span> : null}
          {diff.map((line, index) => (
            <div key={index} className={`tool-diff-line ${line.kind}`}>
              <span className="tool-diff-mark">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</span>
              <span>{line.text || '\u00a0'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------------- lorem ipsum ---------------- */

export function LoremTool() {
  const [count, setCount] = useState('3')
  const [kind, setKind] = useState<'sentences' | 'words' | 'paragraphs'>('paragraphs')
  const [seed, setSeed] = useState(7)
  const text = useMemo(() => loremIpsum(Number(count) || 1, kind, seed), [count, kind, seed])
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="How many"><TextInput type="number" min={1} max={50} value={count} onChange={setCount} /></Field>
        <Field label="Of what">
          <Select value={kind} onChange={setKind} label="Unit" options={[{ value: 'paragraphs', label: 'Paragraphs' }, { value: 'sentences', label: 'Sentences' }, { value: 'words', label: 'Words' }]} />
        </Field>
        <Field label="Reshuffle"><Button variant="ghost" onClick={() => setSeed(seed + 1)}>New words</Button></Field>
      </div>
      <Output label="Placeholder" value={text} multiline />
      <p className="tool-hint">Same seed gives the same text, so a layout will not shift every time the page re-renders.</p>
    </div>
  )
}

/* ---------------- reverser ---------------- */

export function ReverseTool() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'characters' | 'words' | 'lines'>('characters')
  return (
    <div className="tool-panel">
      <div className="tool-grid-2">
        <Field label="Text"><TextArea value={text} onChange={setText} rows={8} /></Field>
        <div className="tool-column">
          <Field label="Reverse">
            <Select value={mode} onChange={setMode} label="Mode" options={[{ value: 'characters', label: 'Letters' }, { value: 'words', label: 'Word order' }, { value: 'lines', label: 'Line order' }]} />
          </Field>
          <Output label="Reversed" value={reverseText(text, mode)} multiline />
        </div>
      </div>
      <p className="tool-hint">Emoji and accented letters are kept whole — reversing by bytes would corrupt them.</p>
    </div>
  )
}

/* ---------------- wordplay ---------------- */

export function PalindromeTool() {
  const [text, setText] = useState('A man, a plan, a canal: Panama')
  const ok = isPalindrome(text)
  return (
    <div className="tool-panel">
      <TextArea value={text} onChange={setText} rows={4} label="Text" />
      <div className={`tool-verdict ${ok ? 'good' : 'bad'}`}>{ok ? 'Yes — it reads the same both ways.' : 'No — reversed it is different.'}</div>
      <p className="tool-hint">Case, spaces and punctuation are ignored, which is the usual convention.</p>
    </div>
  )
}

export function AcronymTool() {
  const [text, setText] = useState('portable network graphics')
  return (
    <div className="tool-panel">
      <Field label="Phrase"><TextInput value={text} onChange={setText} /></Field>
      <Output label="Acronym" value={acronym(text)} />
      <p className="tool-hint">Short joining words (of, and, the, for…) are dropped; everything else contributes its first letter.</p>
    </div>
  )
}

export function NatoTool() {
  const [text, setText] = useState('gg lounge')
  const words = useMemo(() => toNato(text), [text])
  return (
    <div className="tool-panel">
      <Field label="Say this out loud"><TextInput value={text} onChange={setText} /></Field>
      <Output label="Spell it" value={words.join(' ')} multiline />
      <p className="tool-hint">Slash marks a space. This is the alphabet used on the phone when a letter matters.</p>
    </div>
  )
}

export function MorseTool() {
  const [text, setText] = useState('sos')
  const [direction, setDirection] = useState<'to' | 'from'>('to')
  const output = useMemo(() => (direction === 'to' ? toMorse(text) : fromMorse(text)), [text, direction])
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Direction">
          <Select value={direction} onChange={setDirection} label="Direction" options={[{ value: 'to', label: 'Text → Morse' }, { value: 'from', label: 'Morse → Text' }]} />
        </Field>
      </div>
      <Field label="Input"><TextArea value={text} onChange={setText} rows={5} /></Field>
      <Output label="Output" value={output} multiline />
      <p className="tool-hint">Letters are separated by spaces and words by a slash, which is the convention that survives copy-paste.</p>
    </div>
  )
}

export function BinaryTextTool() {
  const [text, setText] = useState('hi')
  const [direction, setDirection] = useState<'to' | 'from'>('to')
  const encoded = useMemo(() => (direction === 'to' ? toBinaryText(text) : fromBinaryText(text) ?? 'not valid binary'), [text, direction])
  return (
    <div className="tool-panel">
      <Field label="Direction">
        <Select value={direction} onChange={setDirection} label="Direction" options={[{ value: 'to', label: 'Text → binary' }, { value: 'from', label: 'Binary → text' }]} />
      </Field>
      <Field label="Input"><TextArea value={text} onChange={setText} rows={5} /></Field>
      <Output label="Output" value={encoded} multiline />
      <p className="tool-hint">Each group of eight bits is one UTF-8 byte, so “é” becomes two groups rather than one.</p>
    </div>
  )
}

export function LetterFrequencyTool() {
  const [text, setText] = useState('')
  const frequency = useMemo(() => letterFrequency(text), [text])
  const max = frequency[0]?.count ?? 1
  return (
    <div className="tool-panel">
      <TextArea value={text} onChange={setText} rows={6} label="Text" />
      <div className="tool-bars">
        {frequency.length === 0 ? <span className="tool-hint">Type something to see the letters.</span> : null}
        {frequency.map(item => (
          <div key={item.letter} className="tool-bar-row">
            <span className="tool-bar-label">{item.letter}</span>
            <div className="tool-bar-track"><div className="tool-bar-fill" style={{ width: `${(item.count / max) * 100}%` }} /></div>
            <span className="tool-bar-count">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SpongeTool() {
  const [text, setText] = useState('this is fine')
  const [seed, setSeed] = useState(1)
  return (
    <div className="tool-panel">
      <Field label="Text"><TextInput value={text} onChange={setText} /></Field>
      <Output label="SpongeCase" value={toSpongeCase(text, seed)} />
      <Button variant="ghost" onClick={() => setSeed(seed + 1)}>Reshuffle the capitals</Button>
    </div>
  )
}

export function FancyTextTool() {
  const [text, setText] = useState('gg lounge')
  // Unicode "mathematical" ranges are contiguous from 'A' and 'a', and the
  // fullwidth forms are contiguous from '0' and 'A', so an offset does the work.
  const bold = text.replace(/[A-Za-z0-9]/g, char => {
    const code = char.charCodeAt(0)
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d400 + code - 65)
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d41a + code - 97)
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7ce + code - 48)
    return char
  })
  const fullwidth = text.replace(/[!-~]/g, char => String.fromCharCode(char.charCodeAt(0) + 0xfee0)).replace(/ /g, '\u3000')
  const circled = text.replace(/[A-Za-z]/g, char => {
    const code = char.charCodeAt(0)
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x24b6 + code - 65)
    return String.fromCodePoint(0x24d0 + code - 97)
  })
  return (
    <div className="tool-panel">
      <Field label="Text"><TextInput value={text} onChange={setText} /></Field>
      <div className="tool-stack">
        <Output label="Bold" value={bold} />
        <Output label="Fullwidth" value={fullwidth} />
        <Output label="Circled" value={circled} />
      </div>
      <p className="tool-hint">These are real Unicode characters, not styling — they will paste into names and bios, and screen the same size everywhere.</p>
    </div>
  )
}
