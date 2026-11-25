'use client'
/**
 * Small pieces every tool panel reuses.
 *
 * The point of putting them here is consistency of behaviour rather than looks:
 * a copy button that reports what happened, a text field that is always a
 * labelled textarea with a live character count, and a result box that never
 * renders `NaN` at a person. Each of those was wrong in at least one panel
 * before it was a shared component.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function copyToClipboard(text: string): Promise<boolean> {
  // navigator.clipboard needs a secure context and permission; the sandboxed
  // iframe case fails, so fall back to the old selection trick.
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => legacyCopy(text))
  }
  return Promise.resolve(legacyCopy(text))
}

function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const onClick = useCallback(async () => {
    const ok = await copyToClipboard(value)
    setState(ok ? 'done' : 'failed')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1600)
  }, [value])

  return (
    <button type="button" className={`tool-copy ${state}`} onClick={onClick} disabled={!value}>
      {state === 'done' ? <Check size={13} /> : <Copy size={13} />}
      <span>{state === 'done' ? 'Copied' : state === 'failed' ? 'Press ⌘C' : label}</span>
    </button>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="tool-field">
      <span className="tool-label">{label}</span>
      {children}
      {hint ? <span className="tool-hint">{hint}</span> : null}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  max,
  step,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'number' | 'date' | 'time' | 'search' | 'color'
  min?: number
  max?: number
  step?: number
  ariaLabel?: string
}) {
  return (
    <input
      className="tool-input"
      type={type}
      value={value}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={event => onChange(event.target.value)}
    />
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 6,
  label,
  showCount = true,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  label?: string
  showCount?: boolean
}) {
  return (
    <div className="tool-textarea-wrap">
      <textarea
        className="tool-textarea"
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-label={label}
        onChange={event => onChange(event.target.value)}
      />
      {showCount ? <span className="tool-textarea-count">{[...value].length}</span> : null}
    </div>
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <select className="tool-input tool-select" value={value} aria-label={label} onChange={event => onChange(event.target.value as T)}>
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

export function Output({
  value,
  label = 'Result',
  mono = true,
  copy = true,
  multiline = false,
}: {
  value: string
  label?: string
  mono?: boolean
  copy?: boolean
  multiline?: boolean
}) {
  return (
    <div className="tool-output">
      <div className="tool-output-head">
        <span className="tool-label">{label}</span>
        {copy ? <CopyButton value={value} /> : null}
      </div>
      <pre className={`tool-output-body ${mono ? 'is-mono' : ''} ${multiline ? 'is-block' : ''}`}>{value || '—'}</pre>
    </div>
  )
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="tool-stat">
      <span className="tool-stat-value">{value}</span>
      <span className="tool-stat-label">{label}</span>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="tool-toggle">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} className={`tool-button ${variant}`} onClick={onClick} disabled={disabled}>{children}</button>
  )
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  label: string
}) {
  return (
    <div className="tool-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={event => onChange(Number(event.target.value))}
      />
      <span className="tool-slider-value">{value}</span>
    </div>
  )
}

/** Persist a single value across visits, namespaced to this site. */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const storageKey = useMemo(() => `ggl.tools.${key}`, [key])
  const [state, setState] = useState<T>(initial)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw !== null) setState(JSON.parse(raw) as T)
    } catch {
      // A blocked or full localStorage must not break the tool.
    }
  }, [storageKey])

  const update = useCallback((value: T) => {
    setState(value)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Same: storage is a nicety here, not a requirement.
    }
  }, [storageKey])

  return [state, update]
}
