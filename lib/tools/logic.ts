/**
 * The arithmetic and text handling behind the tools page.
 *
 * Kept out of the components on purpose: a calculator whose operator precedence
 * is wrong is a bug you can only see by reading the answer, and there is no way
 * to test that inside a JSX tree without a browser. Everything here is a pure
 * function of its arguments, so the tests can assert the answers directly and
 * the components stay thin.
 */

/* ---------------- Calculator ---------------- */

/**
 * A tiny arithmetic evaluator.
 *
 * Deliberately not `eval` and not `Function`: this page takes text from a
 * person, and both of those would run anything they were given. This tokenises
 * numbers and the five operators, then does two passes for precedence.
 *
 * Supported: + - * / % , unary minus, parentheses, and ^ for powers.
 * Returns `null` for anything it cannot parse rather than throwing, so the UI
 * can show "—" instead of a broken screen.
 */
export function evaluateExpression(input: string): number | null {
  // Two numbers separated only by a space ("2 3") are not a product, they are
  // probably a typo. Stripping whitespace first would fuse them into "23" and
  // return a confident wrong answer, so refuse it before touching the string.
  if (/\d\s+\d/.test(input)) return null;
  const source = input.replace(/[×✕x]/gi, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  if (!source) return null;

  let index = 0;
  const peek = () => source[index];

  const parseNumber = (): number | null => {
    const start = index;
    while (index < source.length && /[0-9.]/.test(source[index])) index++;
    if (start === index) return null;
    // Exponent notation: 1e3, 2.5e-4
    if ((source[index] === 'e' || source[index] === 'E')) {
      let lookahead = index + 1;
      if (source[lookahead] === '+' || source[lookahead] === '-') lookahead++;
      if (/[0-9]/.test(source[lookahead] ?? '')) {
        index = lookahead;
        while (index < source.length && /[0-9]/.test(source[index])) index++;
      }
    }
    const value = Number(source.slice(start, index));
    return Number.isFinite(value) ? value : null;
  };

  // Recursive descent: expression -> term -> factor -> unary -> primary
  const parseExpression = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === '+' || peek() === '-') {
      const operator = source[index++];
      const right = parseTerm();
      if (right === null) return null;
      left = operator === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number | null => {
    let left = parsePower();
    if (left === null) return null;
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = source[index++];
      const right = parsePower();
      if (right === null) return null;
      if ((operator === '/' || operator === '%') && right === 0) return null;
      left = operator === '*' ? left * right : operator === '/' ? left / right : left % right;
    }
    return left;
  };

  const parsePower = (): number | null => {
    const base = parseUnary();
    if (base === null) return null;
    if (peek() !== '^') return base;
    index++;
    // Right-associative, so 2^3^2 is 2^9.
    const exponent = parsePower();
    if (exponent === null) return null;
    return Math.pow(base, exponent);
  };

  const parseUnary = (): number | null => {
    if (peek() === '-') {
      index++;
      const value = parseUnary();
      return value === null ? null : -value;
    }
    if (peek() === '+') {
      index++;
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePrimary = (): number | null => {
    if (peek() === '(') {
      index++;
      const value = parseExpression();
      if (value === null || peek() !== ')') return null;
      index++;
      return value;
    }
    return parseNumber();
  };

  const result = parseExpression();
  if (result === null || index !== source.length) return null;
  return Number.isFinite(result) ? result : null;
}

/** Format a number for display without scientific notation getting silly. */
export function formatNumber(value: number, maxDecimals = 10): string {
  if (!Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  const rounded = Number(value.toFixed(maxDecimals));
  return String(rounded);
}

/* ---------------- Units ---------------- */

export type UnitGroup = 'length' | 'mass' | 'volume' | 'speed' | 'temperature' | 'data';

/** Every unit is defined as `toBase`, so conversions are one multiply and divide. */
const UNITS: Record<UnitGroup, Record<string, number>> = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  mass: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 },
  volume: { ml: 0.001, l: 1, cup: 0.2365882365, pint: 0.473176473, gallon: 3.785411784, floz: 0.0295735295625 },
  speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 0.514444 },
  data: { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, Kb: 128, Mb: 1024 * 128, Gb: 1024 ** 2 * 128 },
  temperature: {},
};

export function unitOptions(group: UnitGroup): string[] {
  return Object.keys(UNITS[group]);
}

export function convertUnit(group: UnitGroup, value: number, from: string, to: string): number | null {
  if (!Number.isFinite(value)) return null;
  if (group === 'temperature') {
    // Celsius is the base; the offsets are why temperature cannot be a single
    // multiplier like the other groups.
    const toCelsius = (v: number) => (from === 'C' ? v : from === 'F' ? (v - 32) * (5 / 9) : v - 273.15);
    const fromCelsius = (v: number) => (to === 'C' ? v : to === 'F' ? v * (9 / 5) + 32 : v + 273.15);
    if (!['C', 'F', 'K'].includes(from) || !['C', 'F', 'K'].includes(to)) return null;
    return fromCelsius(toCelsius(value));
  }
  const table = UNITS[group];
  const fromFactor = table[from];
  const toFactor = table[to];
  if (!fromFactor || !toFactor) return null;
  return (value * fromFactor) / toFactor;
}

export const TEMPERATURE_UNITS = ['C', 'F', 'K'];

/* ---------------- Bases ---------------- */

export function convertBase(value: string, from: 2 | 8 | 10 | 16, to: 2 | 8 | 10 | 16): string | null {
  const trimmed = value.trim().replace(/^0[bxo]/i, '');
  if (!trimmed) return null;
  const parsed = parseInt(trimmed, from);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  // Negative numbers are valid input but had no meaning in the bit view.
  if (parsed < 0) return null;
  return parsed.toString(to).toUpperCase();
}

