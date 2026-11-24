'use client'
/**
 * Time tools.
 *
 * Every clock here is driven by a single interval that starts when the panel
 * mounts and stops when it unmounts. Reading `Date.now()` during render instead
 * would make the output depend on when React happened to re-render, which is
 * how stopwatches end up drifting by a second.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Timer } from 'lucide-react'

import {
  addToDate, ageBetween, daysBetween, formatDuration, isoWeek, isLeapYear,
} from '@/lib/tools/logic'
import { Button, CopyButton, Field, Output, Select, Stat, TextInput } from './ui'

const pad = (value: number) => String(value).padStart(2, '0')

function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDateInput(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  // Constructed from parts, not `new Date(string)`, which parses as UTC and can
  // land on the previous day in Adelaide.
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** A one-second tick, paused when the tab is hidden to save battery. */
function useClock(active = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [active])
  return now
}

/* ---------------- countdown to a date ---------------- */

export function CountdownTool() {
  const [target, setTarget] = useState(() => toDateInput(new Date(Date.now() + 30 * 86400000)))
  const [label, setLabel] = useState('Exam day')
  const now = useClock()
  const when = parseDateInput(target)
  const remaining = when ? when.getTime() - now : null

  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Label"><TextInput value={label} onChange={setLabel} /></Field>
        <Field label="Date"><TextInput type="date" value={target} onChange={setTarget} /></Field>
      </div>
      {remaining === null ? (
        <div className="tool-error">Pick a date.</div>
      ) : (
        <>
          <div className="tool-countdown">
            <span className="tool-countdown-value">{formatDuration(Math.abs(remaining) / 1000)}</span>
            <span className="tool-countdown-label">{remaining >= 0 ? `until ${label}` : `${label} was this long ago`}</span>
          </div>
          <div className="tool-stats">
            <Stat label="days" value={Math.floor(Math.abs(remaining) / 86400000)} />
            <Stat label="hours" value={Math.floor((Math.abs(remaining) % 86400000) / 3600000)} />
            <Stat label="weeks" value={(Math.abs(remaining) / 604800000).toFixed(1)} />
          </div>
        </>
      )}
      <p className="tool-hint">Counts to the start of that day in your own time zone.</p>
    </div>
  )
}

/* ---------------- age ---------------- */

export function AgeTool() {
  const [birth, setBirth] = useState('2007-04-12')
  const now = useClock()
  const date = parseDateInput(birth)
  const result = date ? ageBetween(date, new Date(now)) : null
  // Deliberately not memoised: `now` ticks once a second, so a memo keyed on it
  // would recompute every tick anyway and just add a dependency to get wrong.
  const nextBirthday = (() => {
    if (!date) return null
    const thisYear = new Date(new Date(now).getFullYear(), date.getMonth(), date.getDate())
    return thisYear.getTime() < now ? new Date(new Date(now).getFullYear() + 1, date.getMonth(), date.getDate()) : thisYear
  })()

  return (
    <div className="tool-panel">
      <Field label="Date of birth"><TextInput type="date" value={birth} onChange={setBirth} /></Field>
      {result ? (
        <>
          <div className="tool-stats">
            <Stat label="years" value={result.years} />
            <Stat label="months" value={result.months} />
            <Stat label="days" value={result.days} />
            <Stat label="total days" value={result.totalDays.toLocaleString()} />
          </div>
          <p className="tool-hint">
            {nextBirthday ? `Next birthday: ${nextBirthday.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.` : null}
          </p>
        </>
      ) : <div className="tool-error">Pick a valid date.</div>}
    </div>
  )
}

/* ---------------- date difference ---------------- */

export function DateDiffTool() {
  const [from, setFrom] = useState(() => toDateInput(new Date()))
  const [to, setTo] = useState(() => toDateInput(new Date(Date.now() + 14 * 86400000)))
  const start = parseDateInput(from)
  const end = parseDateInput(to)
  const result = start && end ? daysBetween(start, end) : null
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="From"><TextInput type="date" value={from} onChange={setFrom} /></Field>
        <Field label="To"><TextInput type="date" value={to} onChange={setTo} /></Field>
      </div>
      {result ? (
        <div className="tool-stats">
          <Stat label="days" value={result.days} />
          <Stat label="weeks" value={result.weeks.toFixed(2)} />
          <Stat label="weekdays" value={result.weekdays} />
        </div>
      ) : <div className="tool-error">Pick two dates.</div>}
      <p className="tool-hint">Weekdays exclude Saturdays and Sundays but not public holidays.</p>
    </div>
  )
}

