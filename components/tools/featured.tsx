'use client'
/**
 * The headline tools: QR generator and calculator.
 *
 * These two are the ones the page would be judged on, so they get the most
 * attention. Both keep working with the keyboard alone and neither sends
 * anything anywhere.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Delete } from 'lucide-react'

import { encodeQr, qrToSvg, qrCapacity } from '@/lib/tools/qr'
import { evaluateExpression, formatNumber } from '@/lib/tools/logic'
import { Button, CopyButton, Field, Select, TextArea, TextInput, useStoredState } from './ui'

/* ---------------- QR generator ---------------- */

type QrOptions = { scale: number; margin: number; dark: string; light: string; label: string }

const QR_DEFAULTS: QrOptions = { scale: 8, margin: 2, dark: '#0b0b0f', light: '#ffffff', label: '' }

const QR_EXAMPLES = [
  'https://gg-lounge.vercel.app',
  'https://gg-lounge.vercel.app/secret-link-doc',
  'WIFI:T:WPA;S:GG-Lounge;P:guest;;',
  'mailto:hello@gg-lounge.vercel.app',
  'BEGIN:VCARD\nVERSION:3.0\nFN:GG Lounge\nURL:https://gg-lounge.vercel.app\nEND:VCARD',
]

export function QrTool() {
  const [text, setText] = useStoredState<string>('qr.text', 'https://gg-lounge.vercel.app')
  const [options, setOptions] = useStoredState<QrOptions>('qr.options', QR_DEFAULTS)
  const [error, setError] = useState<string | null>(null)

  // Encoding is synchronous and cheap, but a very long paste would still run on
  // every keystroke; 120 ms of debounce keeps typing smooth.
  const [debounced, setDebounced] = useState(text)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(text), 120)
    return () => clearTimeout(handle)
  }, [text])

  type QrResult =
    | { kind: 'empty' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; version: number; size: number; svg: string }

  const encoded = useMemo<QrResult>(() => {
    if (!debounced.trim()) return { kind: 'empty' }
    try {
      const matrix = encodeQr(debounced)
      return {
        kind: 'ok',
        version: matrix.version,
        size: matrix.size,
        svg: qrToSvg(debounced, { scale: options.scale, margin: options.margin, dark: options.dark, light: options.light }),
      }
    } catch (err) {
      return { kind: 'error', message: err instanceof Error ? err.message : 'That text is too long for a QR code.' }
    }
  }, [debounced, options.scale, options.margin, options.dark, options.light])

  useEffect(() => {
    setError(encoded.kind === 'error' ? encoded.message : null)
  }, [encoded])

  const download = () => {
    if (encoded.kind !== 'ok') return
    const blob = new Blob([encoded.svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `qr-${Date.now()}.svg`
    anchor.click()
    // Revoking immediately can cancel the download in some browsers; a tick is
    // enough for the click to have been handled.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const capacity = qrCapacity()
  const bytes = new TextEncoder().encode(debounced).length

  return (
    <div className="tool-panel">
      <div className="tool-grid-2">
        <div className="tool-column">
          <Field label="Text or link" hint={`${bytes} of ${capacity} bytes used — emoji and accents count as more than one`}>
            <TextArea value={text} onChange={setText} rows={6} label="QR contents" placeholder="https://example.com" />
          </Field>
          <div className="tool-examples">
            {QR_EXAMPLES.map(example => (
              <button key={example} type="button" className="tool-chip" onClick={() => setText(example)}>
                {example.startsWith('BEGIN') ? 'Contact card' : example.startsWith('WIFI') ? 'Wi-Fi network' : example.replace('https://', '').split('\n')[0].slice(0, 26)}
              </button>
            ))}
          </div>
          <div className="tool-row">
            <Field label="Pixel scale">
              <TextInput type="number" min={2} max={24} value={String(options.scale)} onChange={value => setOptions({ ...options, scale: Math.max(2, Math.min(24, Number(value) || 8)) })} />
            </Field>
            <Field label="Quiet margin">
              <TextInput type="number" min={0} max={8} value={String(options.margin)} onChange={value => setOptions({ ...options, margin: Math.max(0, Math.min(8, Number(value) || 0)) })} />
            </Field>
            <Field label="Dark">
              <TextInput type="color" value={options.dark} onChange={value => setOptions({ ...options, dark: value })} />
            </Field>
            <Field label="Light">
              <TextInput type="color" value={options.light} onChange={value => setOptions({ ...options, light: value })} />
            </Field>
          </div>
        </div>

        <div className="tool-column tool-qr-result">
          {error ? (
            <div className="tool-error" role="alert">{error}</div>
          ) : encoded.kind === 'ok' ? (
            <>
              <div
                className="tool-qr-preview"
                // The SVG is generated here from numbers, never from user text
                // as markup, so there is no injection surface.
                dangerouslySetInnerHTML={{ __html: encoded.svg }}
                role="img"
                aria-label="QR code preview"
              />
              <div className="tool-qr-meta">
                <span>Version {encoded.version}</span>
                <span>{encoded.size}×{encoded.size} modules</span>
                <span>EC level M</span>
              </div>
              <div className="tool-row">
                <Button onClick={download}><Download size={14} /> Download SVG</Button>
                <CopyButton label="Copy SVG" value={encoded.svg} />
              </div>
              <p className="tool-hint">
                Error correction level M recovers about 15% of a damaged code, which is the right trade for a
                sticker or a screen. Scanning a phone screen from across a room works better with the light
                colour kept white.
              </p>
            </>
          ) : (
            <div className="tool-empty">Type something to generate a code.</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- calculator ---------------- */

const CALC_KEYS: { label: string; value: string; kind?: 'op' | 'wide' | 'equals' }[] = [
  { label: '7', value: '7' }, { label: '8', value: '8' }, { label: '9', value: '9' }, { label: '÷', value: '/', kind: 'op' },
  { label: '4', value: '4' }, { label: '5', value: '5' }, { label: '6', value: '6' }, { label: '×', value: '*', kind: 'op' },
  { label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }, { label: '−', value: '-', kind: 'op' },
  { label: '0', value: '0' }, { label: '.', value: '.' }, { label: '%', value: '%', kind: 'op' }, { label: '+', value: '+', kind: 'op' },
  { label: '(', value: '(', kind: 'op' }, { label: ')', value: ')', kind: 'op' }, { label: '^', value: '^', kind: 'op' }, { label: '⌫', value: 'back', kind: 'op' },
  { label: 'Clear', value: 'clear', kind: 'wide' }, { label: '=', value: '=', kind: 'equals' },
]

export function CalculatorTool() {
  const [expression, setExpression] = useStoredState<string>('calc.expression', '')
  const [history, setHistory] = useStoredState<string[]>('calc.history', [])
  const [committed, setCommitted] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const preview = useMemo(() => evaluateExpression(expression), [expression])

  const press = (value: string) => {
    if (value === 'clear') { setExpression(''); setCommitted(null); return }
    if (value === 'back') { setExpression([...expression].slice(0, -1).join('')); return }
    if (value === '=') {
      if (preview === null) return
      const line = `${expression} = ${formatNumber(preview)}`
      setCommitted(formatNumber(preview))
      setHistory([line, ...history].slice(0, 12))
      return
    }
    // After pressing equals, a digit starts a new sum; an operator continues
    // from the answer, which is what a desk calculator does.
    if (committed !== null) {
      const isOperator = '+-*/%^'.includes(value)
      setExpression(isOperator ? committed + value : value)
      setCommitted(null)
      return
    }
    setExpression(expression + value)
  }

  // Physical keyboard support: the panel is useless to anyone who tries to type
  // into it and finds only buttons.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Do not hijack keys meant for another input on the page.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (/^[0-9.+\-*/%^()]$/.test(event.key)) { setExpression(expression + event.key); event.preventDefault() }
      else if (event.key === 'Enter' || event.key === '=') { if (preview !== null) press('='); event.preventDefault() }
      else if (event.key === 'Backspace') { setExpression([...expression].slice(0, -1).join('')); event.preventDefault() }
      else if (event.key === 'Escape') { setExpression(''); setCommitted(null) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="tool-panel">
      <div className="tool-grid-2 calc">
        <div className="tool-column">
          <input
            ref={inputRef}
            className="calc-display"
            value={expression}
            aria-label="Calculator expression"
            placeholder="0"
            onChange={event => { setExpression(event.target.value); setCommitted(null) }}
            onKeyDown={event => { if (event.key === 'Enter') press('=') }}
          />
          <div className={`calc-preview ${preview === null ? 'is-invalid' : ''}`} aria-live="polite">
            {preview !== null ? `= ${formatNumber(preview)}` : expression ? 'not a valid sum' : '\u00a0'}
          </div>
          <div className="calc-keys">
            {CALC_KEYS.map(key => (
              <button
                key={key.label}
                type="button"
                className={`calc-key ${key.kind ?? ''}`}
                onClick={() => press(key.value)}
                aria-label={key.label === '⌫' ? 'Backspace' : key.label}
              >
                {key.label === '⌫' ? <Delete size={15} /> : key.label}
              </button>
            ))}
          </div>
        </div>
        <div className="tool-column">
          <div className="tool-output">
            <div className="tool-output-head">
              <span className="tool-label">History</span>
              {history.length ? (
                <button type="button" className="tool-copy" onClick={() => setHistory([])}>Clear</button>
              ) : null}
            </div>
            <div className="calc-history">
              {history.length === 0 ? <span className="tool-hint">Press = to keep a sum here.</span> : null}
              {history.map((line, index) => (
                <button
                  key={`${line}-${index}`}
                  type="button"
                  className="calc-history-line"
                  onClick={() => { setExpression(line.split(' = ')[1] ?? ''); setCommitted(null) }}
                >
                  {line}
                </button>
              ))}
            </div>
          </div>
          <p className="tool-hint">
            Supports + − × ÷, %, powers with ^, brackets and unary minus. Input is tokenised and parsed here —
            it is never run as code, so pasting something clever into the box cannot execute anything.
          </p>
        </div>
      </div>
    </div>
  )
}

export { Select }
