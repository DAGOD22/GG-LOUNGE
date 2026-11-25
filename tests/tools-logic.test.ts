/**
 * The arithmetic behind the tools page.
 *
 * These are the cases that were wrong at some point while writing them, or that
 * a reader would reasonably doubt: operator precedence, the zero-interest loan
 * (which divides by zero if you take the annuity formula at face value), the
 * reversed-block split, the ISO week that lands in the previous year, and
 * Base64 with characters that are more than one byte wide.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateExpression, formatNumber,
  convertUnit, convertBase, unitOptions,
  percentOf, whatPercent, percentChange,
  splitBill, loanPayment, compoundInterest, bmi,
  textStats, toTitleCase, toSentenceCase, toCamelCase, toSnakeCase, toKebabCase,
  toConstantCase, slugify, reverseText, sortLines, dedupeLines, findReplace,
  diffLines, letterFrequency, isPalindrome, acronym, toNato, toMorse, fromMorse,
  toBinaryText, fromBinaryText, daysBetween, ageBetween, addToDate, isoWeek,
  isLeapYear, gcd, lcm, gcdLcmList, factorsOf, isPrime, romanNumeral, fromRoman,
  parseHex, rgbToHex, rgbToHsl, hslToRgb, luminance, contrastRatio, paletteFrom,
  nearestColorName, pxToRem, remToPx, aspectRatio, aspectScale, fitInto,
  isValidUuidV4, describeUuid, luhnCheck, ibanCheck, ipv4ToInt, intToIpv4,
  tidySql, csvToJson, jsonToCsv, yamlToJson, decodeJwt, explainCron,
  generatePassword, generatePassphrase, passwordStrength, generateUuid,
  randomMac, weightedGrade, base64Encode, base64Decode, unicodeInfo,
  formatBytes, formatDuration, loremIpsum, seededRandom, pickOne, shuffleList,
  dealIntoTeams, secureRandomInt,
} from '@/lib/tools/logic';
import { TOOLS, searchTools, toolsByCategory, DEFAULT_TOOL } from '@/lib/tools/registry';

/* ---------------- calculator ---------------- */

test('the calculator respects precedence, parentheses and powers', () => {
  assert.equal(evaluateExpression('2+3*4'), 14);
  assert.equal(evaluateExpression('(2+3)*4'), 20);
  assert.equal(evaluateExpression('2^3^2'), 512, 'powers are right-associative');
  assert.equal(evaluateExpression('-3+1'), -2);
  assert.equal(evaluateExpression('10/4'), 2.5);
  assert.equal(evaluateExpression('7%4'), 3);
  assert.equal(evaluateExpression('1e3+1'), 1001);
  assert.equal(evaluateExpression(' 2 × 3 − 1 '), 5, 'display glyphs are accepted');
  assert.equal(evaluateExpression('2÷4'), 0.5);
});

test('the calculator refuses what it cannot evaluate instead of guessing', () => {
  assert.equal(evaluateExpression(''), null);
  assert.equal(evaluateExpression('1/0'), null);
  assert.equal(evaluateExpression('5%0'), null);
  assert.equal(evaluateExpression('2+'), null);
  assert.equal(evaluateExpression('(1+2'), null);
  assert.equal(evaluateExpression('1+2)'), null);
  assert.equal(evaluateExpression('alert(1)'), null, 'never eval input');
  assert.equal(evaluateExpression('window'), null);
  assert.equal(evaluateExpression('2 3'), null);
});

test('numbers display without floating point noise', () => {
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
  assert.equal(formatNumber(5), '5');
  assert.equal(formatNumber(1 / 3, 4), '0.3333');
  assert.equal(formatNumber(Infinity), '—');
});

/* ---------------- units ---------------- */

test('units convert through their base with the expected accuracy', () => {
  assert.equal(convertUnit('length', 1, 'mi', 'km'), 1.609344);
  assert.equal(convertUnit('length', 100, 'cm', 'm'), 1);
  assert.equal(convertUnit('mass', 1, 'kg', 'lb'), 2.2046226218487757);
  assert.equal(convertUnit('data', 1, 'MB', 'KB'), 1024);
  // Megabits are bits, not bytes: 1 Mb = 128 KB, the distinction that makes
  // "100 Mb/s" look bigger than it is on a speed test.
  assert.equal(convertUnit('data', 1, 'Mb', 'KB'), 128);
  assert.equal(convertUnit('data', 1, 'Mb', 'MB'), 0.125);
  assert.ok(Math.abs(convertUnit('speed', 100, 'km/h', 'mph')! - 62.1371192237334) < 1e-9);
  assert.equal(convertUnit('length', 1, 'furlong', 'm'), null, 'unknown units are rejected');
});

