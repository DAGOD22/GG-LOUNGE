'use client'
/**
 * Developer tools.
 *
 * Several of these decode things a person should be able to inspect with their
 * own eyes — a JWT, a Base64 blob, a cron line — without pasting it into a
 * stranger's website. That is the entire point: the answer arrives without the
 * value leaving the tab.
 */
import { useEffect, useMemo, useState } from 'react'

import {
  base64Decode, base64Encode, csvToJson, decodeJwt, describeUuid, explainCron,
  formatBytes, generateUuid, ibanCheck, intToIpv4, ipv4ToInt, isValidUuidV4,
  jsonToCsv, luhnCheck, passwordStrength, randomMac, tidySql, unicodeInfo,
  yamlToJson, type CsvRow,
} from '@/lib/tools/logic'
import { Button, CopyButton, Field, Output, Select, Stat, TextArea, TextInput } from './ui'

/* ---------------- base64 ---------------- */

export function Base64Tool() {
  const [text, setText] = useState('gg lounge')
  const [mode, setMode] = useState<'encode' | 'decode'>('encode')
  const encoded = useMemo(
    () => (mode === 'encode' ? base64Encode(text) : base64Decode(text) ?? 'not valid Base64'),
    [text, mode],
  )
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Direction">
          <Select value={mode} onChange={setMode} label="Direction" options={[{ value: 'encode', label: 'Encode' }, { value: 'decode', label: 'Decode' }]} />
        </Field>
      </div>
      <Field label="Input"><TextArea value={text} onChange={setText} rows={6} /></Field>
      <Output label="Output" value={encoded} multiline />
      <p className="tool-hint">Encoding goes through UTF-8 first, so emoji and accented letters survive instead of throwing.</p>
    </div>
  )
}

/* ---------------- URL encoder ---------------- */

export function UrlEncoderTool() {
  const [text, setText] = useState('https://example.com/search?q=hello world&lang=en')
  const [mode, setMode] = useState<'encode' | 'decode' | 'component'>('component')
  const output = useMemo(() => {
    try {
      if (mode === 'encode') return encodeURI(text)
      if (mode === 'component') return encodeURIComponent(text)
      return decodeURIComponent(text)
    } catch {
      return 'that is not valid percent-encoding'
    }
  }, [text, mode])
  return (
    <div className="tool-panel">
      <Field label="Mode">
        <Select value={mode} onChange={setMode} label="Mode" options={[
          { value: 'component', label: 'Encode a value (encodeURIComponent)' },
          { value: 'encode', label: 'Encode a whole URL (encodeURI)' },
          { value: 'decode', label: 'Decode' },
        ]} />
      </Field>
      <Field label="Input"><TextArea value={text} onChange={setText} rows={5} /></Field>
      <Output label="Output" value={output} multiline />
      <p className="tool-hint">
        Encoding a whole URL keeps its <code>?</code> and <code>&amp;</code>; encoding a value turns them into
        <code> %3F</code> and <code>%26</code>, which is what a query parameter needs.
      </p>
    </div>
  )
}

/* ---------------- UUID ---------------- */

export function UuidTool() {
  const [count, setCount] = useState('1')
  const [ids, setIds] = useState<string[]>(() => [generateUuid()])
  const generate = () => setIds(Array.from({ length: Math.max(1, Math.min(50, Number(count) || 1)) }, generateUuid))
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="How many"><TextInput type="number" min={1} max={50} value={count} onChange={setCount} /></Field>
        <Field label="&nbsp;"><Button onClick={generate}>Generate</Button></Field>
      </div>
      <div className="tool-uuid-list">
        {ids.map(id => (
          <div key={id} className="tool-uuid-row">
            <code>{id}</code>
            <CopyButton value={id} label="" />
          </div>
        ))}
      </div>
      <Output label="All of them" value={ids.join('\n')} multiline />
      <p className="tool-hint">Version 4 UUIDs are random rather than derived from a name or a time, so they can be generated offline without coordination.</p>
    </div>
  )
}

