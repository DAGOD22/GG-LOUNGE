'use client'
/**
 * Random tools.
 *
 * Every draw here goes through `crypto.getRandomValues`, not `Math.random()`.
 * That matters for the password generator and the name picker: a predictable
 * shuffle is a shuffle somebody can call before you do.
 */
import { useMemo, useState } from 'react'
import { Dices } from 'lucide-react'

import {
  dealIntoTeams, formatDuration, generatePassphrase, generatePassword,
  passwordStrength, pickOne, randomHexColor, rerollSeed, secureRandomInt,
  shuffleList,
} from '@/lib/tools/logic'
import { Button, CopyButton, Field, Output, Select, Stat, TextArea, TextInput } from './ui'

/* ---------------- password ---------------- */

export function PasswordTool() {
  const [length, setLength] = useState('20')
  const [upper, setUpper] = useState(true)
  const [digits, setDigits] = useState(true)
  const [symbols, setSymbols] = useState(true)
  const [passwords, setPasswords] = useState<string[]>(() => [generatePassword(20, { upper: true, digits: true, symbols: true })])

  const generate = () => setPasswords(Array.from({ length: 5 }, () => generatePassword(Number(length) || 20, { upper, digits, symbols })))
  const strength = passwordStrength(passwords[0] ?? '')

  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Length"><TextInput type="number" min={4} max={128} value={length} onChange={setLength} /></Field>
        <Field label="&nbsp;"><Button onClick={generate}>Generate</Button></Field>
        <Field label="&nbsp;"><Button variant="ghost" onClick={() => setPasswords([generatePassphrase(4)])}>Passphrase</Button></Field>
      </div>
      <div className="tool-row">
        <Button variant={upper ? 'primary' : 'ghost'} onClick={() => setUpper(!upper)}>Capitals</Button>
        <Button variant={digits ? 'primary' : 'ghost'} onClick={() => setDigits(!digits)}>Digits</Button>
        <Button variant={symbols ? 'primary' : 'ghost'} onClick={() => setSymbols(!symbols)}>Symbols</Button>
      </div>
      <div className="tool-password-list">
        {passwords.map(password => (
          <div key={password} className="tool-password-row">
            <code>{password}</code>
            <CopyButton value={password} label="" />
          </div>
        ))}
      </div>
      <div className="tool-stats">
        <Stat label="strength" value={strength.verdict} />
        <Stat label="bits" value={strength.bits} />
        <Stat label="offline crack" value={strength.crackSeconds > 3e7 ? `${Math.round(strength.crackSeconds / 3.15e7).toLocaleString()} years` : formatDuration(strength.crackSeconds)} />
      </div>
      <p className="tool-hint">
        Ambiguous characters (l, I, 1, O, 0) are left out on purpose, so a password can be read aloud without
        the usual argument. Generated in this tab and never sent anywhere.
      </p>
    </div>
  )
}

/* ---------------- dice ---------------- */

export function DiceTool() {
  const [count, setCount] = useState('2')
  const [sides, setSides] = useState('6')
  const [rolls, setRolls] = useState<number[]>([])
  const roll = () => {
    const n = Math.max(1, Math.min(50, Number(count) || 1))
    const s = Math.max(2, Math.min(1000, Number(sides) || 6))
    setRolls(Array.from({ length: n }, () => secureRandomInt(s) + 1))
  }
  const total = rolls.reduce((sum, value) => sum + value, 0)
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Dice"><TextInput type="number" min={1} max={50} value={count} onChange={setCount} /></Field>
        <Field label="Sides"><TextInput type="number" min={2} max={1000} value={sides} onChange={setSides} /></Field>
        <Field label="&nbsp;"><Button onClick={roll}><Dices size={14} /> Roll</Button></Field>
      </div>
      <div className="tool-dice">
        {rolls.length === 0 ? <span className="tool-hint">Roll to see the dice.</span> : rolls.map((value, index) => (
          <span key={index} className="tool-die">{value}</span>
        ))}
      </div>
      {rolls.length ? <div className="tool-stats"><Stat label="total" value={total} /><Stat label="highest" value={Math.max(...rolls)} /><Stat label="lowest" value={Math.min(...rolls)} /></div> : null}
      <p className="tool-hint">Each die is independent, so a 6 on the first does not make the next one less likely.</p>
    </div>
  )
}

