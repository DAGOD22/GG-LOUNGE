'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ComponentType, type ReactElement } from 'react';
import {
  Calculator as CalculatorIcon, Clock, Dices, FileJson, Hash, KeyRound, NotepadText, Palette,
  Percent, QrCode, Receipt, Ruler, Shuffle, Text, Timer as TimerIcon, Type, Globe2, Binary,
} from 'lucide-react';
import {
  Base64Encoder, Calculator, ColourPicker, Countdown, DiceRoller, HashGenerator,
  JsonFormatter, Notepad, PasswordGenerator, PercentageCalculator, QrCodeGenerator,
  RandomPicker, Stopwatch, TextCaseConverter, TipCalculator, UnitConverter, WordCounter, WorldClock,
} from './Tools';

type Tool = {
  id: string;
  name: string;
  blurb: string;
  group: 'Everyday' | 'Text & data' | 'Random & security' | 'Time';
  icon: ComponentType<{ size?: number }>;
  Component: () => ReactElement;
};

const TOOLS: Tool[] = [
  { id: 'calculator', name: 'Calculator', blurb: 'Everyday maths with a full keypad', group: 'Everyday', icon: CalculatorIcon, Component: Calculator },
  { id: 'notepad', name: 'Notepad', blurb: 'Autosaving notes on this device', group: 'Everyday', icon: NotepadText, Component: Notepad },
  { id: 'percentage', name: 'Percentage', blurb: 'Percent of, share of, and change', group: 'Everyday', icon: Percent, Component: PercentageCalculator },
  { id: 'tip', name: 'Tip calculator', blurb: 'Split a bill and round the tip', group: 'Everyday', icon: Receipt, Component: TipCalculator },
  { id: 'unit', name: 'Unit converter', blurb: 'Length, mass, temperature, data', group: 'Everyday', icon: Ruler, Component: UnitConverter },
  { id: 'colour', name: 'Colour picker', blurb: 'Hex, RGB, HSL and contrast', group: 'Everyday', icon: Palette, Component: ColourPicker },
  { id: 'qr', name: 'QR code', blurb: 'Make a scannable code offline', group: 'Everyday', icon: QrCode, Component: QrCodeGenerator },

  { id: 'wordcount', name: 'Word counter', blurb: 'Words, sentences, reading time', group: 'Text & data', icon: Type, Component: WordCounter },
  { id: 'case', name: 'Text case', blurb: 'camel, snake, title, constant', group: 'Text & data', icon: Text, Component: TextCaseConverter },
  { id: 'json', name: 'JSON formatter', blurb: 'Validate, pretty-print, minify', group: 'Text & data', icon: FileJson, Component: JsonFormatter },
  { id: 'encode', name: 'Encoder', blurb: 'Base64 and URL encoding', group: 'Text & data', icon: Binary, Component: Base64Encoder },
  { id: 'hash', name: 'Hash generator', blurb: 'SHA-1 to SHA-512 via Web Crypto', group: 'Text & data', icon: Hash, Component: HashGenerator },

  { id: 'password', name: 'Password generator', blurb: 'Cryptographically random', group: 'Random & security', icon: KeyRound, Component: PasswordGenerator },
  { id: 'dice', name: 'Dice roller', blurb: 'Up to twelve dice, any sides', group: 'Random & security', icon: Dices, Component: DiceRoller },
  { id: 'picker', name: 'Random picker', blurb: 'Pick a name from a list', group: 'Random & security', icon: Shuffle, Component: RandomPicker },

  { id: 'stopwatch', name: 'Stopwatch', blurb: 'Lap times to the hundredth', group: 'Time', icon: TimerIcon, Component: Stopwatch },
  { id: 'countdown', name: 'Countdown', blurb: 'Timer with a finishing tone', group: 'Time', icon: Clock, Component: Countdown },
  { id: 'worldclock', name: 'World clock', blurb: 'Twelve cities at a glance', group: 'Time', icon: Globe2, Component: WorldClock },
];

const GROUPS = ['Everyday', 'Text & data', 'Random & security', 'Time'] as const;

export function ToolsWorkspace() {
  const [activeId, setActiveId] = useState('calculator');
  const [query, setQuery] = useState('');

  // Deep links (/tools?tool=json) and back/forward support.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tool');
    if (fromUrl && TOOLS.some(t => t.id === fromUrl)) setActiveId(fromUrl);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tool') === activeId) return;
    url.searchParams.set('tool', activeId);
    window.history.replaceState(null, '', url.toString());
  }, [activeId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter(t => t.name.toLowerCase().includes(q) || t.blurb.toLowerCase().includes(q));
  }, [query]);

  const active = TOOLS.find(t => t.id === activeId) ?? TOOLS[0];
  const Active = active.Component;

  return (
    <main className="tools-shell">
      <header className="tools-header">
        <Link href="/" className="tools-back">← Back to the lounge</Link>
        <p className="tools-overline">GG-LOUNGE™ · BUILT IN</p>
        <h1>Tools</h1>
        <p className="tools-lede">
          {TOOLS.length} small utilities that run entirely in your browser — no uploads, no accounts, no tracking.
          Save anything you need: notes and options are stored on this device.
        </p>
      </header>

      <div className="tools-layout">
        <aside className="tools-sidebar" aria-label="Tools">
          <label className="tools-search">
            <span className="sr-only">Search tools</span>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search tools…"
              aria-label="Search tools"
            />
          </label>
          <nav>
            {GROUPS.map(group => {
              const items = filtered.filter(t => t.group === group);
              if (!items.length) return null;
              return (
                <div key={group} className="tools-group">
                  <h2>{group}</h2>
                  {items.map(tool => {
                    const Icon = tool.icon;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        className={`tools-nav-item ${activeId === tool.id ? 'active' : ''}`}
                        aria-current={activeId === tool.id ? 'page' : undefined}
                        onClick={() => setActiveId(tool.id)}
                      >
                        <Icon size={16} />
                        <span>
                          <b>{tool.name}</b>
                          <small>{tool.blurb}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {!filtered.length && <p className="tools-empty">No tools match “{query}”.</p>}
          </nav>
        </aside>

        <section className="tools-main" aria-live="polite">
          <Active />
        </section>
      </div>
    </main>
  );
}