export function UuidCheckTool() {
  const [value, setValue] = useState('3f2504e0-4f89-41d3-9a0c-0305e82c3301')
  const info = describeUuid(value)
  const ok = isValidUuidV4(value)
  return (
    <div className="tool-panel">
      <Field label="UUID"><TextInput value={value} onChange={setValue} /></Field>
      <div className={`tool-verdict ${ok ? 'good' : 'bad'}`}>{ok ? 'Valid version 4 UUID.' : 'Not a valid version 4 UUID.'}</div>
      <div className="tool-stats">
        <Stat label="version" value={info.version ?? '—'} />
        <Stat label="variant" value={info.variant} />
      </div>
      <p className="tool-hint">The 13th hex digit is the version and the 17th encodes the variant, so a v1 UUID pasted in looks valid but is correctly rejected here.</p>
    </div>
  )
}

/* ---------------- JSON ---------------- */

export function JsonFormatTool() {
  const [text, setText] = useState('{"name":"gg","tags":["games","tools"],"count":250}')
  const [indent, setIndent] = useState<'2' | '4' | '0'>('2')
  const result = useMemo(() => {
    try {
      const parsed = JSON.parse(text)
      return { value: JSON.stringify(parsed, null, Number(indent)) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'That is not valid JSON.' }
    }
  }, [text, indent])
  return (
    <div className="tool-panel">
      <Field label="JSON"><TextArea value={text} onChange={setText} rows={10} /></Field>
      <Field label="Indent">
        <Select value={indent} onChange={setIndent} label="Indent" options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: '0', label: 'Minified' }]} />
      </Field>
      {'error' in result ? <div className="tool-error">{result.error}</div> : <Output label="Formatted" value={result.value} multiline />}
      <p className="tool-hint">The parse error points at the character position, which is usually enough to find the trailing comma.</p>
    </div>
  )
}

export function JsonDiffTool() {
  const [left, setLeft] = useState('{"a":1,"b":2}')
  const [right, setRight] = useState('{"a":1,"b":3,"c":4}')
  const diff = useMemo(() => {
    try {
      const a = JSON.parse(left) as Record<string, unknown>
      const b = JSON.parse(right) as Record<string, unknown>
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
      return {
        lines: keys
          .filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
          .map(key => `${key}: ${JSON.stringify(a[key]) ?? 'missing'} → ${JSON.stringify(b[key]) ?? 'missing'}`),
      }
    } catch {
      return { error: 'Both sides need to be valid JSON.' }
    }
  }, [left, right])
  return (
    <div className="tool-panel">
      <div className="tool-grid-2">
        <Field label="First"><TextArea value={left} onChange={setLeft} rows={8} /></Field>
        <Field label="Second"><TextArea value={right} onChange={setRight} rows={8} /></Field>
      </div>
      {'error' in diff ? <div className="tool-error">{diff.error}</div> : <Output label={diff.lines.length ? `${diff.lines.length} keys differ` : 'Identical at the top level'} value={diff.lines.join('\n') || 'no differences'} multiline />}
    </div>
  )
}

export function JsonTableTool() {
  const [text, setText] = useState('[{"name":"Ada","role":"engineer"},{"name":"Grace","role":"admiral"}]')
  const result = useMemo(() => {
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) return { error: 'This needs to be an array of objects.' }
      return { value: jsonToCsv(parsed as CsvRow[]) || 'nothing to convert' }
    } catch {
      return { error: 'That is not valid JSON.' }
    }
  }, [text])
  return (
    <div className="tool-panel">
      <Field label="JSON array"><TextArea value={text} onChange={setText} rows={8} /></Field>
      {'error' in result ? <div className="tool-error">{result.error}</div> : <Output label="CSV" value={result.value} multiline />}
    </div>
  )
}

export function CsvJsonTool() {
  const [text, setText] = useState('name,age\nAda,36\nGrace,45')
  const [direction, setDirection] = useState<'toJson' | 'toCsv'>('toJson')
  const result = useMemo(() => {
    if (direction === 'toJson') {
      const parsed = csvToJson(text)
      if ('error' in parsed) return { error: parsed.error }
      return { value: JSON.stringify(parsed, null, 2) }
    }
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) return { error: 'This needs to be an array of objects.' }
      return { value: jsonToCsv(parsed as CsvRow[]) }
    } catch {
      return { error: 'That is not valid JSON.' }
    }
  }, [text, direction])
  return (
    <div className="tool-panel">
      <Field label="Direction">
        <Select value={direction} onChange={setDirection} label="Direction" options={[{ value: 'toJson', label: 'CSV → JSON' }, { value: 'toCsv', label: 'JSON → CSV' }]} />
      </Field>
      <Field label="Input"><TextArea value={text} onChange={setText} rows={8} /></Field>
      {'error' in result ? <div className="tool-error">{result.error}</div> : <Output label="Output" value={result.value} multiline />}
      <p className="tool-hint">Quoted cells containing commas are handled. Numbers become numbers; empty cells become null rather than an empty string.</p>
    </div>
  )
}

