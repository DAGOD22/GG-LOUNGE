'use client'
/**
 * Number and money tools.
 *
 * The money panels show the working, not just an answer: a repayment figure
 * nobody can check is a figure nobody should trust, and these are the panels
 * most likely to be used for something that matters.
 */
import { useMemo, useState } from 'react'

import {
  bmi, compoundInterest, convertBase, convertUnit, factorsOf, formatNumber,
  gcdLcmList, isPrime, loanPayment, percentChange, percentOf, romanNumeral,
  fromRoman, splitBill, unitOptions, whatPercent, weightedGrade, type GradeItem,
  type UnitGroup,
} from '@/lib/tools/logic'
import { Button, CopyButton, Field, Output, Select, Stat, TextArea, TextInput } from './ui'

/* ---------------- unit converter ---------------- */

const GROUPS: { value: UnitGroup; label: string }[] = [
  { value: 'length', label: 'Length' },
  { value: 'mass', label: 'Mass' },
  { value: 'volume', label: 'Volume' },
  { value: 'speed', label: 'Speed' },
  { value: 'data', label: 'Data' },
  { value: 'temperature', label: 'Temperature' },
]

const TEMPERATURE = ['C', 'F', 'K']

export function UnitConverterTool() {
  const [group, setGroup] = useState<UnitGroup>('length')
  const options = group === 'temperature' ? TEMPERATURE : unitOptions(group)
  const [from, setFrom] = useState(options[0])
  const [to, setTo] = useState(options[1] ?? options[0])
  const [value, setValue] = useState('1')

  // When the group changes the old unit names can be invalid, so fall back to
  // the first two of the new list rather than rendering an empty result.
  const changeGroup = (next: UnitGroup) => {
    const nextOptions = next === 'temperature' ? TEMPERATURE : unitOptions(next)
    setGroup(next)
    setFrom(nextOptions[0])
    setTo(nextOptions[1] ?? nextOptions[0])
  }

  const result = useMemo(() => convertUnit(group, Number(value), from, to), [group, value, from, to])

  return (
    <div className="tool-panel">
      <Field label="Quantity">
        <Select value={group} onChange={changeGroup} label="Quantity" options={GROUPS} />
      </Field>
      <div className="tool-row">
        <Field label="Value"><TextInput value={value} onChange={setValue} placeholder="1" /></Field>
        <Field label="From"><Select value={from} onChange={setFrom} label="From unit" options={options.map(unit => ({ value: unit, label: unit }))} /></Field>
        <Field label="To"><Select value={to} onChange={setTo} label="To unit" options={options.map(unit => ({ value: unit, label: unit }))} /></Field>
      </div>
      <Output label={`${value || '0'} ${from} in ${to}`} value={result === null ? '—' : `${formatNumber(result, 6)} ${to}`} />
      <Button variant="ghost" onClick={() => { const next = from; setFrom(to); setTo(next) }}>Swap direction</Button>
      <p className="tool-hint">
        Data uses binary prefixes: 1 MB is 1024 KB, not 1000. Lower-case “b” means bits, so 1 Mb is an eighth
        of a megabyte — the difference between what a provider advertises and what a download does.
      </p>
    </div>
  )
}

/* ---------------- base converter ---------------- */

const BASES = [
  { value: '2', label: 'Binary (2)' },
  { value: '8', label: 'Octal (8)' },
  { value: '10', label: 'Decimal (10)' },
  { value: '16', label: 'Hex (16)' },
] as const

export function BaseConverterTool() {
  const [value, setValue] = useState('255')
  const [from, setFrom] = useState<'2' | '8' | '10' | '16'>('10')
  const [to, setTo] = useState<'2' | '8' | '10' | '16'>('16')
  const result = useMemo(() => convertBase(value, Number(from) as 2 | 8 | 10 | 16, Number(to) as 2 | 8 | 10 | 16), [value, from, to])
  const decimal = useMemo(() => convertBase(value, Number(from) as 2 | 8 | 10 | 16, 10), [value, from])

  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Value"><TextInput value={value} onChange={setValue} /></Field>
        <Field label="From"><Select value={from} onChange={setFrom} label="From base" options={BASES.map(item => ({ value: item.value, label: item.label }))} /></Field>
        <Field label="To"><Select value={to} onChange={setTo} label="To base" options={BASES.map(item => ({ value: item.value, label: item.label }))} /></Field>
      </div>
      <Output label={`Base ${to}`} value={result ?? 'not a valid number in that base'} />
      <div className="tool-stats">
        <Stat label="decimal" value={decimal ?? '—'} />
        <Stat label="binary" value={decimal ? Number(decimal).toString(2) : '—'} />
        <Stat label="hex" value={decimal ? Number(decimal).toString(16).toUpperCase() : '—'} />
      </div>
      <p className="tool-hint">Digits that do not exist in the source base are refused rather than silently dropped — a binary “2” is not a number.</p>
    </div>
  )
}

