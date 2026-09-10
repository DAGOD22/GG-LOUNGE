'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calculator, Clock3, Copy, ExternalLink, Palette, Shuffle, TimerReset } from 'lucide-react'

const tools = [
  { id: 'calculator', label: 'Calculator', icon: Calculator },
  { id: 'timer', label: 'Timer', icon: TimerReset },
  { id: 'stopwatch', label: 'Stopwatch', icon: Clock3 },
  { id: 'converter', label: 'Converter', icon: Shuffle },
  { id: 'color', label: 'Color lab', icon: Palette },
]

export default function ToolsPage() {
  const [active, setActive] = useState('calculator')
  const [expression, setExpression] = useState('')
  const [result, setResult] = useState('')
  const [minutes, setMinutes] = useState(5)
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [from, setFrom] = useState('1')
  const [color, setColor] = useState('#d7f34a')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current > 0) return current - 1
        if (minutes > 0) { setMinutes((value) => value - 1); return 59 }
        setRunning(false)
        return 0
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, minutes])

  const converted = useMemo(() => (Number(from) * 0.621371).toFixed(2), [from])
  function calculate() {
    if (!/^[0-9+\-*/(). %]+$/.test(expression)) return setResult('Only basic arithmetic is supported.')
    try { setResult(String(Function(`"use strict"; return (${expression})`)())) } catch { setResult('Check that expression.') }
  }
  function copyColor() { void navigator.clipboard?.writeText(color); setCopied(true); window.setTimeout(() => setCopied(false), 1200) }

  return <main className="tools-page"><header className="tools-header"><a className="member-back" href="/">← Back to lounge</a><div className="tools-heading"><p className="eyebrow">GG-LOUNGE / TOOL DESK</p><h1>Useful things.<br /><em>Zero friction.</em></h1><p>A quiet corner for tools, notes, and the video lounge.</p></div><div className="tools-links"><a href="/member">Member notes <ExternalLink size={14} /></a><a href="/games/youtube/index.html">YouTube <ExternalLink size={14} /></a></div></header><div className="tools-layout"><aside className="tools-nav" aria-label="Tools">{tools.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}><Icon size={17} />{label}</button>)}</aside><section className="tool-workspace">{active === 'calculator' && <div className="tool-card"><span className="tool-label">BASIC CALCULATOR</span><h2>Do the math.</h2><input value={expression} onChange={e => setExpression(e.target.value)} onKeyDown={e => e.key === 'Enter' && calculate()} placeholder="12 * (4 + 3)" aria-label="Calculator expression" /><button onClick={calculate}>Calculate</button>{result && <output>{result}</output>}</div>}{active === 'timer' && <div className="tool-card"><span className="tool-label">FOCUS TIMER</span><h2>Make a little room.</h2><div className="timer-value">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div><div className="tool-row"><input type="number" min="1" max="120" value={minutes} onChange={e => setMinutes(Number(e.target.value))} aria-label="Timer minutes" /><button onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Start'}</button><button className="secondary" onClick={() => { setRunning(false); setMinutes(5); setSeconds(0) }}>Reset</button></div></div>}{active === 'stopwatch' && <Stopwatch />}{active === 'converter' && <div className="tool-card"><span className="tool-label">DISTANCE CONVERTER</span><h2>Kilometers to miles.</h2><input type="number" value={from} onChange={e => setFrom(e.target.value)} aria-label="Kilometers" /><output>{converted} mi</output></div>}{active === 'color' && <div className="tool-card"><span className="tool-label">COLOR LAB</span><h2>Pick your signal.</h2><input className="color-input" type="color" value={color} onChange={e => setColor(e.target.value)} aria-label="Choose color" /><div className="color-swatch" style={{ background: color }} /><button onClick={copyColor}><Copy size={15} />{copied ? 'Copied' : color}</button></div>}<div className="tools-strip"><span>ALSO IN THE DESK</span><strong>Notes are saved to your member account.</strong><a href="/member">Open notes →</a></div></section></div></main>
}

function Stopwatch() {
  const [started, setStarted] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [, refresh] = useState(0)
  useEffect(() => { if (!started) return; const timer = window.setInterval(() => refresh(value => value + 1), 250); return () => window.clearInterval(timer) }, [started])
  const seconds = started ? Math.floor((Date.now() - started + elapsed) / 1000) : Math.floor(elapsed / 1000)
  const formatted = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return <div className="tool-card"><span className="tool-label">STOPWATCH</span><h2>Keep the split.</h2><div className="timer-value">{formatted}</div><div className="tool-row"><button onClick={() => { if (started) setElapsed(Date.now() - started + elapsed); setStarted(started ? null : Date.now()) }}>{started ? 'Pause' : 'Start'}</button><button className="secondary" onClick={() => { setStarted(null); setElapsed(0) }}>Reset</button></div></div>
}