export function YamlTool() {
  const [text, setText] = useState('name: gg\nports:\n  - 3000\n  - 3001\nfeatures:\n  tools: true\n')
  const result = useMemo(() => {
    const parsed = yamlToJson(text)
    return 'error' in parsed ? { error: parsed.error } : { value: JSON.stringify(parsed.value, null, 2) }
  }, [text])
  return (
    <div className="tool-panel">
      <Field label="YAML"><TextArea value={text} onChange={setText} rows={10} /></Field>
      {'error' in result ? <div className="tool-error">{result.error}</div> : <Output label="JSON" value={result.value} multiline />}
      <p className="tool-hint">Keys, values, lists and nesting by indentation. Anchors and multi-line scalars are out of scope and are reported rather than guessed at.</p>
    </div>
  )
}

/* ---------------- hash ---------------- */

export function HashTool() {
  const [text, setText] = useState('gg lounge')
  const [hashes, setHashes] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const bytes = new TextEncoder().encode(text)
      const algorithms = ['SHA-1', 'SHA-256', 'SHA-512']
      const entries = await Promise.all(algorithms.map(async algorithm => {
        const digest = await crypto.subtle.digest(algorithm, bytes)
        const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
        return [algorithm, hex] as const
      }))
      if (!cancelled) setHashes(Object.fromEntries(entries))
    }
    run().catch(() => setHashes({ error: 'Hashing is unavailable in this browser context.' }))
    return () => { cancelled = true }
  }, [text])
  return (
    <div className="tool-panel">
      <Field label="Text"><TextArea value={text} onChange={setText} rows={5} /></Field>
      {Object.entries(hashes).map(([algorithm, digest]) => (
        <Output key={algorithm} label={algorithm} value={digest} />
      ))}
      <p className="tool-hint">SHA-1 is shown for checksums only — it is not safe for anything security-related.</p>
    </div>
  )
}

export function FileHashTool() {
  const [digest, setDigest] = useState<string | null>(null)
  const [name, setName] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setName(`${file.name} · ${formatBytes(file.size)}`)
    setBusy(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const hash = await crypto.subtle.digest('SHA-256', buffer)
      setDigest([...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join(''))
    } catch {
      setError('Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-panel">
      <Field label="Choose a file" hint="The file is read in this tab and never uploaded.">
        <input className="tool-input" type="file" onChange={event => onFile(event.target.files?.[0])} />
      </Field>
      {busy ? <div className="tool-empty">Hashing…</div> : null}
      {error ? <div className="tool-error">{error}</div> : null}
      {digest ? <Output label={`SHA-256 of ${name}`} value={digest} /> : null}
      <p className="tool-hint">Useful for checking a download matches what was published, without trusting a third-party uploader.</p>
    </div>
  )
}

/* ---------------- password strength ---------------- */

export function PasswordStrengthTool() {
  const [password, setPassword] = useState('')
  const strength = passwordStrength(password)
  const years = strength.crackSeconds / 31_557_600
  return (
    <div className="tool-panel">
      <Field label="Password"><TextInput value={password} onChange={setPassword} /></Field>
      <div className={`tool-verdict ${strength.bits >= 60 ? 'good' : 'bad'}`}>
        {password ? `${strength.verdict} — about ${strength.bits} bits of entropy` : 'Type a password to measure it'}
      </div>
      <div className="tool-meter"><div className="tool-meter-fill" style={{ width: `${Math.min(100, (strength.bits / 100) * 100)}%` }} /></div>
      <div className="tool-stats">
        <Stat label="bits" value={strength.bits} />
        <Stat label="guesses" value={strength.guesses > 1e9 ? strength.guesses.toExponential(1) : Math.round(strength.guesses)} />
        <Stat label="offline crack" value={years > 1000 ? `${Math.round(years / 1000)}k years` : years > 1 ? `${Math.round(years)} years` : `${Math.round(strength.crackSeconds / 3600)} hours`} />
      </div>
      <p className="tool-hint">
        Typed into this page only — nothing is sent or stored. The estimate assumes 10 billion guesses a second,
        which is what a serious attacker with graphics cards gets against a fast hash.
      </p>
    </div>
  )
}

/* ---------------- regex ---------------- */

export function RegexTool() {
  const [pattern, setPattern] = useState('\\b\\w+@\\w+\\.\\w+\\b')
  const [flags, setFlags] = useState('gi')
  const [text, setText] = useState('write to hello@example.com or admin@gg-lounge.vercel.app')
  const result = useMemo(() => {
    try {
      const regex = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
      const matches = [...text.matchAll(regex)].map(match => match[0])
      return { matches }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'That pattern does not compile.' }
    }
  }, [pattern, flags, text])
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Pattern"><TextInput value={pattern} onChange={setPattern} /></Field>
        <Field label="Flags"><TextInput value={flags} onChange={setFlags} /></Field>
      </div>
      <Field label="Test text"><TextArea value={text} onChange={setText} rows={5} /></Field>
      {'error' in result ? <div className="tool-error">{result.error}</div> : (
        <>
          <div className="tool-stats"><Stat label="matches" value={result.matches.length} /></div>
          <Output label="Matched" value={result.matches.join('\n') || 'no matches'} multiline />
        </>
      )}
      <p className="tool-hint">The pattern runs here, in the page, so a badly written expression can only freeze this tab — never a server.</p>
    </div>
  )
}