/* ---------------- percentage ---------------- */

export function PercentageTool() {
  const [percent, setPercent] = useState('15')
  const [value, setValue] = useState('80')
  const [part, setPart] = useState('20')
  const [whole, setWhole] = useState('250')
  const first = percentOf(Number(percent) || 0, Number(value) || 0)
  const second = whatPercent(Number(part) || 0, Number(whole) || 0)
  return (
    <div className="tool-panel">
      <div className="tool-grid-2">
        <div className="tool-column">
          <div className="tool-row">
            <Field label="Percent"><TextInput value={percent} onChange={setPercent} /></Field>
            <Field label="of value"><TextInput value={value} onChange={setValue} /></Field>
          </div>
          <Output label={`${percent}% of ${value}`} value={formatNumber(first, 4)} />
        </div>
        <div className="tool-column">
          <div className="tool-row">
            <Field label="Part"><TextInput value={part} onChange={setPart} /></Field>
            <Field label="of whole"><TextInput value={whole} onChange={setWhole} /></Field>
          </div>
          <Output label={`${part} is what percent of ${whole}`} value={second === null ? 'cannot divide by zero' : `${formatNumber(second, 4)}%`} />
        </div>
      </div>
    </div>
  )
}

export function PercentageChangeTool() {
  const [from, setFrom] = useState('100')
  const [to, setTo] = useState('150')
  const change = percentChange(Number(from) || 0, Number(to) || 0)
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="From"><TextInput value={from} onChange={setFrom} /></Field>
        <Field label="To"><TextInput value={to} onChange={setTo} /></Field>
      </div>
      <Output label="Change" value={change === null ? 'cannot start from zero' : `${change > 0 ? '+' : ''}${formatNumber(change, 2)}%`} />
      <p className="tool-hint">A drop from 100 to 50 is −50%, but going back up from 50 to 100 is +100%. That asymmetry is real, not a bug in the maths.</p>
    </div>
  )
}

/* ---------------- roman ---------------- */

export function RomanTool() {
  const [number, setNumber] = useState('1994')
  const [roman, setRoman] = useState('MCMXCIV')
  const asRoman = romanNumeral(Number(number))
  const asNumber = fromRoman(roman)
  return (
    <div className="tool-panel">
      <div className="tool-grid-2">
        <div className="tool-column">
          <Field label="Number (1–3999)"><TextInput value={number} onChange={setNumber} /></Field>
          <Output label="Roman numeral" value={asRoman ?? 'out of range'} />
        </div>
        <div className="tool-column">
          <Field label="Roman numeral"><TextInput value={roman} onChange={setRoman} /></Field>
          <Output label="Number" value={asNumber === null ? 'not a canonical numeral' : String(asNumber)} />
        </div>
      </div>
    </div>
  )
}

/* ---------------- binary playground ---------------- */

export function BinaryPlaygroundTool() {
  const [value, setValue] = useState('42')
  const asNumber = Number(value)
  const valid = Number.isInteger(asNumber) && asNumber >= 0 && asNumber <= 255
  const bits = valid ? asNumber.toString(2).padStart(8, '0') : '00000000'
  return (
    <div className="tool-panel">
      <Field label="Byte value (0–255)"><TextInput type="number" min={0} max={255} value={value} onChange={setValue} /></Field>
      <div className="tool-bits">
        {[...bits].map((bit, index) => (
          <div key={index} className={`tool-bit ${bit === '1' ? 'is-on' : ''}`}>
            <span className="tool-bit-value">{bit}</span>
            <span className="tool-bit-weight">{128 >> index}</span>
          </div>
        ))}
      </div>
      <Output label="Sum of the lit bits" value={valid ? String(asNumber) : 'enter a whole number 0–255'} />
      <p className="tool-hint">The small number under each bit is its place value, so the eight weights add to 255.</p>
    </div>
  )
}