/* ---------------- add days ---------------- */

export function AddDaysTool() {
  const [date, setDate] = useState(() => toDateInput(new Date()))
  const [amount, setAmount] = useState('30')
  const [unit, setUnit] = useState<'days' | 'weeks' | 'months' | 'years'>('days')
  const start = parseDateInput(date)
  const result = start ? addToDate(start, Number(amount) || 0, unit) : null
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Start date"><TextInput type="date" value={date} onChange={setDate} /></Field>
        <Field label="Add (negative to subtract)"><TextInput type="number" value={amount} onChange={setAmount} /></Field>
        <Field label="Unit"><Select value={unit} onChange={setUnit} label="Unit" options={[{ value: 'days', label: 'Days' }, { value: 'weeks', label: 'Weeks' }, { value: 'months', label: 'Months' }, { value: 'years', label: 'Years' }]} /></Field>
      </div>
      <Output label="Result" value={result ? result.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
      <p className="tool-hint">31 January plus one month lands on 29 February in a leap year, not 3 March.</p>
    </div>
  )
}

/* ---------------- week number / leap year ---------------- */

export function WeekNumberTool() {
  const [date, setDate] = useState(() => toDateInput(new Date()))
  const parsed = parseDateInput(date)
  const info = parsed ? isoWeek(parsed) : null
  return (
    <div className="tool-panel">
      <Field label="Date"><TextInput type="date" value={date} onChange={setDate} /></Field>
      <div className="tool-stats">
        <Stat label="ISO week" value={info ? `W${pad(info.week)}` : '—'} />
        <Stat label="ISO year" value={info?.year ?? '—'} />
        <Stat label="day of year" value={info?.dayOfYear ?? '—'} />
        <Stat label="leap year" value={parsed ? (isLeapYear(parsed.getFullYear()) ? 'yes' : 'no') : '—'} />
      </div>
      <p className="tool-hint">ISO weeks start on Monday, and the first week is the one containing the first Thursday — which is why 1 January can belong to the previous year.</p>
    </div>
  )
}

export function LeapYearTool() {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const value = Number(year)
  const next = useMemo(() => {
    if (!Number.isInteger(value)) return []
    const out: number[] = []
    let candidate = value + 1
    while (out.length < 4 && candidate < value + 40) {
      if (isLeapYear(candidate)) out.push(candidate)
      candidate++
    }
    return out
  }, [value])

  return (
    <div className="tool-panel">
      <Field label="Year"><TextInput type="number" value={year} onChange={setYear} /></Field>
      <div className={`tool-verdict ${isLeapYear(value) ? 'good' : 'bad'}`}>{isLeapYear(value) ? `${value} has 366 days.` : `${value} has 365 days.`}</div>
      <p className="tool-hint">Next leap years: {next.join(', ') || '—'}. A century year is only a leap year if it divides by 400, so 1900 was not and 2000 was.</p>
    </div>
  )
}

/* ---------------- timestamp / timezone ---------------- */

export function TimestampTool() {
  const [seconds, setSeconds] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [iso, setIso] = useState(() => new Date().toISOString())
  const fromSeconds = Number(seconds) * 1000
  const dateFromSeconds = Number.isFinite(fromSeconds) ? new Date(fromSeconds) : null
  const parsedIso = new Date(iso)
  return (
    <div className="tool-panel">
      <div className="tool-grid-2">
        <div className="tool-column">
          <Field label="Unix seconds"><TextInput type="number" value={seconds} onChange={setSeconds} /></Field>
          <Output label="As a date" value={dateFromSeconds && Number.isFinite(dateFromSeconds.getTime()) ? dateFromSeconds.toLocaleString() : 'not a timestamp'} />
          <Output label="ISO 8601" value={dateFromSeconds && Number.isFinite(dateFromSeconds.getTime()) ? dateFromSeconds.toISOString() : '—'} />
        </div>
        <div className="tool-column">
          <Field label="Date string or ISO"><TextInput value={iso} onChange={setIso} placeholder="2026-11-15T00:00:00Z" /></Field>
          <Output label="Unix seconds" value={Number.isFinite(parsedIso.getTime()) ? String(Math.floor(parsedIso.getTime() / 1000)) : 'cannot read that date'} />
        </div>
      </div>
      <p className="tool-hint">Unix time counts seconds since 1 January 1970 UTC and does not know about leap seconds or time zones.</p>
    </div>
  )
}