/* ---------------- cron ---------------- */

export function CronTool() {
  const [expression, setExpression] = useState('*/5 * * * *')
  const explanation = explainCron(expression)
  return (
    <div className="tool-panel">
      <Field label="Cron expression" hint="minute hour day-of-month month day-of-week"><TextInput value={expression} onChange={setExpression} /></Field>
      {explanation ? <div className="tool-verdict good">{explanation}</div> : <div className="tool-error">A cron expression has five fields.</div>}
      <div className="tool-stats">
        <Stat label="every minute" value="* * * * *" />
        <Stat label="midnight" value="0 0 * * *" />
        <Stat label="Mondays 9am" value="0 9 * * 1" />
      </div>
      <p className="tool-hint">This describes the fields in plain English; it does not calculate the next run time, because that needs a full cron implementation to get right.</p>
    </div>
  )
}

/* ---------------- SQL ---------------- */

export function SqlTool() {
  const [sql, setSql] = useState('select id, name from games where broken = false and hidden = false order by name limit 20')
  const tidy = useMemo(() => tidySql(sql), [sql])
  return (
    <div className="tool-panel">
      <Field label="Query"><TextArea value={sql} onChange={setSql} rows={6} /></Field>
      <Output label="Tidied" value={tidy} multiline />
      <p className="tool-hint">Keyword formatting only — the query is not parsed or validated, and nothing is executed.</p>
    </div>
  )
}

/* ---------------- env sorter ---------------- */

export function EnvSortTool() {
  const [text, setText] = useState('DB_HOST=localhost\nAPI_KEY=abc\nDB_HOST=duplicate\nPORT=3000')
  const result = useMemo(() => {
    const lines = text.split('\n').filter(line => line.trim())
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const line of lines) {
      const [key] = line.split('=')
      if (seen.has(key.trim())) duplicates.push(key.trim())
      seen.set(key.trim(), line)
    }
    return {
      sorted: [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, line]) => line).join('\n'),
      duplicates: [...new Set(duplicates)],
    }
  }, [text])
  return (
    <div className="tool-panel">
      <Field label=".env contents"><TextArea value={text} onChange={setText} rows={8} /></Field>
      {result.duplicates.length ? <div className="tool-error">Duplicate keys: {result.duplicates.join(', ')} — the last value wins in most loaders.</div> : null}
      <Output label="Sorted" value={result.sorted} multiline />
      <p className="tool-hint">Values are shown as typed, so do not paste a real .env into a shared screen.</p>
    </div>
  )
}

/* ---------------- JWT ---------------- */

export function JwtTool() {
  const [token, setToken] = useState('')
  const decoded = useMemo(() => (token.trim() ? decodeJwt(token) : null), [token])
  return (
    <div className="tool-panel">
      <Field label="Token"><TextArea value={token} onChange={setToken} rows={4} placeholder="eyJhbGciOi…" /></Field>
      {decoded ? ('error' in decoded ? <div className="tool-error">{decoded.error}</div> : (
        <div className="tool-stack">
          <Output label="Header" value={JSON.stringify(decoded.header, null, 2)} multiline />
          <Output label="Payload" value={JSON.stringify(decoded.payload, null, 2)} multiline />
        </div>
      )) : <div className="tool-empty">Paste a token to read it.</div>}
      <p className="tool-hint">Decoding is not verification: this cannot tell you whether the signature is valid, only what the token claims. Never trust a payload you have not verified server-side.</p>
    </div>
  )
}

