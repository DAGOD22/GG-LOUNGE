'use client'
/**
 * The tools page.
 *
 * One hundred panels, a search box, and a category rail. The mapping from tool
 * id to panel lives in `PANELS` below and nowhere else — the registry holds the
 * names and blurbs, and this file holds the wiring, so a missing panel shows up
 * as a plain "still being built" card rather than a crash or a blank page.
 *
 * The selected tool is kept in the URL hash. That makes a tool linkable (send
 * someone /tools#color-contrast) and means the back button works, which is the
 * behaviour people expect from a page with a hundred destinations.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { ArrowLeft, Search, Shuffle, X } from 'lucide-react'

import { DEFAULT_TOOL, TOOLS, searchTools, toolsByCategory, type Tool } from '@/lib/tools/registry'
import { CalculatorTool, QrTool } from './featured'
import {
  AcronymTool, BinaryTextTool, CaseTool, DiffTool, DuplicateTool, FancyTextTool,
  FindReplaceTool, LetterFrequencyTool, LoremTool, MorseTool, NatoTool,
  PalindromeTool, ReverseTool, SortLinesTool, SpongeTool, TextStatsTool, WordCountTool,
} from './panels-text'
import {
  BaseConverterTool, BinaryPlaygroundTool, BmiTool, CompoundTool, GcdLcmTool,
  GradeTool, LoanTool, PercentageChangeTool, PercentageTool, PrimeTool,
  RomanTool, TipTool, UnitConverterTool,
} from './panels-numbers'
import {
  AddDaysTool, AgeTool, CountdownTool, DateDiffTool, LeapYearTool, PomodoroTool,
  StopwatchTool, TimestampTool, TimerTool, TrimPlannerTool, WeekNumberTool, WorldClockTool,
} from './panels-time'
import {
  AspectFitTool, AspectRatioTool, BorderRadiusTool, BoxShadowTool, ColorConverterTool,
  ColourNameTool, ContrastTool, FontPairTool, GradientTool, PaletteTool, PxRemTool, SvgGridTool,
} from './panels-design'
import {
  Base64Tool, BrowserTool, CsvJsonTool, CronTool, EnvSortTool, FileHashTool,
  HashTool, IbanTool, IpTool, JsonDiffTool, JsonFormatTool, JsonTableTool, JwtTool,
  KeyboardTool, LuhnTool, MacTool, MouseTool, PasswordStrengthTool, RegexTool,
  ScreenTool, SqlTool, StorageTool, UnicodeTool, UrlEncoderTool, UuidCheckTool,
  UuidTool, YamlTool,
} from './panels-dev'
import {
  CoinTool, DiceTool, NameGeneratorTool, PasswordTool, QuoteTool, RandomColourTool,
  RandomNumberTool, ShuffleTool, WheelTool,
} from './panels-random'
import {
  AnagramTool, AsciiTool, EmojiTool, SlugTool, TypingTestTool, UsernameTool,
} from './panels-extra'

/**
 * Tool id → panel. Every entry in the registry should appear here; the page
 * renders a placeholder for the ones that do not, so this can be built up in
 * pieces without leaving broken links behind.
 */
const PANELS: Record<string, ComponentType> = {
  // featured
  qr: QrTool,
  calculator: CalculatorTool,

  // text
  case: CaseTool,
  'word-count': WordCountTool,
  'text-stats': TextStatsTool,
  'sort-lines': SortLinesTool,
  'remove-dupes': DuplicateTool,
  'find-replace': FindReplaceTool,
  'text-diff': DiffTool,
  lorem: LoremTool,
  reverse: ReverseTool,
  palindrome: PalindromeTool,
  acronym: AcronymTool,
  nato: NatoTool,
  morse: MorseTool,
  'binary-text': BinaryTextTool,
  'letter-frequency': LetterFrequencyTool,
  sponge: SpongeTool,
  'fancy-text': FancyTextTool,
  'case-nickname': UsernameTool,
  slugify: SlugTool,
  anagram: AnagramTool,
  'emoji-search': EmojiTool,
  'ascii-art': AsciiTool,
  'speed-test': TypingTestTool,

  // numbers
  'unit-converter': UnitConverterTool,
  'base-converter': BaseConverterTool,
  percentage: PercentageTool,
  'percentage-change': PercentageChangeTool,
  roman: RomanTool,
  binary: BinaryPlaygroundTool,
  'gcd-lcm': GcdLcmTool,
  prime: PrimeTool,
  bmi: BmiTool,
  tip: TipTool,
  mortgage: LoanTool,
  compound: CompoundTool,
  grade: GradeTool,

  // time
  countdown: CountdownTool,
  age: AgeTool,
  'date-diff': DateDiffTool,
  'add-days': AddDaysTool,
  'week-number': WeekNumberTool,
  'leap-year': LeapYearTool,
  stopwatch: StopwatchTool,
  'timer-beep': () => <TimerTool withBeep />,
  'study-timer': PomodoroTool,
  timestamp: TimestampTool,
  timezone: WorldClockTool,
  'world-clock': WorldClockTool,
  'ffmpeg-note': TrimPlannerTool,

  // design
  'color-converter': ColorConverterTool,
  'color-name': ColourNameTool,
  'color-palette': PaletteTool,
  contrast: ContrastTool,
  'px-rem': PxRemTool,
  'aspect-ratio': AspectRatioTool,
  'image-size': AspectFitTool,
  gradient: GradientTool,
  'border-radius': BorderRadiusTool,
  'box-shadow': BoxShadowTool,
  'svg-grid': SvgGridTool,
  'font-pair': FontPairTool,

  // dev
  base64: Base64Tool,
  'url-encoder': UrlEncoderTool,
  uuid: UuidTool,
  'uuid-check': UuidCheckTool,
  'json-format': JsonFormatTool,
  'json-diff': JsonDiffTool,
  'json-to-tsv': JsonTableTool,
  'csv-json': CsvJsonTool,
  'yaml-json': YamlTool,
  hash: HashTool,
  'file-hash': FileHashTool,
  'password-strength': PasswordStrengthTool,
  'regex-tester': RegexTool,
  cron: CronTool,
  'cron-next': CronTool,
  'sql-format': SqlTool,
  'env-sort': EnvSortTool,
  jwt: JwtTool,
  luhn: LuhnTool,
  iban: IbanTool,
  'ip-format': IpTool,
  mac: MacTool,
  'unicode-lookup': UnicodeTool,
  'keyboard-test': KeyboardTool,
  'mouse-test': MouseTool,
  'screen-info': ScreenTool,
  'ua-info': BrowserTool,
  'storage-info': StorageTool,

  // random
  password: PasswordTool,
  dice: DiceTool,
  coin: CoinTool,
  'random-number': RandomNumberTool,
  wheel: WheelTool,
  shuffle: ShuffleTool,
  'colour-random': RandomColourTool,
  quote: QuoteTool,
  'name-generator': NameGeneratorTool,
}

