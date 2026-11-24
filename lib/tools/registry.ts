/**
 * The tools registry.
 *
 * One entry per tool, so the page, the search box and the tests all read the
 * same list. Adding a tool means adding a component and one object here — the
 * page has no hand-written list to forget to update.
 *
 * Every tool runs entirely in the browser. That is a deliberate constraint, not
 * an accident of implementation: these are things a student reaches for during
 * class, and a tool that needs a round trip is a tool that fails on a locked-down
 * network. It also means nothing a person types into any panel leaves the page.
 */

export type ToolCategory = 'Text' | 'Numbers' | 'Time' | 'Design' | 'Dev' | 'Random';

export type Tool = {
  /** Stable id, used for the URL hash and for tests. */
  id: string;
  name: string;
  /** One line, shown on the card. */
  blurb: string;
  category: ToolCategory;
  /** Search synonyms, so "colour" finds "Color converter". */
  keywords?: string[];
};

export const TOOL_CATEGORIES: ToolCategory[] = ['Text', 'Numbers', 'Time', 'Design', 'Dev', 'Random'];

export const TOOLS: Tool[] = [
  { id: 'qr', name: 'QR generator', blurb: 'Turn a link or some text into a scannable code you can download.', category: 'Design', keywords: ['qrcode', 'barcode', 'scan', 'link'] },
  { id: 'calculator', name: 'Calculator', blurb: 'A keyboard-friendly calculator you can keep open beside your work.', category: 'Numbers', keywords: ['maths', 'arithmetic', 'sum'] },
  { id: 'unit-converter', name: 'Unit converter', blurb: 'Length, mass, volume, speed and temperature, in and out.', category: 'Numbers', keywords: ['metric', 'imperial', 'kg', 'miles', 'celsius'] },
  { id: 'base-converter', name: 'Base converter', blurb: 'Binary, octal, decimal and hex — with the bit pattern underneath.', category: 'Dev', keywords: ['binary', 'hex', 'radix'] },
  { id: 'percentage', name: 'Percentage machine', blurb: 'What is X% of Y, and X is what percent of Y, answered side by side.', category: 'Numbers', keywords: ['percent', 'discount'] },
  { id: 'password', name: 'Password generator', blurb: 'Strong random passwords with a readable strength estimate.', category: 'Random', keywords: ['secure', 'random', 'passphrase'] },
  { id: 'uuid', name: 'UUID generator', blurb: 'Version 4 identifiers, one at a time or a whole batch.', category: 'Dev', keywords: ['guid', 'identifier', 'random'] },
  { id: 'uuid-check', name: 'UUID inspector', blurb: 'Check an id is a valid v4 UUID and break it into its parts.', category: 'Dev', keywords: ['guid', 'validate'] },
  { id: 'base64', name: 'Base64 encoder', blurb: 'Text to Base64 and back, Unicode-safe.', category: 'Dev', keywords: ['encode', 'decode', 'btoa', 'atob'] },
  { id: 'url-encoder', name: 'URL encoder', blurb: 'Percent-encode a URL, or decode one that has already been mangled.', category: 'Dev', keywords: ['percent', 'escape', 'uri'] },
  { id: 'case', name: 'Case converter', blurb: 'UPPER, lower, Title, Sentence, camelCase and snake_case.', category: 'Text', keywords: ['caps', 'camel', 'snake', 'kebab'] },
  { id: 'word-count', name: 'Word & character count', blurb: 'Words, characters, sentences, paragraphs and reading time.', category: 'Text', keywords: ['count', 'length', 'essay'] },
  { id: 'case-nickname', name: 'Username styles', blurb: 'Turn a name into 20 usernames people actually read.', category: 'Text', keywords: ['nickname', 'handle'] },
  { id: 'lorem', name: 'Lorem ipsum', blurb: 'Placeholder sentences, paragraphs or headings.', category: 'Text', keywords: ['filler', 'dummy', 'placeholder'] },
  { id: 'reverse', name: 'Text reverser', blurb: 'Reverse letters, words or lines — and flip Unicode-free text.', category: 'Text', keywords: ['flip', 'mirror'] },
  { id: 'sort-lines', name: 'Line sorter', blurb: 'Sort, de-duplicate and shuffle a pasted list.', category: 'Text', keywords: ['alphabetise', 'unique', 'shuffle'] },
  { id: 'remove-dupes', name: 'Duplicate remover', blurb: 'Keep one copy of every line, and see what went.', category: 'Text', keywords: ['unique', 'dedupe'] },
  { id: 'find-replace', name: 'Find & replace', blurb: 'Replace across text with optional case and whole-word matching.', category: 'Text', keywords: ['substitute', 'swap'] },
  { id: 'text-diff', name: 'Text diff', blurb: 'Line-by-line comparison of two blocks of text.', category: 'Text', keywords: ['compare', 'changes'] },
  { id: 'slugify', name: 'Slug maker', blurb: 'Turn any heading into a URL-safe slug.', category: 'Dev', keywords: ['url', 'seo', 'kebab'] },
  { id: 'csv-json', name: 'CSV ↔ JSON', blurb: 'Convert a CSV table to JSON and back, with a preview.', category: 'Dev', keywords: ['table', 'data', 'convert'] },
  { id: 'json-format', name: 'JSON formatter', blurb: 'Pretty-print or minify JSON and point at the syntax error.', category: 'Dev', keywords: ['minify', 'valid', 'pretty'] },
  { id: 'hash', name: 'Hash generator', blurb: 'SHA-1, SHA-256 and SHA-512 fingerprints of any text.', category: 'Dev', keywords: ['sha', 'checksum', 'digest'] },
  { id: 'color-converter', name: 'Colour converter', blurb: 'HEX, RGB and HSL side by side, with a live swatch.', category: 'Design', keywords: ['colour', 'hex', 'rgb', 'hsl', 'picker'] },
  { id: 'color-palette', name: 'Palette builder', blurb: 'A harmonious five-colour palette from one starting colour.', category: 'Design', keywords: ['scheme', 'complementary', 'theme'] },
  { id: 'contrast', name: 'Contrast checker', blurb: 'WCAG contrast ratio for two colours, with pass/fail badges.', category: 'Design', keywords: ['accessibility', 'a11y', 'wcag'] },
  { id: 'px-rem', name: 'PX ↔ REM', blurb: 'Convert sizes against any root font size.', category: 'Design', keywords: ['css', 'em', 'spacing'] },
  { id: 'aspect-ratio', name: 'Aspect ratio', blurb: 'Scale one dimension and keep the ratio, or find the ratio itself.', category: 'Design', keywords: ['16:9', 'resize', 'scale'] },
  { id: 'gradient', name: 'Gradient maker', blurb: 'Two-colour CSS gradients with the CSS ready to copy.', category: 'Design', keywords: ['css', 'background'] },
  { id: 'countdown', name: 'Countdown', blurb: 'Time left until any date, to the second.', category: 'Time', keywords: ['timer', 'until', 'exam'] },
  { id: 'age', name: 'Age calculator', blurb: 'Exact age in years, months, days and total days.', category: 'Time', keywords: ['birthday', 'age'] },
  { id: 'date-diff', name: 'Date difference', blurb: 'Days, weeks and working days between two dates.', category: 'Time', keywords: ['between', 'duration', 'weekdays'] },
  { id: 'add-days', name: 'Add or subtract days', blurb: 'Move a date forward or back by days, weeks or months.', category: 'Time', keywords: ['offset', 'deadline'] },
  { id: 'stopwatch', name: 'Stopwatch & timer', blurb: 'A stopwatch and a countdown timer that keep running in the tab.', category: 'Time', keywords: ['clock', 'count down'] },
  { id: 'timestamp', name: 'Unix timestamp', blurb: 'Convert between a Unix timestamp and a readable date.', category: 'Dev', keywords: ['epoch', 'unix'] },
  { id: 'timezone', name: 'Time zone compare', blurb: 'The same moment in a handful of cities at once.', category: 'Time', keywords: ['utc', 'world clock'] },
  { id: 'roman', name: 'Roman numerals', blurb: 'Numbers to Roman numerals and back, up to 3999.', category: 'Numbers', keywords: ['latin', 'numeral'] },
  { id: 'binary', name: 'Binary playground', blurb: 'See a number as bits, and flip them.', category: 'Numbers', keywords: ['bits', 'boolean', 'byte'] },
  { id: 'gcd-lcm', name: 'GCD & LCM', blurb: 'Greatest common divisor and lowest common multiple of a list.', category: 'Numbers', keywords: ['factor', 'maths'] },
  { id: 'prime', name: 'Prime checker', blurb: 'Is it prime, and what are its factors.', category: 'Numbers', keywords: ['factor', 'prime'] },
  { id: 'random-number', name: 'Random numbers', blurb: 'Dice, coin flips and a range picker.', category: 'Random', keywords: ['dice', 'coin', 'roll'] },
  { id: 'wheel', name: 'Name picker', blurb: 'Pick a name from a list, without bias you can argue with.', category: 'Random', keywords: ['random', 'choice', 'spinner'] },
  { id: 'shuffle', name: 'List shuffler', blurb: 'Shuffle a list or deal it into teams.', category: 'Random', keywords: ['random', 'teams', 'order'] },
  { id: 'dice', name: 'Dice roller', blurb: 'Roll any number of dice with any number of sides.', category: 'Random', keywords: ['d6', 'd20', 'random'] },
  { id: 'coin', name: 'Coin flip', blurb: 'Heads or tails, with a running tally.', category: 'Random', keywords: ['flip', 'random'] },
  { id: 'bmi', name: 'BMI', blurb: 'Body mass index with the standard ranges.', category: 'Numbers', keywords: ['health', 'weight'] },
  { id: 'percentage-change', name: 'Percentage change', blurb: 'Increase or decrease between two numbers.', category: 'Numbers', keywords: ['growth', 'diff'] },
  { id: 'grade', name: 'Grade calculator', blurb: 'Assignment weights to a final percentage and letter.', category: 'Numbers', keywords: ['mark', 'score', 'school'] },
  { id: 'study-timer', name: 'Pomodoro', blurb: 'Study in 25-minute blocks with proper breaks.', category: 'Time', keywords: ['focus', 'revision'] },
  { id: 'tip', name: 'Bill splitter', blurb: 'Split a bill, tip included, per person.', category: 'Numbers', keywords: ['tip', 'restaurant', 'share'] },
  { id: 'mortgage', name: 'Loan calculator', blurb: 'Monthly repayment and total interest for any loan.', category: 'Numbers', keywords: ['interest', 'repayment'] },
  { id: 'compound', name: 'Compound interest', blurb: 'Watch a balance grow over time.', category: 'Numbers', keywords: ['interest', 'savings'] },
  { id: 'password-strength', name: 'Password strength', blurb: 'How long a password would take to guess, and why.', category: 'Dev', keywords: ['security', 'entropy'] },
  { id: 'regex-tester', name: 'Regex tester', blurb: 'Run a regular expression against text and list the matches.', category: 'Dev', keywords: ['pattern', 'match'] },
  { id: 'cron', name: 'Cron explainer', blurb: 'Describe a cron expression in plain English.', category: 'Dev', keywords: ['schedule', 'cron'] },
  { id: 'json-to-tsv', name: 'JSON to table', blurb: 'Turn an array of objects into a pasteable table.', category: 'Dev', keywords: ['csv', 'table'] },
  { id: 'luhn', name: 'Card number check', blurb: 'Luhn check for a card number — validation only, nothing stored.', category: 'Dev', keywords: ['credit', 'luhn', 'validate'] },
  { id: 'iban', name: 'IBAN check', blurb: 'Mod-97 validation of an IBAN.', category: 'Dev', keywords: ['bank', 'validate'] },
  { id: 'ip-format', name: 'IPv4 toolkit', blurb: 'Check a dotted address and convert it to one integer.', category: 'Dev', keywords: ['network', 'address'] },
  { id: 'mac', name: 'Random MAC', blurb: 'Locally-administered MAC addresses for testing.', category: 'Dev', keywords: ['network', 'hardware'] },
  { id: 'nato', name: 'NATO alphabet', blurb: 'Spell anything out over the phone.', category: 'Text', keywords: ['phonetic', 'spelling'] },
  { id: 'morse', name: 'Morse code', blurb: 'Text to Morse and back, playable.', category: 'Text', keywords: ['dots', 'dashes'] },
  { id: 'binary-text', name: 'Text ↔ binary', blurb: 'See text as bytes of ones and zeroes.', category: 'Text', keywords: ['bits', 'ascii'] },
  { id: 'text-stats', name: 'Reading level', blurb: 'Average word length, sentence length and reading time.', category: 'Text', keywords: ['essay', 'readability'] },
  { id: 'acronym', name: 'Acronym maker', blurb: 'Build an acronym from a phrase.', category: 'Text', keywords: ['initials', 'abbreviation'] },
  { id: 'anagram', name: 'Anagram solver', blurb: 'Every arrangement of a short word.', category: 'Text', keywords: ['letters', 'permute'] },
  { id: 'palindrome', name: 'Palindrome check', blurb: 'Is it the same backwards, ignoring case and punctuation.', category: 'Text', keywords: ['reverse', 'wordplay'] },
  { id: 'letter-frequency', name: 'Letter frequency', blurb: 'Which letters a passage leans on, as a bar chart.', category: 'Text', keywords: ['count', 'analysis'] },
  { id: 'quote', name: 'Random quote', blurb: 'A short line to put on a slide.', category: 'Random', keywords: ['inspiration', 'text'] },
  { id: 'name-generator', name: 'Name generator', blurb: 'Character and project names from syllable pieces.', category: 'Random', keywords: ['fantasy', 'character'] },
  { id: 'colour-random', name: 'Random colour', blurb: 'A random colour with its codes, and a copy button.', category: 'Random', keywords: ['colour', 'random'] },
  { id: 'timer-beep', name: 'Beep timer', blurb: 'A countdown that actually makes a noise when it ends.', category: 'Time', keywords: ['alarm', 'sound'] },
  { id: 'world-clock', name: 'World clock', blurb: 'The current time in the places your classmates are from.', category: 'Time', keywords: ['timezone'] },
  { id: 'week-number', name: 'Week number', blurb: 'ISO week number and day of year for any date.', category: 'Time', keywords: ['iso', 'calendar'] },
  { id: 'leap-year', name: 'Leap year', blurb: 'Is it a leap year, and the next ones.', category: 'Time', keywords: ['calendar'] },
  { id: 'unicode-lookup', name: 'Unicode lookup', blurb: 'Code point, UTF-8 bytes and name fragments for any character.', category: 'Dev', keywords: ['codepoint', 'utf8'] },
  { id: 'emoji-search', name: 'Emoji finder', blurb: 'Search a compact set of emoji by name and copy one.', category: 'Text', keywords: ['emoji', 'symbol'] },
  { id: 'ascii-art', name: 'ASCII banner', blurb: 'Big letters made of characters for console headers.', category: 'Text', keywords: ['banner', 'figlet'] },
  { id: 'sponge', name: 'SpongeCase', blurb: 'Mocking spongebob case, because someone had to.', category: 'Text', keywords: ['meme', 'case'] },
  { id: 'fancy-text', name: 'Fancy text', blurb: 'Bold, italic and fullwidth Unicode variants.', category: 'Text', keywords: ['unicode', 'font'] },
  { id: 'json-diff', name: 'JSON compare', blurb: 'Which keys differ between two JSON objects.', category: 'Dev', keywords: ['diff', 'compare'] },
  { id: 'sql-format', name: 'SQL tidy', blurb: 'Put keywords on their own lines so a query is readable.', category: 'Dev', keywords: ['sql', 'format'] },
  { id: 'yaml-json', name: 'YAML → JSON', blurb: 'Convert simple indented YAML to JSON.', category: 'Dev', keywords: ['yaml', 'convert'] },
  { id: 'env-sort', name: 'Env sorter', blurb: 'Sort a .env file and flag duplicate keys.', category: 'Dev', keywords: ['dotenv', 'config'] },
  { id: 'jwt', name: 'JWT decoder', blurb: 'Read the header and payload of a token. Not a verifier.', category: 'Dev', keywords: ['token', 'jwt'] },
  { id: 'color-name', name: 'Colour names', blurb: 'Find the nearest CSS colour name to a hex value.', category: 'Design', keywords: ['named', 'css'] },
  { id: 'border-radius', name: 'Border radius', blurb: 'Preview a squircle and copy the CSS.', category: 'Design', keywords: ['css', 'rounded'] },
  { id: 'box-shadow', name: 'Box shadow', blurb: 'Build a shadow with the sliders, copy the CSS.', category: 'Design', keywords: ['css', 'shadow'] },
  { id: 'font-pair', name: 'Font pairing', blurb: 'Three pairings that do not fight each other.', category: 'Design', keywords: ['type', 'typography'] },
  { id: 'svg-grid', name: 'SVG grid', blurb: 'An inline SVG grid you can paste behind a layout.', category: 'Design', keywords: ['pattern', 'background'] },
  { id: 'image-size', name: 'Aspect fit', blurb: 'Fit an image into a box without distortion.', category: 'Design', keywords: ['resize', 'letterbox'] },
  { id: 'cron-next', name: 'Cron next runs', blurb: 'The next few times a simple schedule fires.', category: 'Dev', keywords: ['schedule'] },
  { id: 'speed-test', name: 'Typing test', blurb: 'Words per minute on a short passage.', category: 'Text', keywords: ['typing', 'wpm'] },
  { id: 'keyboard-test', name: 'Key tester', blurb: 'Which key did that event actually report.', category: 'Dev', keywords: ['event', 'keycode'] },
  { id: 'mouse-test', name: 'Mouse tester', blurb: 'Position, button and scroll readout.', category: 'Dev', keywords: ['event', 'coordinates'] },
  { id: 'screen-info', name: 'Screen info', blurb: 'Viewport, pixel ratio, colour depth and time zone.', category: 'Dev', keywords: ['display', 'browser'] },
  { id: 'ua-info', name: 'Browser info', blurb: 'What the browser will admit about itself.', category: 'Dev', keywords: ['user agent', 'browser'] },
  { id: 'storage-info', name: 'Storage usage', blurb: 'How much this site is using in your browser, and clear it.', category: 'Dev', keywords: ['localstorage', 'cache'] },
  { id: 'ffmpeg-note', name: 'Video trim planner', blurb: 'Work out cut points and the resulting clip length before you edit.', category: 'Time', keywords: ['video', 'trim', 'clip'] },
  { id: 'file-hash', name: 'File fingerprint', blurb: 'SHA-256 of a file you pick, computed locally.', category: 'Dev', keywords: ['checksum', 'sha', 'verify'] },
];

/** Group tools by category, preserving the declared category order. */
export function toolsByCategory(): { category: ToolCategory; tools: Tool[] }[] {
  return TOOL_CATEGORIES.map(category => ({
    category,
    tools: TOOLS.filter(tool => tool.category === category),
  })).filter(group => group.tools.length > 0);
}

/** Search by name, blurb and keywords. */
export function searchTools(query: string): Tool[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return TOOLS;
  return TOOLS.filter(tool =>
    tool.name.toLowerCase().includes(needle) ||
    tool.blurb.toLowerCase().includes(needle) ||
    tool.category.toLowerCase().includes(needle) ||
    (tool.keywords ?? []).some(keyword => keyword.includes(needle)),
  );
}

/** The default tool shown when the page loads without a hash. */
export const DEFAULT_TOOL = 'qr';
