'use client';

/** The eighteen GG-Lounge tools. Everything runs locally in the browser. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, CopyButton, Field, Panel, Result, Row, useStoredState } from './ui';

/* ------------------------------------------------------------------ calculator */
const KEYS = [
  ['C', '(', ')', '/'],
  ['7', '8', '9', '*'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '%', '='],
];

/** Small shunting-yard evaluator — no eval(), no injection surface. */
export function evaluate(expression: string): number | null {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/%]/g);
  if (!tokens) return null;
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
  const output: (number | string)[] = [];
  const operators: string[] = [];
  let expectOperand = true;

  for (const token of tokens) {
    if (/^\d/.test(token)) {
      output.push(parseFloat(token));
      expectOperand = false;
      continue;
    }
    if (token === '(') { operators.push(token); expectOperand = true; continue; }
    if (token === ')') {
      while (operators.length && operators[operators.length - 1] !== '(') output.push(operators.pop()!);
      if (operators[operators.length - 1] !== '(') return null;
      operators.pop();
      expectOperand = false;
      continue;
    }
    // operator; a leading '-' is unary negation
    if (expectOperand && (token === '-' || token === '+')) {
      if (token === '-') operators.push('u-');
      continue;
    }
    while (
      operators.length &&
      operators[operators.length - 1] !== '(' &&
      (precedence[operators[operators.length - 1]] || (operators[operators.length - 1] === 'u-' ? 3 : 0)) >= (precedence[token] || 0)
    ) {
      output.push(operators.pop()!);
    }
    operators.push(token);
    expectOperand = true;
  }
  while (operators.length) {
    const op = operators.pop()!;
    if (op === '(') return null;
    output.push(op);
  }

  const stack: number[] = [];
  for (const item of output) {
    if (typeof item === 'number') { stack.push(item); continue; }
    if (item === 'u-') {
      if (!stack.length) return null;
      stack.push(-stack.pop()!);
      continue;
    }
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) return null;
    if (item === '+') stack.push(a + b);
    else if (item === '-') stack.push(a - b);
    else if (item === '*') stack.push(a * b);
    else if (item === '/') stack.push(b === 0 ? NaN : a / b);
    else if (item === '%') stack.push(b === 0 ? NaN : a % b);
  }
  if (stack.length !== 1) return null;
  return stack[0];
}