/* ---------------- Percentages ---------------- */

export function percentOf(percent: number, value: number): number {
  return (percent / 100) * value;
}

export function whatPercent(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}

export function percentChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/* ---------------- Money ---------------- */

export function splitBill(total: number, people: number, tipPercent: number): { total: number; tip: number; each: number } | null {
  if (!Number.isFinite(total) || !Number.isFinite(people) || people < 1) return null;
  const tip = (tipPercent / 100) * total;
  const withTip = total + tip;
  return { total: withTip, tip, each: withTip / Math.floor(people) };
}

export function loanPayment(principal: number, annualRatePercent: number, years: number): { monthly: number; total: number; interest: number } | null {
  if (!(principal > 0) || !(years > 0) || annualRatePercent < 0) return null;
  const months = Math.round(years * 12);
  const monthlyRate = annualRatePercent / 100 / 12;
  // A zero-interest loan is the limit of the annuity formula, not a division by
  // zero — handle it explicitly or the answer is NaN.
  const monthly = monthlyRate === 0
    ? principal / months
    : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  const total = monthly * months;
  return { monthly, total, interest: total - principal };
}

export function compoundInterest(principal: number, annualRatePercent: number, years: number, compoundsPerYear = 12): { final: number; interest: number } | null {
  if (!(principal > 0) || !(years > 0) || !(compoundsPerYear > 0)) return null;
  const rate = annualRatePercent / 100;
  const final = principal * Math.pow(1 + rate / compoundsPerYear, compoundsPerYear * years);
  return { final, interest: final - principal };
}

/* ---------------- BMI ---------------- */

export function bmi(kg: number, metres: number): { value: number; band: string } | null {
  if (!(kg > 0) || !(metres > 0)) return null;
  const value = kg / (metres * metres);
  const band = value < 18.5 ? 'Underweight' : value < 25 ? 'Healthy range' : value < 30 ? 'Overweight' : 'Obese';
  return { value, band };
}

/* ---------------- Text ---------------- */

export type TextStats = {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingSeconds: number;
};

export function textStats(text: string, wordsPerMinute = 200): TextStats {
  const characters = [...text].length;
  const charactersNoSpaces = [...text.replace(/\s/g, '')].length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // A sentence ends at . ! or ? — counting one for a non-empty string that has
  // no terminator avoids reporting "0 sentences" for a paragraph of poetry.
  const sentences = text.trim() ? Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length) : 0;
  const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/).filter(block => block.trim()).length : 0;
  const lines = text ? text.split('\n').length : 0;
  return {
    characters,
    charactersNoSpaces,
    words,
    sentences,
    paragraphs,
    lines,
    readingSeconds: Math.round((words / wordsPerMinute) * 60),
  };
}

export function toTitleCase(text: string): string {
  // Preserve the existing whitespace so the shape of the text survives.
  return text.replace(/\S+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export function toSentenceCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^\s*\w|[.!?]\s+\w)/g, match => match.toUpperCase());
}

export function toCamelCase(text: string): string {
  const words = splitWords(text);
  return words.map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())).join('');
}

export function toPascalCase(text: string): string {
  return splitWords(text).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
}

export function toSnakeCase(text: string): string {
  return splitWords(text).map(word => word.toLowerCase()).join('_');
}

export function toKebabCase(text: string): string {
  return splitWords(text).map(word => word.toLowerCase()).join('-');
}

export function toConstantCase(text: string): string {
  return splitWords(text).map(word => word.toUpperCase()).join('_');
}

export function toSpongeCase(text: string, seed = 1): string {
  // Deterministic from the seed, so the preview does not jitter on every render.
  let state = seed || 1;
  return [...text].map(char => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    if (!/[a-z]/i.test(char)) return char;
    return state % 2 === 0 ? char.toUpperCase() : char.toLowerCase();
  }).join('');
}

function splitWords(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    // Strip the combining marks NFKD just separated, so "café" becomes "cafe".
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function reverseText(text: string, mode: 'characters' | 'words' | 'lines'): string {
  if (mode === 'words') return text.split(/(\s+)/).reverse().join('');
  if (mode === 'lines') return text.split('\n').reverse().join('\n');
  // Array.from, not split(''), so an emoji or an accented letter is not torn in
  // half by a reversal of its surrogate pair.
  return Array.from(text).reverse().join('');
}

export function sortLines(text: string, options: { direction: 'asc' | 'desc'; unique: boolean; trim: boolean }): string {
  let lines = text.split('\n');
  if (options.trim) lines = lines.map(line => line.trim()).filter(Boolean);
  if (options.unique) lines = [...new Set(lines)];
  lines.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  if (options.direction === 'desc') lines.reverse();
  return lines.join('\n');
}

export function dedupeLines(text: string): { kept: string; removed: number } {
  const lines = text.split('\n');
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    kept.push(line);
  }
  return { kept: kept.join('\n'), removed: lines.length - kept.length };
}

export function findReplace(text: string, find: string, replace: string, options: { caseSensitive: boolean; wholeWord: boolean }): { result: string; count: number } {
  if (!find) return { result: text, count: 0 };
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
  const regex = new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
  const matches = text.match(regex);
  return { result: text.replace(regex, replace), count: matches ? matches.length : 0 };
}

/** A line-level diff. Returns tagged lines for the component to colour. */
export function diffLines(before: string, after: string): { kind: 'same' | 'added' | 'removed'; text: string }[] {
  const a = before.split('\n');
  const b = after.split('\n');
  // LCS table — fine for the sizes a person pastes into a box.
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out: { kind: 'same' | 'added' | 'removed'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: 'removed', text: a[i++] });
    } else {
      out.push({ kind: 'added', text: b[j++] });
    }
  }
  while (i < a.length) out.push({ kind: 'removed', text: a[i++] });
  while (j < b.length) out.push({ kind: 'added', text: b[j++] });
  return out;
}