function readHash(): string {
  if (typeof window === 'undefined') return DEFAULT_TOOL
  const id = window.location.hash.replace(/^#/, '')
  return TOOLS.some(tool => tool.id === id) ? id : DEFAULT_TOOL
}

export function ToolsPage() {
  const [selected, setSelected] = useState<string>(DEFAULT_TOOL)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')
  const panelRef = useRef<HTMLDivElement>(null)

  // The hash is the source of truth for which tool is open, so a shared link
  // and a browser back button both land in the right place.
  useEffect(() => {
    setSelected(readHash())
    const onHashChange = () => setSelected(readHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const open = useCallback((id: string) => {
    setSelected(id)
    // replaceState with the hash keeps the history clean: opening twenty tools
    // should not mean pressing back twenty times to leave the page.
    window.history.replaceState(null, '', `#${id}`)
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const results = useMemo(() => searchTools(query), [query])
  const visible = useMemo(
    () => (category === 'all' ? results : results.filter(tool => tool.category === category)),
    [results, category],
  )

  const current = TOOLS.find(tool => tool.id === selected) ?? TOOLS[0]
  const Panel = PANELS[current.id]

  const surprise = () => open(TOOLS[Math.floor(Math.random() * TOOLS.length)].id)

  return (
    <main className="tools-page">
      <section className="tools-hero">
        <p className="tools-eyebrow">100 things, all in the browser</p>
        <h1>GG Tools</h1>
        <p className="tools-lede">
          A hundred small utilities — QR codes, a calculator, converters, timers, colour work and the odd
          genuinely useful developer panel. Nothing here sends what you type anywhere: every tool runs in this
          tab, and the inputs you leave behind are only ever saved to this browser.
        </p>
      </section>

      <div className="tools-layout" ref={panelRef}>
        <aside className="tools-rail" aria-label="Tool list">
          <div className="tools-search">
            <Search size={14} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search 100 tools…"
              aria-label="Search tools"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>
            ) : null}
          </div>

          <div className="tools-category-row">
            <button type="button" className={category === 'all' ? 'is-active' : ''} onClick={() => setCategory('all')}>All {TOOLS.length}</button>
            {toolsByCategory().map(group => (
              <button
                key={group.category}
                type="button"
                className={category === group.category ? 'is-active' : ''}
                onClick={() => setCategory(group.category)}
              >
                {group.category} {group.tools.length}
              </button>
            ))}
          </div>

          <div className="tools-list">
            {visible.length === 0 ? <p className="tool-hint">Nothing matches “{query}”.</p> : null}
            {visible.map(tool => (
              <button
                key={tool.id}
                type="button"
                className={`tools-list-item ${tool.id === current.id ? 'is-active' : ''}`}
                onClick={() => open(tool.id)}
              >
                <span className="tools-list-name">{tool.name}</span>
                <span className="tools-list-blurb">{tool.blurb}</span>
              </button>
            ))}
          </div>

          <button type="button" className="tools-surprise" onClick={surprise}>
            <Shuffle size={14} /> Surprise me
          </button>
        </aside>

        <section className="tools-main" aria-live="polite">
          <header className="tools-main-head">
            <div>
              <span className="tools-main-category">{current.category}</span>
              <h2>{current.name}</h2>
              <p>{current.blurb}</p>
            </div>
            <button type="button" className="tools-back" onClick={() => open(DEFAULT_TOOL)}>
              <ArrowLeft size={13} /> Start over
            </button>
          </header>

          {Panel ? <Panel /> : (
            <div className="tool-empty">
              This one is still being built. The other {TOOLS.length - 1} work.
            </div>
          )}

          <footer className="tools-main-foot">
            <span>Tool {TOOLS.findIndex(tool => tool.id === current.id) + 1} of {TOOLS.length}</span>
            <span>Runs entirely offline in this tab</span>
          </footer>
        </section>
      </div>

      <section className="tools-directory">
        <h2>Everything on this page</h2>
        {toolsByCategory().map(group => (
          <div key={group.category} className="tools-directory-group">
            <h3>{group.category}</h3>
            <div className="tools-directory-links">
              {group.tools.map(tool => (
                <a key={tool.id} href={`#${tool.id}`} onClick={event => { event.preventDefault(); open(tool.id) }}>
                  {tool.name}
                </a>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}

/** Which registry entries have no panel yet — surfaced in tests, not the UI. */
export function missingPanels(): string[] {
  return TOOLS.filter((tool: Tool) => !PANELS[tool.id]).map(tool => tool.id)
}

export { PANELS }