/* ---------------- validation ---------------- */

export function LuhnTool() {
  const [value, setValue] = useState('4242 4242 4242 4242')
  const ok = luhnCheck(value)
  return (
    <div className="tool-panel">
      <Field label="Card number"><TextInput value={value} onChange={setValue} /></Field>
      <div className={`tool-verdict ${ok ? 'good' : 'bad'}`}>{ok ? 'Passes the Luhn checksum.' : 'Fails the Luhn checksum.'}</div>
      <p className="tool-hint">A checksum catches typos, not fraud — every test card number passes. Nothing is stored or transmitted.</p>
    </div>
  )
}

export function IbanTool() {
  const [value, setValue] = useState('GB82 WEST 1234 5698 7654 32')
  const ok = ibanCheck(value)
  return (
    <div className="tool-panel">
      <Field label="IBAN"><TextInput value={value} onChange={setValue} /></Field>
      <div className={`tool-verdict ${ok ? 'good' : 'bad'}`}>{ok ? 'Valid mod-97 checksum.' : 'Fails the mod-97 checksum.'}</div>
      <p className="tool-hint">The last two digits before the account number are a checksum over the whole string, so a single wrong digit fails.</p>
    </div>
  )
}

export function IpTool() {
  const [value, setValue] = useState('192.168.0.1')
  const asInt = ipv4ToInt(value)
  return (
    <div className="tool-panel">
      <Field label="IPv4 address"><TextInput value={value} onChange={setValue} /></Field>
      <div className="tool-stats">
        <Stat label="as integer" value={asInt ?? 'invalid'} />
        <Stat label="as binary" value={asInt === null ? '—' : asInt.toString(2).padStart(32, '0')} />
        <Stat label="private?" value={asInt === null ? '—' : /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value) ? 'yes' : 'no'} />
      </div>
      {asInt !== null ? <Output label="Back again" value={intToIpv4(asInt) ?? '—'} /> : null}
      <p className="tool-hint">Private ranges are 10/8, 172.16/12 and 192.168/16 — addresses that never appear on the public internet.</p>
    </div>
  )
}

export function MacTool() {
  const [macs, setMacs] = useState<string[]>(() => [randomMac()])
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Button onClick={() => setMacs([randomMac(), ...macs].slice(0, 10))}>Generate</Button>
        <CopyButton label="Copy all" value={macs.join('\n')} />
      </div>
      <Output label="Addresses" value={macs.join('\n')} multiline />
      <p className="tool-hint">The locally-administered bit is set, so these cannot collide with real hardware on a network.</p>
    </div>
  )
}

/* ---------------- unicode ---------------- */

export function UnicodeTool() {
  const [char, setChar] = useState('🎮')
  const info = unicodeInfo(char)
  return (
    <div className="tool-panel">
      <Field label="Character"><TextInput value={char} onChange={value => setChar([...value].slice(-1).join(''))} /></Field>
      {info ? (
        <div className="tool-stats">
          <Stat label="code point" value={info.codePoint} />
          <Stat label="decimal" value={info.decimal} />
          <Stat label="UTF-8 bytes" value={info.utf8} />
          <Stat label="UTF-16 units" value={info.utf16} />
        </div>
      ) : <div className="tool-error">Type a character.</div>}
      <p className="tool-hint">An emoji is one code point but often two UTF-16 units, which is why JavaScript’s <code>length</code> disagrees with what you see.</p>
    </div>
  )
}

/* ---------------- keyboard / mouse / screen ---------------- */