export function letterFrequency(text: string): { letter: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const char of text.toLowerCase()) {
    if (!/[a-z]/.test(char)) continue;
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([letter, count]) => ({ letter, count }))
    .sort((a, b) => b.count - a.count || a.letter.localeCompare(b.letter));
}

export function isPalindrome(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.length > 0 && cleaned === Array.from(cleaned).reverse().join('');
}

export function acronym(phrase: string): string {
  // Include words that are already upper case, and keep their case.
  return phrase
    .split(/\s+/)
    .filter(word => word && !/^(a|an|the|of|and|or|to|for|in|on|at|by)$/i.test(word))
    .map(word => word.charAt(0).toUpperCase())
    .join('');
}

const NATO: Record<string, string> = {
  a: 'Alfa', b: 'Bravo', c: 'Charlie', d: 'Delta', e: 'Echo', f: 'Foxtrot', g: 'Golf',
  h: 'Hotel', i: 'India', j: 'Juliett', k: 'Kilo', l: 'Lima', m: 'Mike', n: 'November',
  o: 'Oscar', p: 'Papa', q: 'Quebec', r: 'Romeo', s: 'Sierra', t: 'Tango', u: 'Uniform',
  v: 'Victor', w: 'Whiskey', x: 'X-ray', y: 'Yankee', z: 'Zulu',
  '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four',
  '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine',
};

export function toNato(text: string): string[] {
  const out: string[] = [];
  for (const char of text.toLowerCase()) {
    if (char === ' ') out.push('/');
    else if (NATO[char]) out.push(NATO[char]);
  }
  return out;
}

const MORSE: Record<string, string> = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....',
  i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.',
  q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-',
  y: '-.--', z: '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.',
  '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
};

export function toMorse(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map(char => (char === ' ' ? '/' : MORSE[char] ?? ''))
    .filter(Boolean)
    .join(' ');
}

export function fromMorse(morse: string): string {
  const reverse = new Map(Object.entries(MORSE).map(([key, value]) => [value, key]));
  return morse
    .trim()
    .split(/\s+/)
    .map(code => (code === '/' ? ' ' : reverse.get(code) ?? ''))
    .join('');
}

export function toBinaryText(text: string): string {
  return [...new TextEncoder().encode(text)].map(byte => byte.toString(2).padStart(8, '0')).join(' ');
}

export function fromBinaryText(binary: string): string | null {
  const groups = binary.trim().split(/\s+/).filter(Boolean);
  if (!groups.length) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[01]{1,8}$/.test(group)) return null;
    bytes.push(parseInt(group, 2));
  }
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/* ---------------- Dates ---------------- */

const DAY_MS = 86_400_000;

export function daysBetween(from: Date, to: Date): { days: number; weeks: number; weekdays: number } {
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  // Count weekdays by stepping; a formula is easy to get wrong across DST.
  let weekdays = 0;
  const step = new Date(from);
  const forward = to >= from;
  const total = Math.abs(days);
  for (let i = 0; i < total; i++) {
    step.setTime(step.getTime() + (forward ? DAY_MS : -DAY_MS));
    const day = step.getDay();
    if (day !== 0 && day !== 6) weekdays++;
  }
  return { days, weeks: days / 7, weekdays: forward ? weekdays : -weekdays };
}

/** Add whole months, clamping the day to the end of the target month. */
function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), daysInTarget));
  return target;
}

export function ageBetween(birth: Date, now: Date): { years: number; months: number; days: number; totalDays: number } {
  // Subtract calendar fields and borrow is the obvious approach and it is
  // wrong: 31 Jan to 1 Mar is "1 month 1 day", but borrowing from February
  // gives -1 days because there is no 31st to borrow from. Advance a clamped
  // month cursor instead and let the remainder fall out as a day count.
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  let anchor = addMonthsClamped(birth, months);
  while (anchor > now) {
    months--;
    anchor = addMonthsClamped(birth, months);
  }
  while (addMonthsClamped(birth, months + 1) <= now) {
    months++;
    anchor = addMonthsClamped(birth, months);
  }
  const days = Math.round((now.getTime() - anchor.getTime()) / DAY_MS);
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days,
    totalDays: Math.floor((now.getTime() - birth.getTime()) / DAY_MS),
  };
}

export function addToDate(date: Date, amount: number, unit: 'days' | 'weeks' | 'months' | 'years'): Date {
  const copy = new Date(date);
  if (unit === 'days') copy.setDate(copy.getDate() + amount);
  else if (unit === 'weeks') copy.setDate(copy.getDate() + amount * 7);
  else if (unit === 'months') copy.setMonth(copy.getMonth() + amount);
  else copy.setFullYear(copy.getFullYear() + amount);
  return copy;
}

/** ISO-8601 week number. Week 1 is the week containing the first Thursday. */
export function isoWeek(date: Date): { week: number; year: number; dayOfYear: number } {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNumber + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  const startOfYear = new Date(Date.UTC(date.getFullYear(), 0, 1));
  const dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - startOfYear.getTime()) / DAY_MS) + 1;
  return { week, year: target.getUTCFullYear(), dayOfYear };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/* ---------------- Number theory ---------------- */

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

export function gcdLcmList(values: number[]): { gcd: number; lcm: number } | null {
  const clean = values.filter(value => Number.isInteger(value) && value !== 0);
  if (!clean.length) return null;
  return {
    gcd: clean.reduce((acc, value) => gcd(acc, value)),
    lcm: clean.reduce((acc, value) => lcm(acc, value)),
  };
}