test('temperature is not a single multiplication', () => {
  assert.equal(convertUnit('temperature', 100, 'C', 'F'), 212);
  assert.equal(convertUnit('temperature', 32, 'F', 'C'), 0);
  assert.equal(convertUnit('temperature', 0, 'C', 'K'), 273.15);
  assert.equal(convertUnit('temperature', 0, 'K', 'C'), -273.15);
  assert.equal(convertUnit('temperature', 0, 'C', 'X'), null);
});

test('unit options come from the same table as the conversions', () => {
  assert.deepEqual(unitOptions('length').slice(0, 3), ['mm', 'cm', 'm']);
  assert.ok(unitOptions('data').includes('GB'));
});

test('bases convert and reject digits that do not belong', () => {
  assert.equal(convertBase('ff', 16, 10), '255');
  assert.equal(convertBase('255', 10, 2), '11111111');
  assert.equal(convertBase('0b1010', 2, 16), 'A');
  assert.equal(convertBase('7', 8, 10), '7');
  assert.equal(convertBase('2', 2, 10), null, 'a binary 2 is not a digit');
  assert.equal(convertBase('', 10, 16), null);
});

/* ---------------- percentages and money ---------------- */

test('percentage helpers handle the zero cases', () => {
  assert.equal(percentOf(20, 50), 10);
  assert.equal(whatPercent(25, 200), 12.5);
  assert.equal(whatPercent(1, 0), null);
  assert.equal(percentChange(100, 150), 50);
  assert.equal(percentChange(100, 50), -50);
  assert.equal(percentChange(0, 50), null);
});

test('a bill splits per person, tip included', () => {
  const split = splitBill(100, 4, 10)!;
  assert.equal(split.tip, 10);
  assert.equal(split.total, 110);
  assert.equal(split.each, 27.5);
  assert.equal(splitBill(100, 0, 10), null);
});

test('a zero-interest loan is handled without dividing by zero', () => {
  const free = loanPayment(12_000, 0, 1)!;
  assert.equal(free.monthly, 1000);
  assert.equal(Math.round(free.interest), 0);
  const loan = loanPayment(500_000, 6, 30)!;
  // The classic 30-year repayment on 500k at 6% is about 2997.75/month.
  assert.ok(Math.abs(loan.monthly - 2997.75) < 0.5, `got ${loan.monthly}`);
  assert.ok(loan.interest > 0);
  assert.equal(loanPayment(0, 5, 10), null);
});

test('compound interest compounds', () => {
  const result = compoundInterest(1000, 10, 1, 12)!;
  // 1000 * (1 + 0.1/12)^12
  assert.ok(Math.abs(result.final - 1104.71) < 0.01, `got ${result.final}`);
  assert.equal(compoundInterest(0, 5, 5), null);
});

test('BMI bands', () => {
  assert.equal(bmi(70, 1.75)!.band, 'Healthy range');
  assert.equal(bmi(50, 1.8)!.band, 'Underweight');
  assert.equal(bmi(100, 1.7)!.band, 'Obese');
  assert.equal(bmi(70, 0), null);
});

/* ---------------- text ---------------- */

test('text stats count what a person would count', () => {
  const stats = textStats('Hello world. This is a test!\n\nSecond paragraph.');
  assert.equal(stats.words, 8);
  assert.equal(stats.sentences, 3);
  assert.equal(stats.paragraphs, 2);
  // 47 characters total, 39 once the spaces and the newlines are removed.
  assert.equal(stats.characters, 47);
  assert.equal(stats.charactersNoSpaces, 39);
  assert.ok(stats.readingSeconds >= 1);
  // No terminator: still one sentence, not zero.
  assert.equal(textStats('just words').sentences, 1);
  assert.equal(textStats('').sentences, 0);
});