/* ---------------- gcd / lcm ---------------- */

export function GcdLcmTool() {
  const [text, setText] = useState('12, 18, 24')
  const values = useMemo(() => text.split(/[\s,]+/).map(Number).filter(Number.isFinite), [text])
  const result = useMemo(() => gcdLcmList(values), [values])
  return (
    <div className="tool-panel">
      <Field label="Numbers" hint="Separated by commas or spaces"><TextInput value={text} onChange={setText} /></Field>
      <div className="tool-stats">
        <Stat label="GCD" value={result?.gcd ?? '—'} />
        <Stat label="LCM" value={result?.lcm ?? '—'} />
      </div>
      <p className="tool-hint">Decimals are ignored rather than rounded — a greatest common divisor of 2.5 is not a thing.</p>
    </div>
  )
}

/* ---------------- prime ---------------- */

export function PrimeTool() {
  const [value, setValue] = useState('97')
  const number = Number(value)
  const prime = isPrime(number)
  const factors = factorsOf(number)
  return (
    <div className="tool-panel">
      <Field label="Number"><TextInput type="number" value={value} onChange={setValue} /></Field>
      <div className={`tool-verdict ${prime ? 'good' : 'bad'}`}>{prime ? `${number} is prime.` : `${number} is not prime.`}</div>
      <div className="tool-stats">
        <Stat label="factors" value={factors.length ? factors.join(', ') : '—'} />
        <Stat label="factor count" value={factors.length} />
      </div>
    </div>
  )
}

/* ---------------- BMI ---------------- */

export function BmiTool() {
  const [kg, setKg] = useState('70')
  const [cm, setCm] = useState('175')
  const result = bmi(Number(kg), Number(cm) / 100)
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Mass (kg)"><TextInput type="number" value={kg} onChange={setKg} /></Field>
        <Field label="Height (cm)"><TextInput type="number" value={cm} onChange={setCm} /></Field>
      </div>
      <div className="tool-stats">
        <Stat label="BMI" value={result ? result.value.toFixed(1) : '—'} />
        <Stat label="band" value={result?.band ?? '—'} />
      </div>
      <p className="tool-hint">BMI ignores build, muscle and age, so it is a rough population measure rather than a verdict on one person.</p>
    </div>
  )
}

/* ---------------- tip ---------------- */

export function TipTool() {
  const [total, setTotal] = useState('120')
  const [people, setPeople] = useState('4')
  const [tip, setTip] = useState('10')
  const result = splitBill(Number(total) || 0, Number(people) || 0, Number(tip) || 0)
  const currency = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Bill"><TextInput type="number" value={total} onChange={setTotal} /></Field>
        <Field label="People"><TextInput type="number" min={1} value={people} onChange={setPeople} /></Field>
        <Field label="Tip %"><TextInput type="number" value={tip} onChange={setTip} /></Field>
      </div>
      <div className="tool-stats">
        <Stat label="tip" value={result ? currency(result.tip) : '—'} />
        <Stat label="total" value={result ? currency(result.total) : '—'} />
        <Stat label="each" value={result ? currency(result.each) : '—'} />
      </div>
      <p className="tool-hint">Rounding is left to you: paying the ceiling of “each” is easier than arguing about a cent.</p>
    </div>
  )
}

/* ---------------- loan ---------------- */

export function LoanTool() {
  const [principal, setPrincipal] = useState('300000')
  const [rate, setRate] = useState('6')
  const [years, setYears] = useState('25')
  const result = loanPayment(Number(principal) || 0, Number(rate) || 0, Number(years) || 0)
  const currency = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Amount"><TextInput type="number" value={principal} onChange={setPrincipal} /></Field>
        <Field label="Annual rate %"><TextInput type="number" step={0.1} value={rate} onChange={setRate} /></Field>
        <Field label="Years"><TextInput type="number" value={years} onChange={setYears} /></Field>
      </div>
      <div className="tool-stats">
        <Stat label="per month" value={result ? currency(result.monthly) : '—'} />
        <Stat label="total repaid" value={result ? currency(result.total) : '—'} />
        <Stat label="interest" value={result ? currency(result.interest) : '—'} />
      </div>
      <p className="tool-hint">Assumes a fixed rate and no fees. A zero-rate loan is handled by paying the principal down evenly.</p>
    </div>
  )
}