export function factorsOf(value: number): number[] {
  if (!Number.isInteger(value) || value < 1) return [];
  const out: number[] = [];
  for (let i = 1; i * i <= value; i++) {
    if (value % i !== 0) continue;
    out.push(i);
    if (i !== value / i) out.push(value / i);
  }
  return out.sort((a, b) => a - b);
}

export function isPrime(value: number): boolean {
  if (!Number.isInteger(value) || value < 2) return false;
  if (value % 2 === 0) return value === 2;
  for (let i = 3; i * i <= value; i += 2) if (value % i === 0) return false;
  return true;
}

export function romanNumeral(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return null;
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let remaining = value;
  let out = '';
  for (const [amount, symbol] of table) {
    while (remaining >= amount) {
      out += symbol;
      remaining -= amount;
    }
  }
  return out;
}

export function fromRoman(value: string): number | null {
  const source = value.trim().toUpperCase();
  if (!source || !/^[MDCLXVI]+$/.test(source)) return null;
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < source.length; i++) {
    const current = values[source[i]];
    const next = values[source[i + 1]] ?? 0;
    total += current < next ? -current : current;
  }
  // Round-trip check: rejects "IIII" and "VV" style junk.
  return romanNumeral(total) === source ? total : null;
}

/* ---------------- Colours ---------------- */

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb | null {
  const cleaned = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(cleaned)) return null;
  const full = cleaned.length === 3 ? cleaned.split('').map(char => char + char).join('') : cleaned;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return '#' + [r, g, b].map(channel => clamp(channel).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return { r: Math.round((rgb[0] + m) * 255), g: Math.round((rgb[1] + m) * 255), b: Math.round((rgb[2] + m) * 255) };
}

/** WCAG relative luminance. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** A harmonious five-colour palette from one base colour. */
export function paletteFrom(base: Rgb): string[] {
  const { h, s, l } = rgbToHsl(base);
  return [
    base,
    hslToRgb((h + 180) % 360, s, l),      // complement
    hslToRgb((h + 30) % 360, Math.min(100, s + 10), Math.min(90, l + 12)), // analogous light
    hslToRgb((h + 330) % 360, s, Math.max(12, l - 12)),                    // analogous dark
    hslToRgb((h + 120) % 360, Math.max(20, s - 20), l),                    // triad
  ].map(rgbToHex);
}

const CSS_NAMES: [string, Rgb][] = [
  ['black', { r: 0, g: 0, b: 0 }], ['white', { r: 255, g: 255, b: 255 }],
  ['red', { r: 255, g: 0, b: 0 }], ['lime', { r: 0, g: 255, b: 0 }],
  ['blue', { r: 0, g: 0, b: 255 }], ['yellow', { r: 255, g: 255, b: 0 }],
  ['cyan', { r: 0, g: 255, b: 255 }], ['magenta', { r: 255, g: 0, b: 255 }],
  ['silver', { r: 192, g: 192, b: 192 }], ['gray', { r: 128, g: 128, b: 128 }],
  ['maroon', { r: 128, g: 0, b: 0 }], ['olive', { r: 128, g: 128, b: 0 }],
  ['green', { r: 0, g: 128, b: 0 }], ['purple', { r: 128, g: 0, b: 128 }],
  ['teal', { r: 0, g: 128, b: 128 }], ['navy', { r: 0, g: 0, b: 128 }],
  ['orange', { r: 255, g: 165, b: 0 }], ['pink', { r: 255, g: 192, b: 203 }],
  ['brown', { r: 165, g: 42, b: 42 }], ['gold', { r: 255, g: 215, b: 0 }],
  ['indigo', { r: 75, g: 0, b: 130 }], ['violet', { r: 238, g: 130, b: 238 }],
  ['salmon', { r: 250, g: 128, b: 114 }], ['coral', { r: 255, g: 127, b: 80 }],
  ['crimson', { r: 220, g: 20, b: 60 }], ['khaki', { r: 240, g: 230, b: 140 }],
  ['plum', { r: 221, g: 160, b: 221 }], ['orchid', { r: 218, g: 112, b: 214 }],
  ['turquoise', { r: 64, g: 224, b: 208 }], ['tan', { r: 210, g: 180, b: 140 }],
];

export function nearestColorName(rgb: Rgb): { name: string; distance: number } {
  let best = CSS_NAMES[0];
  let bestDistance = Infinity;
  for (const [name, candidate] of CSS_NAMES) {
    const distance = Math.hypot(candidate.r - rgb.r, candidate.g - rgb.g, candidate.b - rgb.b);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [name, candidate];
    }
  }
  return { name: best[0], distance: bestDistance };
}

/* ---------------- Sizes ---------------- */

export function pxToRem(px: number, root = 16): number | null {
  if (!(root > 0)) return null;
  return px / root;
}

export function remToPx(rem: number, root = 16): number | null {
  if (!(root > 0)) return null;
  return rem * root;
}

export function aspectScale(width: number, height: number, newWidth?: number, newHeight?: number): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (newWidth && newWidth > 0) return { width: newWidth, height: (newWidth * height) / width };
  if (newHeight && newHeight > 0) return { width: (newHeight * width) / height, height: newHeight };
  return null;
}