const CITIES: { zone: string; label: string }[] = [
  { zone: 'Australia/Adelaide', label: 'Adelaide' },
  { zone: 'Australia/Sydney', label: 'Sydney' },
  { zone: 'Asia/Tokyo', label: 'Tokyo' },
  { zone: 'Europe/London', label: 'London' },
  { zone: 'America/New_York', label: 'New York' },
  { zone: 'America/Los_Angeles', label: 'Los Angeles' },
  { zone: 'UTC', label: 'UTC' },
]

export function WorldClockTool() {
  const now = useClock()
  return (
    <div className="tool-panel">
      <div className="tool-clock-list">
        {CITIES.map(city => (
          <div key={city.zone} className="tool-clock-row">
            <span className="tool-clock-city">{city.label}</span>
            <span className="tool-clock-time">
              {new Date(now).toLocaleTimeString(undefined, { timeZone: city.zone, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="tool-clock-date">
              {new Date(now).toLocaleDateString(undefined, { timeZone: city.zone, weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
        ))}
      </div>
      <p className="tool-hint">Times come from your machine’s own time zone database, so offsets are correct for the current daylight-saving rules.</p>
    </div>
  )
}

/* ---------------- stopwatch ---------------- */

export function StopwatchTool() {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [laps, setLaps] = useState<number[]>([])
  const startedAt = useRef<number>(0)
  const base = useRef<number>(0)

  useEffect(() => {
    if (!running) return
    startedAt.current = Date.now()
    // 50 ms so the hundredths look alive; the displayed value is derived from
    // real timestamps, not from counting ticks, so it cannot drift.
    const interval = setInterval(() => setElapsed(base.current + (Date.now() - startedAt.current)), 50)
    return () => clearInterval(interval)
  }, [running])

  const toggle = () => {
    if (running) {
      base.current = elapsed
      setRunning(false)
    } else {
      setRunning(true)
    }
  }
  const reset = () => { setRunning(false); setElapsed(0); base.current = 0; setLaps([]) }
  const format = (ms: number) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}.${pad(Math.floor((ms % 1000) / 10))}`

  return (
    <div className="tool-panel">
      <div className="tool-countdown">
        <span className="tool-countdown-value is-mono">{format(elapsed)}</span>
        <span className="tool-countdown-label">stopwatch</span>
      </div>
      <div className="tool-row">
        <Button onClick={toggle}>{running ? <Pause size={14} /> : <Play size={14} />}{running ? 'Stop' : 'Start'}</Button>
        <Button variant="ghost" onClick={() => setLaps([elapsed, ...laps])} disabled={!running}>Lap</Button>
        <Button variant="ghost" onClick={reset}><RotateCcw size={14} /> Reset</Button>
      </div>
      {laps.length ? (
        <div className="tool-laps">
          {laps.map((lap, index) => (
            <div key={index} className="tool-lap">
              <span>Lap {laps.length - index}</span>
              <span className="is-mono">{format(lap)}</span>
              <span className="tool-hint">{index + 1 < laps.length ? `+${format(lap - laps[index + 1])}` : ''}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ---------------- timer ---------------- */

export function TimerTool({ withBeep = false }: { withBeep?: boolean }) {
  const [minutes, setMinutes] = useState('5')
  const [remaining, setRemaining] = useState(0)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const endAt = useRef<number>(0)
  const audioRef = useRef<AudioContext | null>(null)

  // Declared before the effect that calls it: a `const` arrow used inside a
  // callback that runs later is fine at runtime, but `no-use-before-declare`
  // is right that reading it in source order is the safer habit.
  const beep = () => {
    try {
      // Created on demand: browsers refuse an AudioContext that was opened
      // before any user gesture, and the timer button is that gesture.
      audioRef.current ??= new AudioContext()
      const context = audioRef.current
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.value = 880
      gain.gain.value = 0.15
      oscillator.connect(gain).connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + 0.6)
    } catch {
      // Audio blocked: the visual state still shows the timer ended.
    }
  }

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => {
      const left = Math.max(0, endAt.current - Date.now())
      setRemaining(left)
      if (left === 0) {
        setRunning(false)
        setFinished(true)
        if (withBeep) beep()
      }
    }, 200)
    return () => clearInterval(interval)
  })

  useEffect(() => () => { audioRef.current?.close().catch(() => {}) }, [])

  const start = () => {
    setRemaining(Number(minutes) * 60000)
    endAt.current = Date.now() + Number(minutes) * 60000
    setFinished(false)
    setRunning(true)
  }

  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Minutes"><TextInput type="number" min={1} value={minutes} onChange={setMinutes} /></Field>
        <Field label="&nbsp;"><Button onClick={start}><Timer size={14} /> Start {minutes || 0} min</Button></Field>
      </div>
      <div className="tool-countdown">
        <span className="tool-countdown-value is-mono">{formatDuration(Math.ceil((running ? remaining : (finished ? 0 : Number(minutes) * 60000)) / 1000))}</span>
        <span className="tool-countdown-label">{finished ? 'time is up' : running ? 'remaining' : 'ready'}</span>
      </div>
      <div className="tool-row">
        <Button variant="ghost" onClick={() => { setRunning(false); setFinished(false); setRemaining(0) }}>Cancel</Button>
        <CopyButton label="Copy length" value={`${minutes} minutes`} />
      </div>
      <p className="tool-hint">The countdown is computed from an end timestamp, so it stays right even if the tab is backgrounded and the interval is throttled.</p>
    </div>
  )
}

/* ---------------- pomodoro ---------------- */

export function PomodoroTool() {
  const [phase, setPhase] = useState<'work' | 'break'>('work')
  const [running, setRunning] = useState(false)
  const [left, setLeft] = useState(25 * 60000)
  const [done, setDone] = useState(0)
  const endAt = useRef<number>(0)

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, endAt.current - Date.now())
      setLeft(remaining)
      if (remaining === 0) {
        setRunning(false)
        if (phase === 'work') {
          setDone(count => count + 1)
          setPhase('break')
          setLeft(5 * 60000)
        } else {
          setPhase('work')
          setLeft(25 * 60000)
        }
      }
    }, 250)
    return () => clearInterval(interval)
  }, [running, phase])

  const toggle = () => {
    if (running) { setRunning(false); return }
    endAt.current = Date.now() + left
    setRunning(true)
  }

  return (
    <div className="tool-panel">
      <div className="tool-countdown">
        <span className="tool-countdown-value is-mono">{formatDuration(Math.ceil(left / 1000))}</span>
        <span className="tool-countdown-label">{phase === 'work' ? 'focus block' : 'break'} · {done} finished</span>
      </div>
      <div className="tool-row">
        <Button onClick={toggle}>{running ? <Pause size={14} /> : <Play size={14} />}{running ? 'Pause' : 'Start'}</Button>
        <Button variant="ghost" onClick={() => { setRunning(false); setPhase(phase === 'work' ? 'break' : 'work'); setLeft((phase === 'work' ? 5 : 25) * 60000) }}>Switch to {phase === 'work' ? 'break' : 'focus'}</Button>
        <Button variant="ghost" onClick={() => { setRunning(false); setPhase('work'); setLeft(25 * 60000); setDone(0) }}>Reset</Button>
      </div>
      <p className="tool-hint">25 minutes of focus, 5 minutes off. The classic ratio, and the reason it works is that it makes starting feel small.</p>
    </div>
  )
}

/* ---------------- video trim planner ---------------- */

export function TrimPlannerTool() {
  const [startH, setStartH] = useState('0')
  const [startM, setStartM] = useState('12')
  const [startS, setStartS] = useState('30')
  const [endH, setEndH] = useState('0')
  const [endM, setEndM] = useState('18')
  const [endS, setEndS] = useState('5')

  const toSeconds = (h: string, m: string, s: string) => Number(h) * 3600 + Number(m) * 60 + Number(s)
  const start = toSeconds(startH, startM, startS)
  const end = toSeconds(endH, endM, endS)
  const length = end - start
  const stamp = (seconds: number) => `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`

  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Start h"><TextInput type="number" value={startH} onChange={setStartH} /></Field>
        <Field label="m"><TextInput type="number" value={startM} onChange={setStartM} /></Field>
        <Field label="s"><TextInput type="number" value={startS} onChange={setStartS} /></Field>
      </div>
      <div className="tool-row">
        <Field label="End h"><TextInput type="number" value={endH} onChange={setEndH} /></Field>
        <Field label="m"><TextInput type="number" value={endM} onChange={setEndM} /></Field>
        <Field label="s"><TextInput type="number" value={endS} onChange={setEndS} /></Field>
      </div>
      <div className="tool-stats">
        <Stat label="clip length" value={length >= 0 ? stamp(length) : 'end is before start'} />
        <Stat label="start" value={stamp(start)} />
        <Stat label="end" value={stamp(end)} />
      </div>
      <CopyButton label="Copy duration" value={length >= 0 ? stamp(length) : ''} />
      <p className="tool-hint">Clip length is what most editors want for the out-point. Nothing is uploaded or trimmed here — it is arithmetic before you touch a timeline.</p>
    </div>
  )
}