/* ---------------- compound ---------------- */

export function CompoundTool() {
  const [principal, setPrincipal] = useState('1000')
  const [rate, setRate] = useState('7')
  const [years, setYears] = useState('10')
  const [frequency, setFrequency] = useState<'12' | '4' | '1' | '365'>('12')
  const result = compoundInterest(Number(principal) || 0, Number(rate) || 0, Number(years) || 0, Number(frequency))
  const currency = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Starting amount"><TextInput type="number" value={principal} onChange={setPrincipal} /></Field>
        <Field label="Annual rate %"><TextInput type="number" step={0.1} value={rate} onChange={setRate} /></Field>
        <Field label="Years"><TextInput type="number" value={years} onChange={setYears} /></Field>
        <Field label="Compounding">
          <Select value={frequency} onChange={setFrequency} label="Compounding" options={[{ value: '12', label: 'Monthly' }, { value: '4', label: 'Quarterly' }, { value: '1', label: 'Yearly' }, { value: '365', label: 'Daily' }]} />
        </Field>
      </div>
      <div className="tool-stats">
        <Stat label="final balance" value={result ? currency(result.final) : '—'} />
        <Stat label="interest earned" value={result ? currency(result.interest) : '—'} />
      </div>
      <p className="tool-hint">More frequent compounding means more interest, because each period earns on the one before.</p>
    </div>
  )
}

/* ---------------- grades ---------------- */

const DEFAULT_GRADE_ITEMS: GradeItem[] = [
  { name: 'Assignments', score: 85, outOf: 100, weight: 30 },
  { name: 'Exam', score: 72, outOf: 100, weight: 50 },
  { name: 'Project', score: 18, outOf: 20, weight: 20 },
]

export function GradeTool() {
  const [items, setItems] = useState<GradeItem[]>(DEFAULT_GRADE_ITEMS)
  const result = useMemo(() => weightedGrade(items), [items])
  const update = (index: number, patch: Partial<GradeItem>) => setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <div className="tool-panel">
      <div className="tool-table">
        <div className="tool-table-head">
          <span>Item</span><span>Score</span><span>Out of</span><span>Weight %</span><span />
        </div>
        {items.map((item, index) => (
          <div key={index} className="tool-table-row">
            <input className="tool-input" value={item.name} aria-label={`Name of item ${index + 1}`} onChange={event => update(index, { name: event.target.value })} />
            <input className="tool-input" type="number" value={item.score} aria-label="Score" onChange={event => update(index, { score: Number(event.target.value) })} />
            <input className="tool-input" type="number" value={item.outOf} aria-label="Out of" onChange={event => update(index, { outOf: Number(event.target.value) })} />
            <input className="tool-input" type="number" value={item.weight} aria-label="Weight" onChange={event => update(index, { weight: Number(event.target.value) })} />
            <button type="button" className="tool-copy" onClick={() => setItems(items.filter((_, i) => i !== index))} aria-label={`Remove ${item.name}`}>Remove</button>
          </div>
        ))}
      </div>
      <div className="tool-row">
        <Button variant="ghost" onClick={() => setItems([...items, { name: 'New item', score: 0, outOf: 100, weight: 10 }])}>Add an item</Button>
        <CopyButton label="Copy result" value={result ? `${result.percent.toFixed(1)}% (${result.letter})` : ''} />
      </div>
      <div className="tool-stats">
        <Stat label="weighted" value={result ? `${result.percent.toFixed(1)}%` : '—'} />
        <Stat label="grade" value={result?.letter ?? '—'} />
        <Stat label="total weight" value={result?.totalWeight ?? '—'} />
      </div>
      <p className="tool-hint">Weights do not have to add up to 100 — the result is scaled by whatever total you actually used.</p>
    </div>
  )
}

export { TextArea }