test('case conversions agree with each other', () => {
  const source = 'hello big world';
  assert.equal(toTitleCase(source), 'Hello Big World');
  assert.equal(toCamelCase('hello big world'), 'helloBigWorld');
  assert.equal(toCamelCase('hello_big-world'), 'helloBigWorld');
  assert.equal(toSnakeCase('helloBigWorld'), 'hello_big_world');
  assert.equal(toKebabCase('Hello Big World'), 'hello-big-world');
  assert.equal(toConstantCase('hello big world'), 'HELLO_BIG_WORLD');
  assert.equal(toSentenceCase('hello. world again'), 'Hello. World again');
});

test('slugify drops accents rather than their letters', () => {
  assert.equal(slugify('Café Society!'), 'cafe-society');
  assert.equal(slugify('  ---Hello---  '), 'hello');
  assert.equal(slugify('a'.repeat(200)).length, 80);
});

test('reversing does not tear surrogate pairs apart', () => {
  assert.equal(reverseText('abc', 'characters'), 'cba');
  assert.equal(reverseText('one two three', 'words'), 'three two one');
  assert.equal(reverseText('a\nb\nc', 'lines'), 'c\nb\na');
  const emoji = '🎮ab';
  assert.equal(reverseText(emoji, 'characters'), 'ba🎮');
});

test('sorting is numeric-aware and can dedupe', () => {
  assert.equal(sortLines('item10\nitem2\nitem1', { direction: 'asc', unique: false, trim: true }), 'item1\nitem2\nitem10');
  assert.equal(sortLines('b\na\nb', { direction: 'asc', unique: true, trim: true }), 'a\nb');
  assert.equal(sortLines('a\nb', { direction: 'desc', unique: false, trim: true }), 'b\na');
});

test('dedupe reports how many lines it removed', () => {
  const result = dedupeLines('a\nb\na\nc\nb');
  assert.equal(result.kept, 'a\nb\nc');
  assert.equal(result.removed, 2);
});

test('find and replace counts and respects options', () => {
  // Replacement is literal: the replacement text does not take on the case of
  // what it replaced, which is what the "dog Dog" version of this asserted and
  // it is not what String.replace does.
  assert.deepEqual(findReplace('cat Cat catalog', 'cat', 'dog', { caseSensitive: false, wholeWord: true }), { result: 'dog dog catalog', count: 2 });
  assert.equal(findReplace('aaa', 'a', 'b', { caseSensitive: true, wholeWord: false }).count, 3);
  assert.equal(findReplace('abc', '', 'x', { caseSensitive: true, wholeWord: false }).count, 0);
  // A regex-looking search string must be treated literally.
  assert.equal(findReplace('a.b', '.', '-', { caseSensitive: true, wholeWord: false }).result, 'a-b');
});

test('the diff marks additions and removals', () => {
  const diff = diffLines('one\ntwo\nthree', 'one\nthree\nfour');
  assert.deepEqual(diff.map(line => line.kind), ['same', 'removed', 'same', 'added']);
  assert.deepEqual(diffLines('same', 'same').map(line => line.kind), ['same']);
});

test('letter frequency ignores everything that is not a letter', () => {
  const freq = letterFrequency('Hello, world! 123');
  assert.deepEqual(freq[0], { letter: 'l', count: 3 });
  assert.equal(freq.reduce((sum, item) => sum + item.count, 0), 10);
});

test('palindrome ignores case and punctuation', () => {
  assert.ok(isPalindrome('A man, a plan, a canal: Panama'));
  assert.ok(!isPalindrome('almost'));
  assert.ok(!isPalindrome(''));
});

test('acronyms keep every word but the filler', () => {
  // "as" is not on the skip list (it is a real word in a title, unlike "of"),
  // so the joke phrase comes out as ASAP.
  assert.equal(acronym('as soon as possible'), 'ASAP');
  assert.equal(acronym('The Lord of the Rings'), 'LR');
  assert.equal(acronym('portable network graphics'), 'PNG');
});

test('NATO, Morse and binary round-trip', () => {
  assert.deepEqual(toNato('a1 b'), ['Alfa', 'One', '/', 'Bravo']);
  const morse = toMorse('sos');
  assert.equal(morse, '... --- ...');
  assert.equal(fromMorse(morse), 'sos');
  assert.equal(fromMorse(toMorse('hello world')), 'hello world');
  const binary = toBinaryText('Hi');
  assert.equal(binary, '01001000 01101001');
  assert.equal(fromBinaryText(binary), 'Hi');
  assert.equal(fromBinaryText('01001000 0110x1'), null);
});