export function CoinTool() {
  const [flips, setFlips] = useState<('H' | 'T')[]>([])
  const heads = flips.filter(flip => flip === 'H').length
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Button onClick={() => setFlips(([secureRandomInt(2) === 0 ? 'H' : 'T', ...flips] as ('H' | 'T')[]).slice(0, 100))}>Flip</Button>
        <Button variant="ghost" onClick={() => setFlips([])}>Reset</Button>
      </div>
      <div className={`tool-coin ${flips[0] === 'H' ? 'heads' : flips[0] === 'T' ? 'tails' : ''}`}>{flips[0] === 'H' ? 'Heads' : flips[0] === 'T' ? 'Tails' : '—'}</div>
      <div className="tool-stats">
        <Stat label="flips" value={flips.length} />
        <Stat label="heads" value={heads} />
        <Stat label="tails" value={flips.length - heads} />
      </div>
      <p className="tool-hint">A run of ten heads is unlikely in advance and perfectly normal after the fact. That is how randomness looks.</p>
    </div>
  )
}

/* ---------------- random number ---------------- */

export function RandomNumberTool() {
  const [min, setMin] = useState('1')
  const [max, setMax] = useState('100')
  const [value, setValue] = useState<number | null>(null)
  const low = Math.min(Number(min) || 0, Number(max) || 1)
  const high = Math.max(Number(min) || 0, Number(max) || 1)
  const draw = () => setValue(low + secureRandomInt(Math.max(1, high - low + 1)))
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Minimum"><TextInput type="number" value={min} onChange={setMin} /></Field>
        <Field label="Maximum"><TextInput type="number" value={max} onChange={setMax} /></Field>
        <Field label="&nbsp;"><Button onClick={draw}>Pick a number</Button></Field>
      </div>
      <div className="tool-countdown"><span className="tool-countdown-value">{value ?? '—'}</span><span className="tool-countdown-label">{low} to {high}</span></div>
      <p className="tool-hint">Both ends are included, and rejection sampling keeps the spread flat — a modulo of a random number would not be.</p>
    </div>
  )
}

/* ---------------- name picker ---------------- */

export function WheelTool() {
  const [text, setText] = useState('Ada\nGrace\nAlan\nKatherine')
  const [winner, setWinner] = useState<string | null>(null)
  const names = useMemo(() => text.split('\n').map(name => name.trim()).filter(Boolean), [text])
  return (
    <div className="tool-panel">
      <Field label="Names, one per line" hint={`${names.length} in the hat`}><TextArea value={text} onChange={setText} rows={8} /></Field>
      <div className="tool-row">
        <Button onClick={() => setWinner(pickOne(names))} disabled={!names.length}>Pick a name</Button>
        <Button variant="ghost" onClick={() => setWinner(null)}>Reset</Button>
      </div>
      <div className={`tool-countdown ${winner ? 'is-winner' : ''}`}>
        <span className="tool-countdown-value">{winner ?? '—'}</span>
        <span className="tool-countdown-label">{winner ? 'picked' : 'waiting'}</span>
      </div>
      <p className="tool-hint">Every pick is equally likely; removing the previous winner is left to you, in case you need someone twice.</p>
    </div>
  )
}

/* ---------------- shuffle / teams ---------------- */