export function Calculator() {
  const [expression, setExpression] = useState('');
  const [answer, setAnswer] = useState('0');

  const press = (key: string) => {
    if (key === 'C') { setExpression(''); setAnswer('0'); return; }
    if (key === '=') {
      const value = evaluate(expression);
      if (value === null || Number.isNaN(value)) { setAnswer('Error'); return; }
      const rounded = Math.round(value * 1e10) / 1e10;
      setAnswer(String(rounded));
      setExpression(String(rounded));
      return;
    }
    setExpression(prev => prev + key);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9.]$/.test(e.key) || '+-*/%()'.includes(e.key)) setExpression(prev => prev + e.key);
      else if (e.key === 'Enter') press('=');
      else if (e.key === 'Backspace') setExpression(prev => prev.slice(0, -1));
      else if (e.key === 'Escape') { setExpression(''); setAnswer('0'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const live = useMemo(() => {
    if (!expression) return '0';
    const value = evaluate(expression);
    if (value === null || Number.isNaN(value)) return '—';
    return String(Math.round(value * 1e10) / 1e10);
  }, [expression]);

  return (
    <Panel title="Calculator" hint="Type with the keyboard or tap the pad. Enter solves, Escape clears.">
      <div className="calc-screen">
        <div className="calc-expression">{expression || '0'}</div>
        <div className="calc-answer">= {answer === '0' ? live : answer}</div>
      </div>
      <div className="calc-keys">
        {KEYS.flat().map(key => (
          <button key={key} type="button" className={`calc-key ${key === '=' ? 'equals' : ''} ${key === 'C' ? 'clear' : ''}`} onClick={() => press(key)}>
            {key}
          </button>
        ))}
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------------------- notepad */
export function Notepad() {
  const [text, setText] = useStoredState('notepad', '');
  const [status, setStatus] = useState('Saved on this device');

  useEffect(() => {
    setStatus('Saved on this device');
  }, [text]);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const download = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gg-lounge-notes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel title="Notepad" hint={`${words} word${words === 1 ? '' : 's'} · ${text.length} characters · autosaved in this browser.`}>
      <textarea
        className="tool-textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Start typing…"
        aria-label="Notepad"
        spellCheck
      />
      <Row>
        <Button onClick={download}>Download .txt</Button>
        <CopyButton text={text} />
        <Button variant="ghost" onClick={() => setText('')}>Clear</Button>
        <span className="tool-status">{status}</span>
      </Row>
    </Panel>
  );
}

/* ------------------------------------------------------------------- stopwatch */
export function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!running) return;
    startedAt.current = performance.now() - elapsed;
    const id = setInterval(() => setElapsed(performance.now() - startedAt.current), 50);
    return () => clearInterval(id);
  }, [running, elapsed]);

  const format = (ms: number) => {
    const total = Math.floor(ms / 10);
    const m = Math.floor(total / 6000);
    const s = Math.floor((total % 6000) / 100);
    const c = total % 100;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
  };

  return (
    <Panel title="Stopwatch" hint="Space starts and stops, L records a lap.">
      <div className="clock-display">{format(elapsed)}</div>
      <Row>
        <Button onClick={() => setRunning(v => !v)}>{running ? 'Stop' : 'Start'}</Button>
        <Button variant="ghost" onClick={() => setLaps(l => [...l, elapsed])} disabled={!running}>Lap</Button>
        <Button variant="ghost" onClick={() => { setRunning(false); setElapsed(0); setLaps([]); }}>Reset</Button>
      </Row>
      {laps.length > 0 && (
        <ol className="lap-list">
          {laps.map((lap, i) => (
            <li key={i}>
              <span>Lap {i + 1}</span>
              <b>{format(lap - (laps[i - 1] ?? 0))}</b>
              <em>{format(lap)}</em>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------- countdown */
export function Countdown() {
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running || remaining === null) return;
    if (remaining <= 0) {
      setRunning(false);
      setRemaining(0);
      return;
    }
    const id = setTimeout(() => setRemaining(r => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(id);
  }, [running, remaining]);

  const total = minutes * 60 + seconds;
  const format = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const done = remaining === 0;

  useEffect(() => {
    if (!done) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); void ctx.close(); }, 600);
    } catch { /* audio is optional */ }
  }, [done]);

  return (
    <Panel title="Countdown timer" hint="Runs in this tab and plays a short tone when it finishes.">
      <div className={`clock-display ${done ? 'done' : ''}`}>{format(remaining ?? total)}</div>
      <div className="tool-grid-2">
        <Field label="Minutes">
          <input type="number" min={0} max={600} value={minutes} onChange={e => { setMinutes(Math.max(0, +e.target.value)); setRemaining(null); setRunning(false); }} />
        </Field>
        <Field label="Seconds">
          <input type="number" min={0} max={59} value={seconds} onChange={e => { setSeconds(Math.max(0, Math.min(59, +e.target.value))); setRemaining(null); setRunning(false); }} />
        </Field>
      </div>
      <Row>
        <Button onClick={() => { if (remaining === null || remaining === 0) setRemaining(total); setRunning(v => !v); }}>
          {running ? 'Pause' : remaining === 0 ? 'Restart' : 'Start'}
        </Button>
        <Button variant="ghost" onClick={() => { setRunning(false); setRemaining(null); }}>Reset</Button>
      </Row>
      <Row>
        {[1, 3, 5, 10, 15, 25].map(m => (
          <button key={m} type="button" className="tool-chip" onClick={() => { setMinutes(m); setSeconds(0); setRemaining(null); setRunning(false); }}>
            {m} min
          </button>
        ))}
      </Row>
    </Panel>
  );
}

/* ----------------------------------------------------------------- world clock */
const ZONES = [
  { label: 'Adelaide', zone: 'Australia/Adelaide' },
  { label: 'Sydney', zone: 'Australia/Sydney' },
  { label: 'Perth', zone: 'Australia/Perth' },
  { label: 'Auckland', zone: 'Pacific/Auckland' },
  { label: 'Tokyo', zone: 'Asia/Tokyo' },
  { label: 'Singapore', zone: 'Asia/Singapore' },
  { label: 'Dubai', zone: 'Asia/Dubai' },
  { label: 'London', zone: 'Europe/London' },
  { label: 'Paris', zone: 'Europe/Paris' },
  { label: 'New York', zone: 'America/New_York' },
  { label: 'Los Angeles', zone: 'America/Los_Angeles' },
  { label: 'UTC', zone: 'UTC' },
];

export function WorldClock() {
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useStoredState<string[]>('worldclock', ['Australia/Adelaide', 'Europe/London', 'America/New_York']);
  const toggleZone = (zone: string) =>
    setSelected(selected.includes(zone) ? selected.filter(x => x !== zone) : [...selected, zone]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Panel title="World clock" hint="Tap a city to add or remove it from your board.">
      <div className="clock-display small">
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="zone-grid">
        {ZONES.map(z => {
          const active = selected.includes(z.zone);
          return (
            <button
              key={z.zone}
              type="button"
              className={`zone-card ${active ? 'active' : ''}`}
              onClick={() => toggleZone(z.zone)}
            >
              <span>{z.label}</span>
              <b>{now.toLocaleTimeString([], { timeZone: z.zone, hour: '2-digit', minute: '2-digit' })}</b>
              <small>{now.toLocaleDateString([], { timeZone: z.zone, weekday: 'short', day: 'numeric', month: 'short' })}</small>
            </button>
          );
        })}
      </div>
      {selected.length === 0 && <p className="tool-hint">No cities selected — tap one above.</p>}
    </Panel>
  );
}

/* ----------------------------------------------------------------- dice roller */
export function DiceRoller() {
  const [count, setCount] = useState(2);
  const [sides, setSides] = useState(6);
  const [rolls, setRolls] = useState<number[][]>([]);

  const roll = () => {
    const result = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    setRolls(prev => [result, ...prev].slice(0, 12));
  };

  return (
    <Panel title="Dice roller" hint={`Rolls ${count}d${sides}. Fair, within the limits of your browser's random number generator.`}>
      <div className="tool-grid-2">
        <Field label="Dice">
          <input type="number" min={1} max={12} value={count} onChange={e => setCount(Math.max(1, Math.min(12, +e.target.value)))} />
        </Field>
        <Field label="Sides">
          <select value={sides} onChange={e => setSides(+e.target.value)}>
            {[4, 6, 8, 10, 12, 20, 100].map(n => <option key={n} value={n}>d{n}</option>)}
          </select>
        </Field>
      </div>
      <Row><Button onClick={roll}>Roll</Button><Button variant="ghost" onClick={() => setRolls([])}>Clear history</Button></Row>
      <div className="dice-tray">
        {(rolls[0] ?? []).map((value, i) => <span key={i} className="die">{value}</span>)}
      </div>
      {rolls.length > 0 && (
        <div className="roll-history">
          {rolls.map((roll, i) => (
            <div key={i}><span>#{rolls.length - i}</span><b>{roll.join(' + ')}</b><em>= {roll.reduce((a, b) => a + b, 0)}</em></div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------------- random picker */
export function RandomPicker() {
  const [names, setNames] = useStoredState('picker-names', 'Ada\nGrace\nLinus');
  const [picked, setPicked] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);

  const list = names.split('\n').map(n => n.trim()).filter(Boolean);

  const pick = () => {
    if (!list.length) return;
    setSpinning(true);
    let ticks = 0;
    const id = setInterval(() => {
      setPicked(list[Math.floor(Math.random() * list.length)]);
      if (++ticks > 12) {
        clearInterval(id);
        setPicked(list[Math.floor(Math.random() * list.length)]);
        setSpinning(false);
      }
    }, 70);
  };

  return (
    <Panel title="Random picker" hint="One name per line. Useful for choosing who goes first.">
      <textarea className="tool-textarea short" value={names} onChange={e => setNames(e.target.value)} aria-label="Names" />
      <Row><Button onClick={pick} disabled={!list.length || spinning}>{spinning ? 'Picking…' : 'Pick one'}</Button></Row>
      {picked && <Result value={picked} label={spinning ? '…' : 'Winner'} />}
    </Panel>
  );
}

/* ----------------------------------------------------------- password generator */
const WORD_LISTS = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?',
};

export function PasswordGenerator() {
  const [length, setLength] = useState(20);
  const [options, setOptions] = useStoredState('pwgen-options', { lower: true, upper: true, digits: true, symbols: true });
  const [password, setPassword] = useState('');

  const generate = () => {
    const pool = (Object.keys(WORD_LISTS) as (keyof typeof WORD_LISTS)[])
      .filter(k => options[k])
      .map(k => WORD_LISTS[k])
      .join('');
    if (!pool) { setPassword(''); return; }
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    let out = '';
    for (let i = 0; i < length; i++) out += pool[values[i] % pool.length];
    setPassword(out);
  };

  useEffect(() => { generate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const strength = useMemo(() => {
    if (!password) return { label: '—', score: 0 };
    const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(password)).length;
    const score = Math.min(4, Math.floor(password.length / 8) + variety - 1);
    const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    return { label: labels[Math.max(0, score)] ?? 'Weak', score: Math.max(0, score) };
  }, [password]);

  return (
    <Panel title="Password generator" hint="Generated in your browser with crypto.getRandomValues — never sent anywhere, never stored.">
      <div className="password-output">
        <code>{password || '—'}</code>
        <CopyButton text={password} />
      </div>
      <div className="strength">
        <div className="strength-bar"><i style={{ width: `${(strength.score / 4) * 100}%` }} /></div>
        <span>{strength.label}</span>
      </div>
      <label className="tool-range">
        <span>Length <b>{length}</b></span>
        <input type="range" min={8} max={64} value={length} onChange={e => setLength(+e.target.value)} />
      </label>
      <div className="tool-checks">
        {(Object.keys(WORD_LISTS) as (keyof typeof WORD_LISTS)[]).map(key => (
          <label key={key}>
            <input type="checkbox" checked={options[key]} onChange={e => setOptions({ ...options, [key]: e.target.checked })} />
            {key === 'lower' ? 'Lowercase' : key === 'upper' ? 'Uppercase' : key === 'digits' ? 'Numbers' : 'Symbols'}
          </label>
        ))}
      </div>
      <Row><Button onClick={generate}>Generate new</Button></Row>
    </Panel>
  );
}

/* ------------------------------------------------------------ percentage maths */
export function PercentageCalculator() {
  const [a, setA] = useState(20);
  const [b, setB] = useState(150);
  const [from, setFrom] = useState(80);
  const [to, setTo] = useState(120);

  return (
    <Panel title="Percentage calculator" hint="Three everyday percentage problems, solved live.">
      <div className="tool-grid-3">
        <Field label="What is X% of Y">
          <input type="number" value={a} onChange={e => setA(+e.target.value)} />
        </Field>
        <Field label="of">
          <input type="number" value={b} onChange={e => setB(+e.target.value)} />
        </Field>
        <Result value={String(Math.round((a / 100) * b * 100) / 100)} label="Result" />
      </div>
      <hr className="tool-divider" />
      <div className="tool-grid-3">
        <Field label="X is what % of Y">
          <input type="number" value={from} onChange={e => setFrom(+e.target.value)} />
        </Field>
        <Field label="of">
          <input type="number" value={to} onChange={e => setTo(+e.target.value)} />
        </Field>
        <Result value={to === 0 ? '—' : `${Math.round((from / to) * 10000) / 100}%`} label="Result" />
      </div>
      <hr className="tool-divider" />
      <Result value={from === 0 ? '—' : `${Math.round(((to - from) / Math.abs(from)) * 10000) / 100}%`} label={`Change from ${from} to ${to}`} />
    </Panel>
  );
}

/* ----------------------------------------------------------------- tip calc */
export function TipCalculator() {
  const [bill, setBill] = useState(60);
  const [percent, setPercent] = useState(15);
  const [people, setPeople] = useState(2);

  const tip = (bill * percent) / 100;
  const total = bill + tip;
  const perPerson = people > 0 ? total / people : total;

  return (
    <Panel title="Tip calculator" hint="Split the bill and round it to something sensible.">
      <div className="tool-grid-2">
        <Field label="Bill total">
          <input type="number" min={0} step="0.01" value={bill} onChange={e => setBill(Math.max(0, +e.target.value))} />
        </Field>
        <Field label="People">
          <input type="number" min={1} value={people} onChange={e => setPeople(Math.max(1, +e.target.value))} />
        </Field>
      </div>
      <label className="tool-range">
        <span>Tip <b>{percent}%</b></span>
        <input type="range" min={0} max={40} value={percent} onChange={e => setPercent(+e.target.value)} />
      </label>
      <div className="tool-chips">
        {[0, 10, 15, 18, 20, 25].map(p => (
          <button key={p} type="button" className={`tool-chip ${percent === p ? 'active' : ''}`} onClick={() => setPercent(p)}>{p}%</button>
        ))}
      </div>
      <div className="tip-summary">
        <Result value={`$${tip.toFixed(2)}`} label="Tip" />
        <Result value={`$${total.toFixed(2)}`} label="Total" />
        <Result value={`$${perPerson.toFixed(2)}`} label={`Each (${people})`} />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------- unit converter */
type UnitDef = { name: string; toBase: (v: number) => number; fromBase: (v: number) => number };
const UNITS: Record<string, Record<string, UnitDef>> = {
  Length: {
    'Millimetre': { name: 'mm', toBase: v => v / 1000, fromBase: v => v * 1000 },
    'Centimetre': { name: 'cm', toBase: v => v / 100, fromBase: v => v * 100 },
    'Metre': { name: 'm', toBase: v => v, fromBase: v => v },
    'Kilometre': { name: 'km', toBase: v => v * 1000, fromBase: v => v / 1000 },
    'Inch': { name: 'in', toBase: v => v * 0.0254, fromBase: v => v / 0.0254 },
    'Foot': { name: 'ft', toBase: v => v * 0.3048, fromBase: v => v / 0.3048 },
    'Yard': { name: 'yd', toBase: v => v * 0.9144, fromBase: v => v / 0.9144 },
    'Mile': { name: 'mi', toBase: v => v * 1609.344, fromBase: v => v / 1609.344 },
    'Nautical mile': { name: 'nmi', toBase: v => v * 1852, fromBase: v => v / 1852 },
  },
  Mass: {
    'Milligram': { name: 'mg', toBase: v => v / 1e6, fromBase: v => v * 1e6 },
    'Gram': { name: 'g', toBase: v => v / 1000, fromBase: v => v * 1000 },
    'Kilogram': { name: 'kg', toBase: v => v, fromBase: v => v },
    'Tonne': { name: 't', toBase: v => v * 1000, fromBase: v => v / 1000 },
    'Ounce': { name: 'oz', toBase: v => v * 0.028349523125, fromBase: v => v / 0.028349523125 },
    'Pound': { name: 'lb', toBase: v => v * 0.45359237, fromBase: v => v / 0.45359237 },
    'Stone': { name: 'st', toBase: v => v * 6.35029318, fromBase: v => v / 6.35029318 },
  },
  Temperature: {
    'Celsius': { name: '°C', toBase: v => v, fromBase: v => v },
    'Fahrenheit': { name: '°F', toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
    'Kelvin': { name: 'K', toBase: v => v - 273.15, fromBase: v => v + 273.15 },
  },
  Volume: {
    'Millilitre': { name: 'ml', toBase: v => v / 1000, fromBase: v => v * 1000 },
    'Litre': { name: 'L', toBase: v => v, fromBase: v => v },
    'Teaspoon (US)': { name: 'tsp', toBase: v => v * 0.00492892159, fromBase: v => v / 0.00492892159 },
    'Tablespoon (US)': { name: 'tbsp', toBase: v => v * 0.01478676478, fromBase: v => v / 0.01478676478 },
    'Cup (US)': { name: 'cup', toBase: v => v * 0.2365882365, fromBase: v => v / 0.2365882365 },
    'Pint (US)': { name: 'pt', toBase: v => v * 0.473176473, fromBase: v => v / 0.473176473 },
    'Gallon (US)': { name: 'gal', toBase: v => v * 3.785411784, fromBase: v => v / 3.785411784 },
  },
  Time: {
    'Second': { name: 's', toBase: v => v, fromBase: v => v },
    'Minute': { name: 'min', toBase: v => v * 60, fromBase: v => v / 60 },
    'Hour': { name: 'h', toBase: v => v * 3600, fromBase: v => v / 3600 },
    'Day': { name: 'd', toBase: v => v * 86400, fromBase: v => v / 86400 },
    'Week': { name: 'wk', toBase: v => v * 604800, fromBase: v => v / 604800 },
  },
  Data: {
    'Byte': { name: 'B', toBase: v => v, fromBase: v => v },
    'Kilobyte': { name: 'KB', toBase: v => v * 1024, fromBase: v => v / 1024 },
    'Megabyte': { name: 'MB', toBase: v => v * 1024 ** 2, fromBase: v => v / 1024 ** 2 },
    'Gigabyte': { name: 'GB', toBase: v => v * 1024 ** 3, fromBase: v => v / 1024 ** 3 },
    'Terabyte': { name: 'TB', toBase: v => v * 1024 ** 4, fromBase: v => v / 1024 ** 4 },
  },
  Speed: {
    'm/s': { name: 'm/s', toBase: v => v, fromBase: v => v },
    'km/h': { name: 'km/h', toBase: v => v / 3.6, fromBase: v => v * 3.6 },
    'mph': { name: 'mph', toBase: v => v * 0.44704, fromBase: v => v / 0.44704 },
    'Knot': { name: 'kn', toBase: v => v * 0.514444, fromBase: v => v / 0.514444 },
  },
};

export function UnitConverter() {
  const [category, setCategory] = useState('Length');
  const [from, setFrom] = useState('Metre');
  const [to, setTo] = useState('Foot');
  const [value, setValue] = useState(1);

  const units = UNITS[category];
  const fromUnit = units[from] ?? Object.values(units)[0];
  const toUnit = units[to] ?? Object.values(units)[1];
  const result = toUnit.fromBase(fromUnit.toBase(value));

  return (
    <Panel title="Unit converter" hint="Conversions run through SI base units, so any pair in a category works.">
      <Row>
        <Field label="Category">
          <select value={category} onChange={e => { const c = e.target.value; setCategory(c); const keys = Object.keys(UNITS[c]); setFrom(keys[0]); setTo(keys[1] ?? keys[0]); }}>
            {Object.keys(UNITS).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Value">
          <input type="number" value={value} onChange={e => setValue(+e.target.value)} />
        </Field>
      </Row>
      <div className="tool-grid-2">
        <Field label="From">
          <select value={from} onChange={e => setFrom(e.target.value)}>{Object.keys(units).map(u => <option key={u} value={u}>{u}</option>)}</select>
        </Field>
        <Field label="To">
          <select value={to} onChange={e => setTo(e.target.value)}>{Object.keys(units).map(u => <option key={u} value={u}>{u}</option>)}</select>
        </Field>
      </div>
      <Result value={`${Math.round(result * 1e6) / 1e6} ${toUnit.name}`} label={`${value} ${fromUnit.name} equals`} />
    </Panel>
  );
}

/* ------------------------------------------------------------- encoders */
export function Base64Encoder() {
  const [input, setInput] = useState('GG-Lounge');
  const mode = useMemo(() => 'base64', []);
  const [direction, setDirection] = useState<'encode' | 'decode'>('encode');
  const [urlMode, setUrlMode] = useState(false);

  const output = useMemo(() => {
    try {
      if (urlMode) return direction === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input);
      if (direction === 'encode') return btoa(unescape(encodeURIComponent(input)));
      return decodeURIComponent(escape(atob(input)));
    } catch (e) {
      return `Error: ${(e as Error).message}`;
    }
  }, [input, direction, urlMode]);

  return (
    <Panel title="Base64 & URL encoder" hint={mode === 'base64' ? 'Encodes text safely, including emoji and accents.' : ''}>
      <Row>
        <div className="tool-chips">
          <button type="button" className={`tool-chip ${direction === 'encode' ? 'active' : ''}`} onClick={() => setDirection('encode')}>Encode</button>
          <button type="button" className={`tool-chip ${direction === 'decode' ? 'active' : ''}`} onClick={() => setDirection('decode')}>Decode</button>
          <button type="button" className={`tool-chip ${urlMode ? 'active' : ''}`} onClick={() => setUrlMode(v => !v)}>URL mode</button>
        </div>
      </Row>
      <Field label={direction === 'encode' ? 'Plain text' : 'Encoded text'}>
        <textarea className="tool-textarea short" value={input} onChange={e => setInput(e.target.value)} />
      </Field>
      <Field label={direction === 'encode' ? 'Encoded output' : 'Decoded output'}>
        <textarea className="tool-textarea short mono" value={output} readOnly />
      </Field>
      <Row><CopyButton text={output} /></Row>
    </Panel>
  );
}

/* ------------------------------------------------------------- text case */
const CASE_FNS: Record<string, (s: string) => string> = {
  'UPPERCASE': s => s.toUpperCase(),
  'lowercase': s => s.toLowerCase(),
  'Title Case': s => s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()),
  'Sentence case': s => s.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, c => c.toUpperCase()),
  'camelCase': s => s.replace(/(?:^\w|[A-Z]|\b\w)/g, (w, i) => i === 0 ? w.toLowerCase() : w.toUpperCase()).replace(/\s+/g, ''),
  'snake_case': s => s.trim().toLowerCase().replace(/\s+/g, '_'),
  'kebab-case': s => s.trim().toLowerCase().replace(/\s+/g, '-'),
  'CONSTANT_CASE': s => s.trim().toUpperCase().replace(/\s+/g, '_'),
  'Reverse': s => [...s].reverse().join(''),
};

export function TextCaseConverter() {
  const [text, setText] = useStoredState('case-text', 'the lounge is open');
  return (
    <Panel title="Text case converter" hint="Every common casing convention, computed live.">
      <Field label="Your text">
        <textarea className="tool-textarea short" value={text} onChange={e => setText(e.target.value)} />
      </Field>
      <div className="case-grid">
        {Object.entries(CASE_FNS).map(([label, fn]) => (
          <div key={label} className="case-card">
            <span>{label}</span>
            <code>{fn(text)}</code>
            <CopyButton text={fn(text)} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------- json formatter */
export function JsonFormatter() {
  const [input, setInput] = useStoredState('json-input', '{"name":"GG-Lounge","games":144,"tools":18}');
  const [indent, setIndent] = useState(2);

  const parsed = useMemo(() => {
    try {
      const value = JSON.parse(input);
      return { ok: true as const, pretty: JSON.stringify(value, null, indent), minified: JSON.stringify(value) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [input, indent]);

  return (
    <Panel title="JSON formatter" hint="Formats, validates and minifies JSON. Nothing leaves your browser.">
      <Field label="Input">
        <textarea className="tool-textarea mono" value={input} onChange={e => setInput(e.target.value)} spellCheck={false} />
      </Field>
      <Row>
        <Field label="Indent">
          <select value={indent} onChange={e => setIndent(+e.target.value)}>
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
            <option value={0}>Tab</option>
          </select>
        </Field>
        <CopyButton text={parsed.ok ? parsed.pretty : ''} />
      </Row>
      {parsed.ok ? (
        <>
          <Field label="Formatted">
            <textarea className="tool-textarea mono" value={parsed.pretty} readOnly />
          </Field>
          <Field label="Minified">
            <textarea className="tool-textarea mono short" value={parsed.minified} readOnly />
          </Field>
        </>
      ) : (
        <p className="tool-error">Invalid JSON — {parsed.error}</p>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------- hash generator */
export function HashGenerator() {
  const [input, setInput] = useState('GG-Lounge');
  const [hashes, setHashes] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const algorithms = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
      const out: Record<string, string> = {};
      for (const algorithm of algorithms) {
        try {
          const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(input));
          out[algorithm] = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
        } catch { out[algorithm] = 'unavailable'; }
      }
      if (!cancelled) setHashes(out);
    })();
    return () => { cancelled = true; };
  }, [input]);

  return (
    <Panel title="Hash generator" hint="Computed with the browser's Web Crypto API — no server round trip.">
      <Field label="Text to hash">
        <textarea className="tool-textarea short" value={input} onChange={e => setInput(e.target.value)} />
      </Field>
      {Object.entries(hashes).map(([algorithm, value]) => (
        <div key={algorithm} className="hash-row">
          <span>{algorithm}</span>
          <code>{value}</code>
          <CopyButton text={value} />
        </div>
      ))}
      {!Object.keys(hashes).length && <p className="tool-hint">Hashing…</p>}
      <p className="tool-hint">Hashes are one-way: they verify content, they cannot be reversed.</p>
    </Panel>
  );
}

/* ----------------------------------------------------------- colour picker */
export function ColourPicker() {
  const [hex, setHex] = useState('#d7f34a');

  const rgb = useMemo(() => {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return null;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }, [hex]);

  const hsl = useMemo(() => {
    if (!rgb) return null;
    const { r, g, b } = rgb;
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) return { h: 0, s: 0, l: Math.round(l * 100) };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    return { h: Math.round(((h * 60) + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }, [rgb]);

  const luminance = useMemo(() => {
    if (!rgb) return 0;
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }, [rgb]);
  const readableInk = luminance > 0.35 ? '#0b0d12' : '#ffffff';

  return (
    <Panel title="Colour picker" hint="Pick a colour and copy it in the format you need, with contrast guidance.">
      <div className="colour-preview" style={{ background: rgb ? hex : 'transparent', color: readableInk }}>
        <span>GG-Lounge</span>
        <small>{rgb ? hex.toUpperCase() : 'Invalid colour'}</small>
      </div>
      <Row>
        <Field label="Colour">
          <input type="color" value={rgb ? hex : '#000000'} onChange={e => setHex(e.target.value)} />
        </Field>
        <Field label="Hex">
          <input value={hex} onChange={e => setHex(e.target.value)} spellCheck={false} />
        </Field>
      </Row>
      {rgb && (
        <>
          <div className="swatch-row">
            {[0.2, 0.4, 0.6, 0.8, 1.2].map(factor => {
              const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
              const shade = `#${[clamp(rgb.r * factor), clamp(rgb.g * factor), clamp(rgb.b * factor)]
                .map(v => v.toString(16).padStart(2, '0')).join('')}`;
              return <button key={factor} type="button" className="swatch" style={{ background: shade }} title={shade} onClick={() => setHex(shade)}>{shade}</button>;
            })}
          </div>
          <Result value={`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`} label="CSS rgb" />
          <Result value={hsl ? `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` : '—'} label="CSS hsl" />
          <Result value={readableInk === '#0b0d12' ? 'Use dark text on this colour' : 'Use light text on this colour'} label="Contrast" />
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------- word counter */
export function WordCounter() {
  const [text, setText] = useStoredState('wordcount-text', '');
  const stats = useMemo(() => {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const characters = text.length;
    const noSpaces = text.replace(/\s/g, '').length;
    const sentences = (text.match(/[^.!?]+[.!?]+/g) || []).length;
    const paragraphs = text.split(/\n{2,}/).filter(p => p.trim()).length;
    const minutes = words / 200;
    return { words, characters, noSpaces, sentences, paragraphs, minutes };
  }, [text]);

  return (
    <Panel title="Word counter" hint="Live counts as you type, with an estimated reading time.">
      <textarea className="tool-textarea" value={text} onChange={e => setText(e.target.value)} placeholder="Paste or type your text…" />
      <div className="stat-grid">
        <Result value={String(stats.words)} label="Words" />
        <Result value={String(stats.characters)} label="Characters" />
        <Result value={String(stats.noSpaces)} label="No spaces" />
        <Result value={String(stats.sentences)} label="Sentences" />
        <Result value={String(stats.paragraphs)} label="Paragraphs" />
        <Result value={stats.minutes < 1 ? '<1 min' : `${Math.ceil(stats.minutes)} min`} label="Reading time" />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------- qr generator */
export function QrCodeGenerator() {
  const [text, setText] = useState('https://gg-lounge.vercel.app');
  const [size, setSize] = useState(256);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        // Browser build only — it has no Node dependencies.
        const QRCode = (await import('qrcode/lib/browser')).default as typeof import('qrcode');
        await QRCode.toCanvas(canvas, text || ' ', {
          width: size,
          margin: 2,
          color: { dark: '#0b0d12', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
        if (!cancelled) setError('');
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Could not generate this code.');
      }
    })();
    return () => { cancelled = true; };
  }, [text, size]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'gg-lounge-qr.png';
    link.click();
  };

  return (
    <Panel title="QR code generator" hint="Generated offline in your browser. Scan it to open whatever you encode.">
      <Field label="Text or URL">
        <textarea className="tool-textarea short" value={text} onChange={e => setText(e.target.value)} />
      </Field>
      <label className="tool-range">
        <span>Size <b>{size}px</b></span>
        <input type="range" min={128} max={512} step={32} value={size} onChange={e => setSize(+e.target.value)} />
      </label>
      <div className="qr-frame">
        <canvas ref={canvasRef} aria-label="Generated QR code" />
      </div>
      {error && <p className="tool-error">{error}</p>}
      <Row><Button onClick={download}>Download PNG</Button></Row>
    </Panel>
  );
}