/* ---------------- dates ---------------- */

test('day counts include weekdays', () => {
  const result = daysBetween(new Date(2024, 0, 1), new Date(2024, 0, 8));
  assert.equal(result.days, 7);
  assert.equal(result.weekdays, 5, 'one full working week');
  assert.equal(daysBetween(new Date(2024, 0, 1), new Date(2023, 0, 1)).days, -365);
});

test('age is exact across month boundaries', () => {
  const age = ageBetween(new Date(2000, 0, 31), new Date(2000, 2, 1));
  assert.deepEqual({ years: age.years, months: age.months, days: age.days }, { years: 0, months: 1, days: 1 });
  const older = ageBetween(new Date(2000, 5, 15), new Date(2024, 5, 15));
  assert.equal(older.years, 24);
  assert.equal(older.totalDays, Math.floor((new Date(2024, 5, 15).getTime() - new Date(2000, 5, 15).getTime()) / 86400000));
});

test('adding to a date rolls over correctly', () => {
  assert.equal(addToDate(new Date(2024, 0, 31), 1, 'months').getMonth(), 2, 'Jan 31 + 1 month lands in March');
  assert.equal(addToDate(new Date(2024, 0, 1), 7, 'days').getDate(), 8);
  assert.equal(addToDate(new Date(2024, 0, 1), 1, 'years').getFullYear(), 2025);
});

test('ISO weeks handle the year boundary', () => {
  // 2021-01-01 is in ISO week 53 of 2020.
  assert.deepEqual(isoWeek(new Date(2021, 0, 1)), { week: 53, year: 2020, dayOfYear: 1 });
  assert.equal(isoWeek(new Date(2024, 0, 4)).week, 1);
  assert.equal(isoWeek(new Date(2024, 11, 31)).week, 1);
  assert.equal(isoWeek(new Date(2024, 11, 31)).year, 2025);
});

test('leap years follow the century rule', () => {
  assert.ok(isLeapYear(2024));
  assert.ok(!isLeapYear(2023));
  assert.ok(!isLeapYear(1900), '1900 is divisible by 100 but not 400');
  assert.ok(isLeapYear(2000));
});

/* ---------------- number theory ---------------- */

test('gcd and lcm', () => {
  assert.equal(gcd(12, 18), 6);
  assert.equal(gcd(-12, 18), 6);
  assert.equal(lcm(4, 6), 12);
  assert.equal(lcm(0, 5), 0);
  assert.deepEqual(gcdLcmList([4, 6, 8]), { gcd: 2, lcm: 24 });
  assert.equal(gcdLcmList([0]), null, 'there is no gcd of nothing');
  // 2.5 is dropped, so the answer is just 4 on its own.
  assert.deepEqual(gcdLcmList([2.5, 4]), { gcd: 4, lcm: 4 }, 'non-integers are ignored, not rounded');
});

test('factors and primality', () => {
  assert.deepEqual(factorsOf(12), [1, 2, 3, 4, 6, 12]);
  assert.deepEqual(factorsOf(16), [1, 2, 4, 8, 16], 'the square root is not listed twice');
  assert.ok(isPrime(2));
  assert.ok(isPrime(104729));
  assert.ok(!isPrime(1));
  assert.ok(!isPrime(91));
  assert.ok(!isPrime(0));
});

test('Roman numerals round-trip and reject junk', () => {
  assert.equal(romanNumeral(1994), 'MCMXCIV');
  assert.equal(romanNumeral(4000), null);
  assert.equal(fromRoman('MCMXCIV'), 1994);
  assert.equal(fromRoman('IIII'), null, 'non-canonical forms are rejected');
  assert.equal(fromRoman('hello'), null);
});

/* ---------------- colour ---------------- */

test('hex parsing handles short form and rejects nonsense', () => {
  assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHex('0000ff'), { r: 0, g: 0, b: 255 });
  assert.equal(parseHex('#ffff'), null);
  assert.equal(parseHex('javascript:'), null);
});