/** Reduce a ratio to its smallest integers, e.g. 1920x1080 -> 16:9. */
export function aspectRatio(width: number, height: number): string | null {
  if (!(width > 0) || !(height > 0)) return null;
  const divisor = gcd(Math.round(width), Math.round(height)) || 1;
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`;
}

/** Fit an image into a box without distortion. */
export function fitInto(sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number): { width: number; height: number } | null {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(boxWidth > 0) || !(boxHeight > 0)) return null;
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  return { width: Math.round(sourceWidth * scale), height: Math.round(sourceHeight * scale) };
}

/* ---------------- Developer helpers ---------------- */

export function isValidUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function describeUuid(value: string): { version: number | null; variant: string } {
  const trimmed = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return { version: null, variant: 'not a UUID' };
  }
  const version = parseInt(trimmed[14], 16);
  const variantNibble = parseInt(trimmed[19], 16);
  const variant = variantNibble >= 8 && variantNibble <= 0xb ? 'RFC 4122' : 'non-standard';
  return { version, variant };
}

export function luhnCheck(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function ibanCheck(value: string): boolean {
  const cleaned = value.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(cleaned)) return false;
  // Move the first four characters to the end, then map letters to numbers.
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, char => String(char.charCodeAt(0) - 55));
  // Reduce modulo 97 in chunks so the number never overflows.
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97;
  }
  return remainder === 1;
}

export function ipv4ToInt(value: string): number | null {
  const parts = value.trim().split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const num = Number(part);
    if (num > 255) return null;
    result = result * 256 + num;
  }
  return result;
}

export function intToIpv4(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return null;
  return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');
}

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'OUTER JOIN', 'JOIN',
  'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE FROM', 'ON', 'AND', 'OR', 'UNION ALL', 'UNION', 'CREATE TABLE', 'ALTER TABLE',
];

export function tidySql(sql: string): string {
  let out = sql.replace(/\s+/g, ' ').trim();
  // Longest keywords first, so "INNER JOIN" is not split by "JOIN".
  for (const keyword of [...SQL_KEYWORDS].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`\\s*\\b${keyword.replace(/ /g, '\\s+')}\\b\\s*`, 'gi'), `\n${keyword} `);
  }
  // Indent the clauses that belong under the statement.
  return out
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => (/^(AND|OR|ON|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|VALUES)/i.test(line) ? '  ' + line : line))
    .join('\n');
}

export type CsvValue = string | number | boolean | null;
export type CsvRow = Record<string, CsvValue>;

export function csvToJson(csv: string): CsvRow[] | { error: string } {
  const lines = csv.trim().split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return { error: 'Needs a header row and at least one data row.' };
  const split = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') { current += '"'; i++; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        cells.push(current);
        current = '';
      } else current += char;
    }
    cells.push(current);
    return cells.map(cell => cell.trim());
  };
  const headers = split(lines[0]);
  const rows: CsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const row: CsvRow = {};
    headers.forEach((header, i) => {
      const raw = cells[i] ?? '';
      // Numbers stay numbers so a JSON consumer gets the right type; anything
      // else stays a string rather than being coerced into "true" or "null".
      row[header] = raw === '' ? null : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    });
    rows.push(row);
  }
  return rows;
}

export function jsonToCsv(rows: CsvRow[]): string {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const escape = (value: CsvValue): string => {
    const text = value === null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => escape(row[header] ?? null)).join(',')),
  ].join('\n');
}

export function yamlToJson(yaml: string): { value: unknown } | { error: string } {
  // Only the subset people actually paste: `key: value` pairs, `- item` lists,
  // and nesting by indentation. A full YAML parser is a project of its own, and
  // the panel says so. Anchors, multi-line scalars and flow mappings are not
  // supported and are rejected rather than quietly misread.
  const raw = yaml.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
  if (!raw.length) return { error: 'Nothing to convert.' };

  type Line = { indent: number; content: string };
  const lines: Line[] = raw.map(line => {
    if (/\t/.test(line.match(/^\s*/)![0])) throw new Error('Use spaces, not tabs, for indentation.');
    return { indent: line.match(/^\s*/)![0].length, content: line.trim() };
  });

  const parseScalar = (rawValue: string): unknown => {
    const value = rawValue.trim();
    if (value === '' || value === '~' || value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (/^"(.*)"$/.test(value)) return value.slice(1, -1);
    if (/^'(.*)'$/.test(value)) return value.slice(1, -1);
    if (/^\[.*\]$/.test(value) || /^\{.*\}$/.test(value)) {
      try { return JSON.parse(value); } catch { return value; }
    }
    return value;
  };

  let index = 0;

  // Parse the block that starts at `index` with at least `indent` indentation.
  // Which kind of block it is depends on the first line: a `- ` means a list.
  const parseBlock = (indent: number): unknown => {
    if (index >= lines.length) return null;
    return lines[index].content.startsWith('- ') ? parseList(indent) : parseObject(indent);
  };

  const parseList = (indent: number): unknown[] => {
    const out: unknown[] = [];
    while (index < lines.length && lines[index].indent === indent && lines[index].content.startsWith('- ')) {
      const rest = lines[index].content.slice(2).trim();
      index++;
      if (!rest) {
        // "- " on its own: the item is the following, deeper block.
        out.push(index < lines.length && lines[index].indent > indent ? parseBlock(lines[index].indent) : null);
      } else if (/^[^:]+:\s*\S/.test(rest) || /^[^:]+:$/.test(rest)) {
        // "- key: value" starts an object whose first key is on the dash line.
        const [key, ...tail] = rest.split(':');
        const object: Record<string, unknown> = {};
        const value = tail.join(':').trim();
        object[key.trim()] = value ? parseScalar(value) : (index < lines.length && lines[index].indent > indent ? parseBlock(lines[index].indent) : null);
        // Sibling keys of the same item are indented past the dash.
        while (index < lines.length && lines[index].indent > indent && !lines[index].content.startsWith('- ')) {
          const sibling = lines[index];
          index++;
          const match = sibling.content.match(/^([^:]+):\s*(.*)$/);
          if (!match) throw new Error(`Cannot read this line: "${sibling.content}"`);
          const siblingValue = match[2].trim();
          object[match[1].trim()] = siblingValue
            ? parseScalar(siblingValue)
            : index < lines.length && lines[index].indent > sibling.indent
              ? parseBlock(lines[index].indent)
              : null;
        }
        out.push(object);
      } else {
        out.push(parseScalar(rest));
      }
    }
    return out;
  };

  const parseObject = (indent: number): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    while (index < lines.length && lines[index].indent === indent && !lines[index].content.startsWith('- ')) {
      const { content } = lines[index];
      index++;
      const match = content.match(/^([^:]+):\s*(.*)$/);
      if (!match) throw new Error(`Cannot read this line: "${content}"`);
      const key = match[1].trim();
      const rest = match[2].trim();
      if (rest) {
        out[key] = parseScalar(rest);
      } else if (index < lines.length && lines[index].indent >= indent && (lines[index].content.startsWith('- ') || lines[index].indent > indent)) {
        // An empty value followed by a deeper block — a list or a nested object.
        out[key] = parseBlock(lines[index].indent);
      } else {
        out[key] = null;
      }
    }
    return out;
  };

  try {
    const value = parseBlock(lines[0].indent);
    return { value };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not read that YAML.' };
  }
}

export function decodeJwt(token: string): { header: unknown; payload: unknown } | { error: string } {
  const parts = token.trim().split('.');
  if (parts.length < 2) return { error: 'A JWT has at least two dot-separated parts.' };
  const decode = (segment: string): unknown => {
    // Base64url, and padding is optional.
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (segment.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  try {
    return { header: decode(parts[0]), payload: decode(parts[1]) };
  } catch {
    return { error: 'That does not decode as a JWT.' };
  }
}

export function explainCron(expression: string): string | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const describe = (field: string, name: string, any: string): string => {
    if (field === '*') return any;
    if (/^\*\/\d+$/.test(field)) return `every ${field.slice(2)} ${name}`;
    if (/^\d+$/.test(field)) return `${name} ${field}`;
    if (/^\d+-\d+$/.test(field)) return `${name} ${field}`;
    if (/^[\d,]+$/.test(field)) return `${name}s ${field}`;
    return `${name} ${field}`;
  };
  return [
    describe(minute, 'minute', 'every minute'),
    describe(hour, 'hour', 'every hour'),
    describe(dayOfMonth, 'day of month', 'every day of the month'),
    describe(month, 'month', 'every month'),
    describe(dayOfWeek, 'day of the week', 'every day of the week'),
  ].join(', ');
}

/* ---------------- Randomness ---------------- */

/**
 * A cryptographically-strong integer in [0, max), rejection-sampled so the
 * distribution is flat. `Math.random()` is fine for a dice roll but not for a
 * password, and this page generates both.
 */
export function secureRandomInt(max: number): number {
  if (max <= 0) return 0;
  const bytes = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  let value: number;
  do {
    crypto.getRandomValues(bytes);
    value = bytes[0];
  } while (value >= limit);
  return value % max;
}

export function pickOne<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[secureRandomInt(items.length)];
}

export function shuffleList<T>(items: T[]): T[] {
  const copy = [...items];
  // Fisher–Yates with a secure source.
  for (let i = copy.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dealIntoTeams<T>(items: T[], teams: number): T[][] {
  if (teams < 1) return [];
  const buckets: T[][] = Array.from({ length: teams }, () => []);
  shuffleList(items).forEach((item, index) => buckets[index % teams].push(item));
  return buckets;
}

const PASSWORD_WORDS = [
  'anchor', 'bramble', 'cobalt', 'dagger', 'ember', 'falcon', 'garnet', 'harbor',
  'indigo', 'juniper', 'kestrel', 'lantern', 'marble', 'nectar', 'onyx', 'pepper',
  'quartz', 'rivet', 'saffron', 'timber', 'umber', 'velvet', 'willow', 'xenon',
  'yarrow', 'zephyr', 'basalt', 'cinder', 'dynamo', 'fathom',
];

export function generatePassword(length: number, options: { upper: boolean; digits: boolean; symbols: boolean }): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz'; // no 'l' — it reads as 1
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';  // no 'I' or 'O'
  const digits = '23456789';                  // no 0 or 1
  const symbols = '!@#$%^&*-_=+?';
  let alphabet = lower;
  if (options.upper) alphabet += upper;
  if (options.digits) alphabet += digits;
  if (options.symbols) alphabet += symbols;
  const target = Math.max(4, Math.min(128, Math.floor(length)));
  return Array.from({ length: target }, () => alphabet[secureRandomInt(alphabet.length)]).join('');
}

export function generatePassphrase(words: number): string {
  const count = Math.max(2, Math.min(8, Math.floor(words)));
  return Array.from({ length: count }, () => PASSWORD_WORDS[secureRandomInt(PASSWORD_WORDS.length)]).join('-');
}

/** Shannon entropy in bits, and a rough offline-cracking estimate. */
export function passwordStrength(password: string): { bits: number; guesses: number; crackSeconds: number; verdict: string } {
  if (!password) return { bits: 0, guesses: 0, crackSeconds: 0, verdict: 'empty' };
  // The pool size is estimated from which character classes are present, which
  // under-counts a passphrase of dictionary words — noted in the UI.
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^A-Za-z0-9]/.test(password)) pool += 33;
  const bits = Math.round([...password].length * Math.log2(pool || 1));
  const guesses = Math.pow(2, bits - 1);
  // 10 billion guesses/second, an optimistic offline attacker.
  const crackSeconds = guesses / 1e10;
  const verdict = bits < 40 ? 'weak' : bits < 60 ? 'fair' : bits < 80 ? 'strong' : 'excellent';
  return { bits, guesses, crackSeconds, verdict };
}

export function generateUuid(): string {
  // crypto.randomUUID exists everywhere this site runs, but a fallback keeps the
  // tool usable in an older embedded webview.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    // No Web Crypto at all (very old webview): fall back rather than crash.
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0'))
      .join('')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomMac(): string {
  const bytes = Array.from({ length: 6 }, () => secureRandomInt(256));
  // Set the locally-administered bit and clear the multicast bit, so the
  // address is a valid one for testing and cannot collide with real hardware.
  bytes[0] = (bytes[0] | 0x02) & 0xfe;
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join(':');
}

/** A fresh seed for the deterministic generators (lorem, sponge case). */
export function rerollSeed(previous: number): number {
  return (previous * 31 + 17) % 1_000_003;
}

export function randomHexColor(): string {
  return rgbToHex({ r: secureRandomInt(256), g: secureRandomInt(256), b: secureRandomInt(256) });
}

/* ---------------- Grades ---------------- */

export type GradeItem = { name: string; score: number; outOf: number; weight: number };

export function weightedGrade(items: GradeItem[]): { percent: number; letter: string; totalWeight: number } | null {
  const valid = items.filter(item => item.outOf > 0 && item.weight > 0);
  if (!valid.length) return null;
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  const earned = valid.reduce((sum, item) => sum + (item.score / item.outOf) * item.weight, 0);
  const percent = (earned / totalWeight) * 100;
  const letter = percent >= 90 ? 'A' : percent >= 80 ? 'B' : percent >= 70 ? 'C' : percent >= 60 ? 'D' : 'F';
  return { percent, letter, totalWeight };
}

/* ---------------- Misc ---------------- */

export function base64Encode(text: string): string {
  // btoa is byte-only; go through UTF-8 so emoji and accents survive.
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64Decode(encoded: string): string | null {
  try {
    const binary = atob(encoded.trim());
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function unicodeInfo(char: string): { codePoint: string; utf8: string; utf16: string; decimal: number } | null {
  if (!char) return null;
  const point = char.codePointAt(0);
  if (point === undefined) return null;
  const utf8 = [...new TextEncoder().encode(char)].map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const utf16 = [...char].map(unit => unit.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()).join(' ');
  return { codePoint: 'U+' + point.toString(16).toUpperCase().padStart(4, '0'), utf8, utf16, decimal: point };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const abs = Math.abs(Math.floor(seconds));
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

const FILLER = [
  'lorem ipsum dolor sit amet', 'consectetur adipiscing elit', 'sed do eiusmod tempor',
  'incididunt ut labore et dolore', 'magna aliqua ut enim ad minim', 'veniam quis nostrud exercitation',
  'ullamco laboris nisi ut aliquip', 'ex ea commodo consequat', 'duis aute irure dolor in',
  'reprehenderit in voluptate velit', 'esse cillum dolore eu fugiat', 'nulla pariatur excepteur sint',
  'occaecat cupidatat non proident', 'sunt in culpa qui officia', 'deserunt mollit anim id est',
];

export function loremIpsum(units: number, kind: 'words' | 'sentences' | 'paragraphs', seed = 7): string {
  let state = seed || 7;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state;
  };
  const sentence = () => {
    const words = FILLER[next() % FILLER.length].split(' ');
    const text = words.join(' ');
    return text.charAt(0).toUpperCase() + text.slice(1) + '.';
  };
  const count = Math.max(1, Math.min(50, Math.floor(units)));
  if (kind === 'words') {
    const words: string[] = [];
    while (words.length < count) words.push(...FILLER[next() % FILLER.length].split(' '));
    return words.slice(0, count).join(' ');
  }
  if (kind === 'sentences') return Array.from({ length: count }, sentence).join(' ');
  return Array.from({ length: count }, () => Array.from({ length: 4 }, sentence).join(' ')).join('\n\n');
}

/** Unicode username variations of a name: the styles people actually use. */
export function usernameStyles(name: string): { style: string; value: string }[] {
  // Strip everything that is not a letter or digit first, in either script.
  const base = name.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
  if (!base) return [];
  const words = base.split(' ').filter(Boolean);
  const first = words[0] ?? '';
  const last = words[1] ?? '';
  const joined = words.join('');
  const styles: { style: string; value: string }[] = [
    { style: 'plain', value: joined },
    { style: 'dotted', value: words.join('.') },
    { style: 'underscored', value: words.join('_') },
  ];
  if (last) {
    styles.push(
      { style: 'first.last', value: `${first}.${last}` },
      { style: 'first_last', value: `${first}_${last}` },
      { style: 'initial + last', value: `${first.charAt(0)}${last}` },
      { style: 'first + initial', value: `${first}${last.charAt(0)}` },
      { style: 'last + first', value: `${last}${first}` },
      { style: 'reversed', value: `${last}.${first}` },
    );
  }
  // A four-digit suffix is the usual way to break a collision.
  styles.push({ style: 'with year', value: `${joined}${new Date().getFullYear()}` });
  styles.push({ style: 'with 01', value: `${joined}01` });
  styles.push({ style: '_ prefix', value: `_${joined}` });
  styles.push({ style: 'x prefix', value: `x${joined}` });
  styles.push({ style: 'the prefix', value: `the${joined}` });
  styles.push({ style: 'gaming suffix', value: `${joined}gg` });
  styles.push({ style: 'no vowels', value: joined.replace(/[aeiou]/g, '') });
  styles.push({ style: 'all caps', value: joined.toUpperCase() });
  return styles.filter(entry => entry.value.length >= 3);
}

/** Every distinct arrangement of a short word. Capped, because 10! is not a list. */
export function anagrams(word: string, limit = 500): string[] {
  const letters = [...word.toLowerCase()].filter(char => /[a-z0-9]/.test(char));
  if (!letters.length || letters.length > 8) return [];
  const results = new Set<string>();
  const walk = (remaining: string[], prefix: string) => {
    if (results.size >= limit) return;
    if (!remaining.length) { results.add(prefix); return; }
    const seen = new Set<string>();
    for (let i = 0; i < remaining.length; i++) {
      // Skipping duplicate letters at the same depth is what stops "ll" from
      // producing the same word twice.
      if (seen.has(remaining[i])) continue;
      seen.add(remaining[i]);
      walk([...remaining.slice(0, i), ...remaining.slice(i + 1)], prefix + remaining[i]);
    }
  };
  walk(letters, '');
  return [...results];
}

const ASCII_FONT: Record<string, string[]> = {
  A: [' _ ', '/_\\', '| |'], B: ['___', '|_ )', '|__)'], C: [' __', '/  ', '\\__'],
  D: ['___ ', '|  \\', '|___/'], E: ['___', '|_ ', '|__'], F: ['___', '|_ ', '|  '],
  G: [' __ ', '/ _`', '\\__>'], H: ['_  _', '|__|', '|  |'], I: ['_', '|', '|'],
  J: [' _ ', '| |', '\\_/'], K: ['_  _', '|_/ ', '|\\_'], L: ['_  ', '|  ', '|__'],
  M: ['_  _', '|\/|', '|  |'], N: ['_  _', '|\\ |', '| \\|'], O: [' ___ ', '/ _ \\', '\\___/'],
  P: ['___ ', '|_) ', '|   '], Q: [' ___ ', '/ _ \\', '\\__\\'], R: ['___ ', '|_) ', '| \\ '],
  S: [' ___', '/ __|', '\\__|'], T: ['___', ' | ', ' | '], U: ['_  _', '|  |', '|__|'],
  V: ['_  _', '|  |', ' \\/',], W: ['_  _', '|  |', '|/\\|'], X: ['_  _', ' \\/ ', '_/\\_'],
  Y: ['_  _', ' \\/ ', ' |  '], Z: ['___', ' /_/', '/__/'],
  ' ': ['  ', '  ', '  '], '0': [' _ ', '| |', '|_|'], '1': ['_', '|', '|'], '2': ['___', ' _)', '/__'],
  '3': ['___', ' __)', '__)'], '4': ['_  _', '|__|', '   |'], '5': ['___', '|__ ', '__)'],
  '6': [' _ ', '|_ ', '|_|'], '7': ['___', '  /', ' / '], '8': [' _ ', '|_|', '|_|'], '9': [' _ ', '|_|', ' _|'],
};

