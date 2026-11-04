'use client';

/** Shared GG-Lounge styling primitives for the Tools section. */
import type { ReactNode } from 'react';

export function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="tool-panel">
      <h2>{title}</h2>
      {hint && <p className="tool-hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="tool-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="tool-row">{children}</div>;
}

export function Button({
  children, onClick, variant = 'primary', type = 'button', disabled, title,
}: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost'; type?: 'button' | 'submit';
  disabled?: boolean; title?: string;
}) {
  return (
    <button type={type} className={`tool-btn ${variant === 'ghost' ? 'ghost' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Result({ value, label }: { value: string; label?: string }) {
  return (
    <div className="tool-result">
      {label && <span className="tool-result-label">{label}</span>}
      <output>{value}</output>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  return (
    <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(text); }} title="Copy to clipboard">
      Copy
    </Button>
  );
}

/** Persisted per-tool state so notes and options survive a reload. */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const storageKey = `ggl_tool_${key}`;
  const [state, setState] = usePersistedState(initial, storageKey);
  return [state, setState];
}

import { useEffect, useState } from 'react';
function usePersistedState<T>(initial: T, storageKey: string): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch { /* first run or blocked storage */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }, [value, storageKey]);
  return [value, setValue];
}