test('colour conversions are stable both ways', () => {
  assert.equal(rgbToHex({ r: 255, g: 0, b: 0 }), '#ff0000');
  assert.equal(rgbToHex({ r: 300, g: -5, b: 12.6 }), '#ff000d', 'channels are clamped and rounded');
  const hsl = rgbToHsl({ r: 0, g: 128, b: 255 });
  const back = hslToRgb(hsl.h, hsl.s, hsl.l);
  assert.ok(Math.abs(back.g - 128) <= 1 && Math.abs(back.b - 255) <= 1, `round trip gave ${JSON.stringify(back)}`);
  assert.deepEqual(rgbToHsl({ r: 255, g: 255, b: 255 }), { h: 0, s: 0, l: 100 });
});

test('contrast ratio matches the WCAG reference values', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  assert.equal(Math.round(contrastRatio(black, white) * 100) / 100, 21);
  assert.equal(contrastRatio(black, black), 1);
  assert.equal(luminance(white), 1);
});

test('palettes start from the base colour', () => {
  const palette = paletteFrom({ r: 200, g: 40, b: 40 });
  assert.equal(palette.length, 5);
  assert.equal(palette[0], '#c82828');
  assert.ok(new Set(palette).size >= 4, 'the palette should not collapse to one colour');
});

test('nearest colour name finds something sensible', () => {
  assert.equal(nearestColorName({ r: 250, g: 5, b: 5 }).name, 'red');
  assert.equal(nearestColorName({ r: 1, g: 1, b: 1 }).name, 'black');
});

/* ---------------- sizes ---------------- */

test('px and rem convert against a custom root', () => {
  assert.equal(pxToRem(24), 1.5);
  assert.equal(pxToRem(24, 10), 2.4);
  assert.equal(remToPx(1.5), 24);
  assert.equal(pxToRem(24, 0), null);
});

test('aspect ratios reduce and scale', () => {
  assert.equal(aspectRatio(1920, 1080), '16:9');
  assert.equal(aspectRatio(1000, 1000), '1:1');
  assert.equal(aspectRatio(0, 10), null);
  assert.deepEqual(aspectScale(1920, 1080, 960), { width: 960, height: 540 });
  assert.deepEqual(fitInto(1920, 1080, 800, 800), { width: 800, height: 450 });
});

/* ---------------- developer helpers ---------------- */