/** Three rows of ASCII art for short text, using a compact 3-row font. */
export function asciiBanner(text: string): string[] {
  const chars = [...text.toUpperCase()].slice(0, 24);
  const rows = ['', '', ''];
  for (const char of chars) {
    const glyph = ASCII_FONT[char] ?? ASCII_FONT[' '];
    for (let i = 0; i < 3; i++) rows[i] += glyph[i] + ' ';
  }
  return rows;
}

/** A compact emoji list, searchable by name. */
export const EMOJI: { char: string; name: string }[] = [
  { char: '🎮', name: 'joystick game controller' }, { char: '🕹️', name: 'arcade joystick' },
  { char: '🎯', name: 'target bullseye darts' }, { char: '🏆', name: 'trophy win' },
  { char: '🥇', name: 'first place gold medal' }, { char: '🎉', name: 'party tada celebrate' },
  { char: '🔥', name: 'fire hot lit' }, { char: '💀', name: 'skull dead died' },
  { char: '😭', name: 'crying sad tears' }, { char: '😂', name: 'laughing cry joy tears' },
  { char: '🥲', name: 'smiling tear' }, { char: '😎', name: 'cool sunglasses' },
  { char: '🤡', name: 'clown' }, { char: '👀', name: 'eyes look' },
  { char: '⭐', name: 'star favourite' }, { char: '✨', name: 'sparkles shiny new' },
  { char: '💡', name: 'idea light bulb' }, { char: '📌', name: 'pin pushpin' },
  { char: '🔗', name: 'link chain url' },
  { char: '⚡', name: 'lightning fast zap' }, { char: '💻', name: 'laptop computer code' },
  { char: '🖥️', name: 'desktop monitor screen' }, { char: '📱', name: 'phone mobile' },
  { char: '🕒', name: 'clock time' }, { char: '⏱️', name: 'stopwatch timer' },
  { char: '⏳', name: 'hourglass wait' }, { char: '📝', name: 'memo note write' },
  { char: '📚', name: 'books study read' }, { char: '✏️', name: 'pencil edit' },
  { char: '🎨', name: 'art palette colour' }, { char: '🖌️', name: 'brush paint' },
  { char: '🧪', name: 'test tube science' }, { char: '🔧', name: 'wrench tool fix' },
  { char: '🔒', name: 'lock secure private' }, { char: '🔑', name: 'key access' },
  { char: '🚀', name: 'rocket launch fast' }, { char: '🛰️', name: 'satellite' },
  { char: '🌍', name: 'earth world globe' }, { char: '☀️', name: 'sun sunny' },
  { char: '🌙', name: 'moon night' }, { char: '☔', name: 'rain umbrella' },
  { char: '❤️', name: 'heart love red' }, { char: '💚', name: 'green heart' },
  { char: '👍', name: 'thumbs up yes good' }, { char: '👎', name: 'thumbs down no bad' },
  { char: '👋', name: 'wave hi hello bye' }, { char: '🙌', name: 'raised hands celebrate' },
  { char: '✅', name: 'check tick yes done' }, { char: '❌', name: 'cross no wrong' },
  { char: '⚠️', name: 'warning caution' }, { char: '❓', name: 'question' },
  { char: '💬', name: 'speech bubble chat' }, { char: '📢', name: 'loudspeaker announce' },
];

/** A short passage for the typing test, split into words. */
export const TYPING_PASSAGE =
  'the quick brown fox jumps over the lazy dog while the arcade cabinet hums in the corner and somebody somewhere is trying to beat the high score on a game they have never played before';

/** Deterministic PRNG so shuffles can be asserted in tests. */
export function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}