export function ShuffleTool() {
  const [text, setText] = useState('one\ntwo\nthree\nfour\nfive')
  const [teamCount, setTeamCount] = useState('2')
  const [mode, setMode] = useState<'shuffle' | 'teams'>('shuffle')
  const [result, setResult] = useState<string[] | string[][] | null>(null)
  const items = useMemo(() => text.split('\n').map(item => item.trim()).filter(Boolean), [text])

  const run = () => {
    if (mode === 'shuffle') setResult(shuffleList(items))
    else setResult(dealIntoTeams(items, Math.max(1, Math.min(10, Number(teamCount) || 2))))
  }

  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Mode">
          <Select value={mode} onChange={setMode} label="Mode" options={[{ value: 'shuffle', label: 'Shuffle the order' }, { value: 'teams', label: 'Deal into teams' }]} />
        </Field>
        {mode === 'teams' ? <Field label="Teams"><TextInput type="number" min={1} max={10} value={teamCount} onChange={setTeamCount} /></Field> : null}
        <Field label="&nbsp;"><Button onClick={run} disabled={!items.length}>Shuffle</Button></Field>
      </div>
      <Field label="Items, one per line"><TextArea value={text} onChange={setText} rows={7} /></Field>
      {result ? (
        Array.isArray(result[0]) ? (
          <div className="tool-teams">
            {(result as string[][]).map((team, index) => (
              <div key={index} className="tool-team">
                <span className="tool-label">Team {index + 1}</span>
                <ul>{team.map(member => <li key={member}>{member}</li>)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <Output label="Shuffled" value={(result as string[]).join('\n')} multiline />
        )
      ) : null}
      <p className="tool-hint">Shuffling is Fisher–Yates with a secure random source, so every order is equally likely.</p>
    </div>
  )
}

/* ---------------- random colour ---------------- */

export function RandomColourTool() {
  const [colours, setColours] = useState<string[]>(() => [randomHexColor()])
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Button onClick={() => setColours([randomHexColor(), ...colours].slice(0, 8))}>Another colour</Button>
        <CopyButton label="Copy all" value={colours.join('\n')} />
      </div>
      <div className="tool-palette">
        {colours.map(colour => (
          <div key={colour} className="tool-palette-chip" style={{ background: colour }}><span>{colour}</span></div>
        ))}
      </div>
      <Output label="Codes" value={colours.join('\n')} multiline />
    </div>
  )
}

/* ---------------- quote / name generator ---------------- */

const QUOTES = [
  'The best way to get started is to quit talking and begin doing.',
  'Nothing worth having comes from a comfortable chair.',
  'Simplicity is a feature, and it is the hardest one to keep.',
  'A deadline is the only design tool that never lies.',
  'If it looks wrong on a phone, it is wrong.',
  'You do not need permission to build the thing.',
  'Ship it, then make it good. Not the other way round.',
]

export function QuoteTool() {
  const [quote, setQuote] = useState(QUOTES[0])
  return (
    <div className="tool-panel">
      <div className="tool-quote">“{quote}”</div>
      <div className="tool-row">
        <Button onClick={() => setQuote(pickOne(QUOTES) ?? QUOTES[0])}>Another</Button>
        <CopyButton label="Copy quote" value={`“${quote}”`} />
      </div>
      <p className="tool-hint">Short by design: a quote that needs a paragraph will not fit on a slide.</p>
    </div>
  )
}

const PREFIX = ['ka', 'vor', 'thal', 'mon', 'ryn', 'dra', 'sol', 'emi', 'nor', 'zul']
const SUFFIX = ['dor', 'lyn', 'mar', 'rin', 'thi', 'vos', 'nea', 'gar', 'sil', 'wyn']

export function NameGeneratorTool() {
  const [names, setNames] = useState<string[]>([])
  const generate = () => {
    const made = new Set<string>()
    while (made.size < 6) made.add(`${pickOne(PREFIX)}${pickOne(SUFFIX)}`)
    setNames([...made].map(name => name.charAt(0).toUpperCase() + name.slice(1)))
  }
  return (
    <div className="tool-panel">
      <Button onClick={generate}>Generate six names</Button>
      <div className="tool-name-grid">
        {names.map(name => (
          <div key={name} className="tool-name-card">
            <span>{name}</span>
            <CopyButton value={name} label="" />
          </div>
        ))}
      </div>
      <p className="tool-hint">Two syllables from fixed pieces, which is enough to sound like a name and not enough to sound like a product.</p>
    </div>
  )
}

export { rerollSeed }
