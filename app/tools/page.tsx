'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calculator, Check, Clock3, Copy, ExternalLink, Hash, Palette, RefreshCw, Shuffle, TimerReset, Type, WandSparkles } from 'lucide-react'

const tools = [
  { id: 'calculator', label: 'Calculator', icon: Calculator, description: 'Fast arithmetic' },
  { id: 'timer', label: 'Focus timer', icon: TimerReset, description: 'Deep work sessions' },
  { id: 'stopwatch', label: 'Stopwatch', icon: Clock3, description: 'Track elapsed time' },
  { id: 'converter', label: 'Converter', icon: Shuffle, description: 'Distance conversion' },
  { id: 'color', label: 'Color lab', icon: Palette, description: 'Pick and copy colors' },
  { id: 'randomizer', label: 'Randomizer', icon: WandSparkles, description: 'Make a quick choice' },
  { id: 'password', label: 'Password forge', icon: Hash, description: 'Generate secure strings' },
  { id: 'text', label: 'Text counter', icon: Type, description: 'Count words and lines' },
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
  const [choice, setChoice] = useState('Click generate')
  const [password, setPassword] = useState('')
  const [text, setText] = useState('')

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

  const converted = useMemo(() => (Number(from || 0) * 0.621371).toFixed(2), [from])
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const lines = text ? text.split(/\n/).length : 0
  function calculate() {
    if (!/^[0-9+\-*/(). %]+$/.test(expression)) return setResult('Only basic arithmetic is supported.')
    try { setResult(String(Function(`"use strict"; return (${expression})`)())) } catch { setResult('Check that expression.') }
  }
  function copyValue(value: string) { void navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1200) }
  function generatePassword() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'; setPassword(Array.from({ length: 18 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')) }

  return <main className="tools-page"><header className="tools-header"><a className="member-back" href="/">← Back to lounge</a><div className="tools-heading"><p className="eyebrow">GG-LOUNGE / TOOL DESK</p><h1>Useful things.<br /><em>Zero friction.</em></h1><p>A practical kit for focus, making, and everyday decisions.</p></div><div className="tools-links"><a href="/member">Member notes <ExternalLink size={14} /></a><a href="/games/youtube/index.html">YouTube <ExternalLink size={14} /></a></div></header><div className="tools-layout"><aside className="tools-nav" aria-label="Tools">{tools.map(({ id, label, icon: Icon, description }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}><Icon size={17} /><span><strong>{label}</strong><small>{description}</small></span></button>)}</aside><section className="tool-workspace">
    {active === 'calculator' && <div className="tool-card"><span className="tool-label">BASIC CALCULATOR</span><h2>Do the math.</h2><input value={expression} onChange={e => setExpression(e.target.value)} onKeyDown={e => e.key === 'Enter' && calculate()} placeholder="12 * (4 + 3)" aria-label="Calculator expression" /><button onClick={calculate}>Calculate</button>{result && <output>{result}</output>}</div>}
    {active === 'timer' && <div className="tool-card"><span className="tool-label">FOCUS TIMER</span><h2>Make a little room.</h2><div className="timer-value">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div><div className="tool-row"><input type="number" min="1" max="120" value={minutes} onChange={e => setMinutes(Math.max(0, Number(e.target.value)))} aria-label="Timer minutes" /><button onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Start'}</button><button className="secondary" onClick={() => { setRunning(false); setMinutes(5); setSeconds(0) }}>Reset</button></div></div>}
    {active === 'stopwatch' && <Stopwatch />}
    {active === 'converter' && <div className="tool-card"><span className="tool-label">DISTANCE CONVERTER</span><h2>Kilometers to miles.</h2><input type="number" value={from} onChange={e => setFrom(e.target.value)} aria-label="Kilometers" /><output>{converted} miles</output></div>}
    {active === 'color' && <div className="tool-card"><span className="tool-label">COLOR LAB</span><h2>Find your signal.</h2><input className="color-picker" type="color" value={color} onChange={e => setColor(e.target.value)} aria-label="Choose color" /><div className="color-swatch" style={{ backgroundColor: color }} /><button onClick={() => copyValue(color)}>{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy {color}</>}</button></div>}
    {active === 'randomizer' && <div className="tool-card"><span className="tool-label">RANDOMIZER</span><h2>Let chance decide.</h2><p className="random-result">{choice}</p><button onClick={() => setChoice(['Play a game', 'Take five', 'Make something', 'Explore a tool'][Math.floor(Math.random() * 4)])}><Shuffle size={16} /> Generate</button></div>}
    {active === 'password' && <div className="tool-card"><span className="tool-label">PASSWORD FORGE</span><h2>Stronger by default.</h2><p className="generated-value">{password || 'Generate a secure string'}</p><div className="tool-row"><button onClick={generatePassword}><RefreshCw size={16} /> Generate</button>{password && <button className="secondary" onClick={() => copyValue(password)}>{copied ? 'Copied' : 'Copy'}</button>}</div></div>}
    {active === 'text' && <div className="tool-card"><span className="tool-label">TEXT COUNTER</span><h2>See the shape of your words.</h2><textarea value={text} onChange={e => setText(e.target.value)} placeholder="Start typing..." aria-label="Text to count" /><div className="stat-row"><strong>{words}<small>words</small></strong><strong>{text.length}<small>characters</small></strong><strong>{lines}<small>lines</small></strong></div></div>}
  </section></div></main>
}

function Stopwatch() {
  const [started, setStarted] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [, refresh] = useState(0)
  useEffect(() => { if (!started) return; const timer = window.setInterval(() => refresh(value => value + 1), 250); return () => window.clearInterval(timer) }, [started])
  const total = started ? Math.floor((Date.now() - started + elapsed) / 1000) : Math.floor(elapsed / 1000)
  return <div className="tool-card"><span className="tool-label">STOPWATCH</span><h2>Keep the split.</h2><div className="timer-value">{String(Math.floor(total / 60)).padStart(2, '0')}:{String(total % 60).padStart(2, '0')}</div><div className="tool-row"><button onClick={() => { if (started) setElapsed(Date.now() - started + elapsed); setStarted(started ? null : Date.now()) }}>{started ? 'Pause' : 'Start'}</button><button className="secondary" onClick={() => { setStarted(null); setElapsed(0) }}>Reset</button></div></div>
}