test('UUID v4 validation is strict about the version and variant nibbles', () => {
  assert.ok(isValidUuidV4('3f2504e0-4f89-41d3-9a0c-0305e82c3301'));
  assert.ok(!isValidUuidV4('3f2504e0-4f89-11d3-9a0c-0305e82c3301'), 'version nibble must be 4');
  assert.ok(!isValidUuidV4('nope'));
  assert.deepEqual(describeUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301'), { version: 4, variant: 'RFC 4122' });
  assert.deepEqual(describeUuid('nope'), { version: null, variant: 'not a UUID' });
});

test('the Luhn check accepts test card numbers', () => {
  assert.ok(luhnCheck('4242 4242 4242 4242'));
  assert.ok(luhnCheck('4111111111111111'));
  assert.ok(!luhnCheck('4111111111111112'));
  assert.ok(!luhnCheck('123'));
});

test('IBAN mod-97 validation', () => {
  assert.ok(ibanCheck('GB82 WEST 1234 5698 7654 32'));
  assert.ok(!ibanCheck('GB82 WEST 1234 5698 7654 33'));
  assert.ok(!ibanCheck('nonsense'));
});

test('IPv4 converts to an integer and back', () => {
  assert.equal(ipv4ToInt('192.168.0.1'), 3232235521);
  assert.equal(intToIpv4(3232235521), '192.168.0.1');
  assert.equal(ipv4ToInt('256.1.1.1'), null);
  assert.equal(ipv4ToInt('1.2.3'), null);
  assert.equal(intToIpv4(-1), null);
});

test('SQL tidying puts clauses on their own lines', () => {
  const tidy = tidySql('select a from t where b = 1 and c = 2 order by a');
  assert.match(tidy, /^SELECT/);
  assert.match(tidy, /\nFROM t/);
  assert.match(tidy, /\n  AND c = 2/);
});

test('CSV and JSON convert in both directions, quoting included', () => {
  const rows = csvToJson('name,age,note\nAda,36,"likes, commas"\nGrace,45,') as Record<string, unknown>[];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Ada');
  assert.equal(rows[0].age, 36, 'numbers stay numbers');
  assert.equal(rows[0].note, 'likes, commas');
  assert.equal(rows[1].note, null, 'an empty cell becomes null, not ""');
  const csv = jsonToCsv([{ a: 1, b: 'x,y' }]);
  assert.equal(csv, 'a,b\n1,"x,y"');
  assert.deepEqual(csvToJson('onlyone'), { error: 'Needs a header row and at least one data row.' });
});

test('YAML subset conversion', () => {
  const result = yamlToJson('name: test\ncount: 3\nflags:\n  - a\n  - b\n');
  assert.ok('value' in result);
  assert.deepEqual((result as { value: unknown }).value, { name: 'test', count: 3, flags: ['a', 'b'] });
  assert.ok('error' in yamlToJson(''));

  // The shape that actually gets pasted: a list of objects with sibling keys.
  const nested = yamlToJson('users:\n  - name: Ada\n    age: 36\n  - name: Grace\n    age: 45\n');
  assert.deepEqual((nested as { value: unknown }).value, {
    users: [{ name: 'Ada', age: 36 }, { name: 'Grace', age: 45 }],
  });
  // Deep nesting.
  assert.deepEqual((yamlToJson('a:\n  b:\n    c: 1\n') as { value: unknown }).value, { a: { b: { c: 1 } } });
  // Quoted scalars keep their spaces.
  assert.deepEqual((yamlToJson('title: " hello "\n') as { value: unknown }).value, { title: ' hello ' });
});

test('JWT decoding reads header and payload, and fails loudly', () => {
  // {"alg":"HS256","typ":"JWT"}.{"sub":"1234"}.sig
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.sig';
  const decoded = decodeJwt(token);
  assert.ok('header' in decoded);
  assert.deepEqual((decoded as { payload: unknown }).payload, { sub: '1234' });
  assert.ok('error' in decodeJwt('nodots'));
  assert.ok('error' in decodeJwt('a.b'));
});

test('cron descriptions cover the common shapes', () => {
  assert.match(explainCron('* * * * *')!, /every minute/);
  assert.match(explainCron('*/5 * * * *')!, /every 5 minute/);
  assert.equal(explainCron('* * *'), null);
});

/* ---------------- randomness ---------------- */

test('random helpers stay inside their bounds', () => {
  for (let i = 0; i < 50; i++) {
    const value = secureRandomInt(6);
    assert.ok(value >= 0 && value < 6, `got ${value}`);
  }
  assert.equal(secureRandomInt(0), 0);
  assert.equal(pickOne([]), null);
  const shuffled = shuffleList([1, 2, 3, 4, 5]);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), [1, 2, 3, 4, 5], 'shuffle keeps every item');
  const teams = dealIntoTeams([1, 2, 3, 4, 5], 2);
  assert.equal(teams.length, 2);
  assert.equal(teams.flat().length, 5);
});