export function KeyboardTool() {
  const [last, setLast] = useState<{ key: string; code: string; modifier: boolean; ctrl: boolean; alt: boolean; shift: boolean } | null>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      setLast({ key: event.key, code: event.code, modifier: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  return (
    <div className="tool-panel">
      <div className="tool-dropzone">Press any key</div>
      <div className="tool-stats">
        <Stat label="key" value={last?.key ?? '—'} />
        <Stat label="code" value={last?.code ?? '—'} />
        <Stat label="modifiers" value={last ? [last.ctrl && 'Ctrl', last.alt && 'Alt', last.shift && 'Shift', last.modifier && 'Meta'].filter(Boolean).join(' + ') || 'none' : '—'} />
      </div>
      <p className="tool-hint"><code>key</code> is what the character is; <code>code</code> is where the physical key sits, which is what you want for a game control.</p>
    </div>
  )
}

export function MouseTool() {
  const [state, setState] = useState({ x: 0, y: 0, button: '—', scroll: 0 })
  return (
    <div className="tool-panel">
      <div
        className="tool-dropzone"
        onMouseMove={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          setState(current => ({ ...current, x: Math.round(event.clientX - rect.left), y: Math.round(event.clientY - rect.top) }))
        }}
        onMouseDown={event => setState(current => ({ ...current, button: ['left', 'middle', 'right'][event.button] ?? String(event.button) }))}
        onWheel={event => setState(current => ({ ...current, scroll: current.scroll + Math.sign(event.deltaY) }))}
      >
        Move, click and scroll here
      </div>
      <div className="tool-stats">
        <Stat label="x" value={state.x} />
        <Stat label="y" value={state.y} />
        <Stat label="last button" value={state.button} />
        <Stat label="scroll direction" value={state.scroll} />
      </div>
    </div>
  )
}

export function ScreenTool() {
  const [info, setInfo] = useState(() => ({ width: 0, height: 0, dpr: 1, depth: 0, zone: '' }))
  useEffect(() => {
    const read = () => setInfo({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
      depth: window.screen?.colorDepth ?? 0,
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown',
    })
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])
  return (
    <div className="tool-panel">
      <div className="tool-stats">
        <Stat label="viewport" value={`${info.width}×${info.height}`} />
        <Stat label="pixel ratio" value={info.dpr} />
        <Stat label="colour depth" value={`${info.depth}-bit`} />
        <Stat label="time zone" value={info.zone || '—'} />
      </div>
      <p className="tool-hint">Read live, so resizing the window updates it. Handy when a layout breaks at exactly one width.</p>
    </div>
  )
}

export function BrowserTool() {
  const [agent, setAgent] = useState('')
  useEffect(() => setAgent(navigator.userAgent), [])
  return (
    <div className="tool-panel">
      <Output label="User agent" value={agent} multiline />
      <div className="tool-stats">
        <Stat label="language" value={typeof navigator !== 'undefined' ? navigator.language : '—'} />
        <Stat label="online" value={typeof navigator !== 'undefined' ? (navigator.onLine ? 'yes' : 'no') : '—'} />
      </div>
      <p className="tool-hint">A user agent string is self-reported and routinely spoofed, so treat it as a hint rather than a fact.</p>
    </div>
  )
}

export function StorageTool() {
  const [usage, setUsage] = useState<{ keys: number; bytes: number } | null>(null)
  const [cleared, setCleared] = useState(false)

  const read = () => {
    try {
      let bytes = 0
      let keys = 0
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key) continue
        keys++
        bytes += new Blob([key, localStorage.getItem(key) ?? '']).size
      }
      setUsage({ keys, bytes })
    } catch {
      setUsage({ keys: -1, bytes: -1 })
    }
  }

  useEffect(read, [])

  const clearToolStorage = () => {
    try {
      // Only this site's namespaced keys, never the session or theme.
      const doomed: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('ggl.tools.')) doomed.push(key)
      }
      doomed.forEach(key => localStorage.removeItem(key))
      setCleared(true)
      read()
    } catch {
      // Nothing to do if storage is blocked.
    }
  }

  return (
    <div className="tool-panel">
      <div className="tool-stats">
        <Stat label="keys" value={usage?.keys ?? '—'} />
        <Stat label="approx size" value={usage && usage.bytes >= 0 ? formatBytes(usage.bytes) : 'blocked'} />
      </div>
      <Button variant="danger" onClick={clearToolStorage}><span>Clear this page’s saved inputs</span></Button>
      {cleared ? <p className="tool-hint">Cleared. Sign-in and theme settings were left alone.</p> : null}
      <p className="tool-hint">The tools page remembers the inputs you leave behind in <code>localStorage</code>, prefixed <code>ggl.tools.</code>. This button removes only those.</p>
    </div>
  )
}

export { CopyButton }