test('passwords honour their options and never include ambiguous glyphs', () => {
  const password = generatePassword(20, { upper: true, digits: true, symbols: true });
  assert.equal(password.length, 20);
  // Class membership is per-draw, not guaranteed: 20 characters from a 76-glyph
  // alphabet miss digits about one run in twelve, which made this test flaky.
  // Assert the classes across a batch instead of demanding them from one draw.
  const batch = Array.from({ length: 40 }, () => generatePassword(20, { upper: true, digits: true, symbols: true })).join('');
  assert.match(batch, /[A-Z]/);
  assert.match(batch, /[a-z]/);
  assert.match(batch, /\d/);
  assert.match(batch, /[!@#$%^&*\-_=+?]/);
  for (const sample of [password, batch]) {
    assert.doesNotMatch(sample, /[lIO01]/, 'the ambiguous characters are excluded on purpose');
  }
  // A tiny alphabet of one class must not sneak in other classes.
  const lowerOnly = generatePassword(12, { upper: false, digits: false, symbols: false });
  assert.match(lowerOnly, /^[a-z]+$/);
  assert.equal(generatePassword(2, { upper: false, digits: false, symbols: false }).length, 4, 'minimum length is enforced');
});

test('passphrases are readable words joined by dashes', () => {
  const phrase = generatePassphrase(4);
  assert.equal(phrase.split('-').length, 4);
  assert.match(phrase, /^[a-z-]+$/);
});

test('strength estimates grow with length and variety', () => {
  const weak = passwordStrength('abc');
  const strong = passwordStrength('7Yq$2vLm!Pz9RtXw');
  assert.ok(strong.bits > weak.bits);
  assert.equal(weak.verdict, 'weak');
  assert.ok(['strong', 'excellent'].includes(strong.verdict));
  assert.equal(passwordStrength('').bits, 0);
});

test('UUIDs are valid version 4 values', () => {
  const ids = new Set(Array.from({ length: 100 }, generateUuid));
  assert.equal(ids.size, 100, 'they must not repeat');
  for (const id of ids) assert.ok(isValidUuidV4(id), id);
});

test('random MACs are locally administered unicast addresses', () => {
  for (let i = 0; i < 20; i++) {
    const mac = randomMac();
    assert.match(mac, /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/);
    const firstOctet = parseInt(mac.slice(0, 2), 16);
    assert.equal(firstOctet & 0x01, 0, 'multicast bit must be clear');
    assert.equal(firstOctet & 0x02, 0x02, 'locally administered bit must be set');
  }
});

/* ---------------- grading and formatting ---------------- */

test('weighted grades use the weight that was actually used', () => {
  const grade = weightedGrade([
    { name: 'exam', score: 80, outOf: 100, weight: 50 },
    { name: 'essay', score: 9, outOf: 10, weight: 50 },
  ])!;
  assert.equal(grade.percent, 85);
  assert.equal(grade.letter, 'B');
  assert.equal(grade.totalWeight, 100);
  assert.equal(weightedGrade([{ name: 'x', score: 1, outOf: 0, weight: 1 }]), null);
});

test('base64 survives multi-byte text', () => {
  const encoded = base64Encode('héllo 🎮');
  assert.equal(base64Decode(encoded), 'héllo 🎮');
  assert.equal(base64Decode('!!!!'), null);
});

test('Unicode inspector reports code point and encodings', () => {
  const info = unicodeInfo('€')!;
  assert.equal(info.codePoint, 'U+20AC');
  assert.equal(info.decimal, 8364);
  assert.equal(info.utf8, 'E2 82 AC');
  assert.equal(unicodeInfo(''), null);
});

test('byte and duration formatting stays readable', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(5 * 1024 ** 3), '5.0 GB');
  assert.equal(formatBytes(-1), '—');
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(3661), '1h 1m 1s');
  assert.equal(formatDuration(90061), '1d 1h 1m');
});

test('lorem generation is deterministic for a seed and respects the unit', () => {
  assert.equal(loremIpsum(5, 'words', 3), loremIpsum(5, 'words', 3));
  assert.equal(loremIpsum(5, 'words').split(' ').length, 5);
  assert.ok(loremIpsum(3, 'paragraphs').split('\n\n').length === 3);
  assert.match(loremIpsum(1, 'sentences'), /^[A-Z].*\.$/);
});

test('the seeded PRNG is reproducible', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  const c = seededRandom(43);
  assert.notEqual(c(), seededRandom(42)());
});

/* ---------------- registry ---------------- */

test('the tools page ships exactly one hundred tools', () => {
  assert.equal(TOOLS.length, 100);
  assert.equal(new Set(TOOLS.map(tool => tool.id)).size, 100, 'every id must be unique');
  for (const tool of TOOLS) {
    assert.ok(tool.name.length > 2, tool.id);
    assert.ok(tool.blurb.length > 20, `${tool.id} needs a real blurb`);
  }
});

test('every category has tools and they add up to the whole list', () => {
  const groups = toolsByCategory();
  assert.equal(groups.length, 6);
  assert.equal(groups.reduce((sum, group) => sum + group.tools.length, 0), TOOLS.length);
});

test('search finds tools by name, blurb and keyword', () => {
  assert.ok(searchTools('qr').some(tool => tool.id === 'qr'));
  assert.ok(searchTools('colour').some(tool => tool.id === 'color-converter'), 'British spelling is a keyword');
  assert.ok(searchTools('barcode').some(tool => tool.id === 'qr'));
  assert.equal(searchTools('').length, TOOLS.length);
  assert.equal(searchTools('zzzznotathing').length, 0);
  assert.ok(TOOLS.some(tool => tool.id === DEFAULT_TOOL));
});
