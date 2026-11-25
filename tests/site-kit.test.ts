import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatCount,
  pluralize,
  truncateMiddle,
  greetingFor,
  humanBytes,
  storageSummary,
  storageLabel,
  isOurKey,
  scrollFraction,
  newestIds,
  sessionLabel,
  pushRecent,
  catalogSummary,
} from '@/lib/site-kit'

test('formatCount keeps small numbers exact and rounds big ones', () => {
  assert.equal(formatCount(0), '0')
  assert.equal(formatCount(999), '999')
  assert.equal(formatCount(1200), '1.2k')
  assert.equal(formatCount(2000), '2k')
  assert.equal(formatCount(12400), '12k')
  assert.equal(formatCount(1_500_000), '1.5m')
  // Garbage in, "0" out — never "NaN" in the header.
  assert.equal(formatCount(Number.NaN), '0')
  assert.equal(formatCount(-5), '0')
})

test('pluralize handles the irregulars it is given', () => {
  assert.equal(pluralize(1, 'game'), '1 game')
  assert.equal(pluralize(3, 'game'), '3 games')
  assert.equal(pluralize(2, 'copy', 'copies'), '2 copies')
})

test('truncateMiddle keeps both ends of a title', () => {
  assert.equal(truncateMiddle('short', 20), 'short')
  const cut = truncateMiddle('Paper.io 2 Deluxe Edition', 12)
  assert.equal(cut.length, 12)
  assert.ok(cut.includes('…'))
  assert.ok(cut.startsWith('Paper'))
  assert.ok(cut.endsWith('on'))
})

test('greetingFor bins the clock sensibly at every boundary', () => {
  assert.equal(greetingFor(2), 'Still up')
  assert.equal(greetingFor(5), 'Good morning')
  assert.equal(greetingFor(11), 'Good morning')
  assert.equal(greetingFor(12), 'Good afternoon')
  assert.equal(greetingFor(18), 'Good evening')
  assert.equal(greetingFor(23), 'Late one')
  assert.equal(greetingFor(Number.NaN), 'Hello')
})

test('humanBytes rounds and never says 0 B for real content', () => {
  assert.equal(humanBytes(0), '0 B')
  assert.equal(humanBytes(512), '512 B')
  assert.equal(humanBytes(1500), '1.5 kB')
  assert.equal(humanBytes(2_400_000), '2.4 MB')
  assert.equal(humanBytes(Number.NaN), '0 B')
})

test('storageSummary totals, sizes and names the biggest entry', () => {
  const summary = storageSummary([
    { key: 'ggl_fav', bytes: 400 },
    { key: 'ggl_recent', bytes: 1500 },
  ])
  assert.equal(summary.count, 2)
  assert.equal(summary.totalBytes, 1900)
  assert.equal(summary.human, '1.9 kB')
  assert.equal(summary.largest?.key, 'ggl_recent')
})

test('storageSummary with nothing stored is empty, not undefined', () => {
  const summary = storageSummary([])
  assert.equal(summary.count, 0)
  assert.equal(summary.human, '0 B')
  assert.equal(summary.largest, null)
})

test('storageLabel maps known keys and passes unknown ones through', () => {
  assert.equal(storageLabel('ggl_fav'), 'Favourite games')
  assert.equal(storageLabel('someone_elses_key'), 'someone_elses_key')
})

test('isOurKey only claims keys this site wrote', () => {
  assert.ok(isOurKey('ggl_theme'))
  assert.ok(!isOurKey('_ga'))
  assert.ok(!isOurKey(''))
})

test('scrollFraction is clamped and survives a short page', () => {
  assert.equal(scrollFraction(0, 3000, 800), 0)
  assert.equal(scrollFraction(2200, 3000, 800), 1)
  assert.equal(scrollFraction(1100, 3000, 800), 0.5)
  // Document shorter than the viewport: no division by zero, no NaN.
  assert.equal(scrollFraction(100, 500, 800), 0)
  assert.equal(scrollFraction(Number.NaN, 3000, 800), 0)
})

test('newestIds takes the tail of the curated list', () => {
  const ids = newestIds(['a', 'b', 'c', 'd'], 2)
  assert.deepEqual([...ids], ['c', 'd'])
  assert.equal(newestIds(['a'], 0).size, 0)
  // Asking for more than exists is not an error.
  assert.equal(newestIds(['a', 'b'], 10).size, 2)
})

test('sessionLabel never promises a precise duration', () => {
  assert.equal(sessionLabel(0), 'a quick go')
  assert.equal(sessionLabel(1), 'about a minute')
  assert.equal(sessionLabel(3), '3 minutes')
  assert.equal(sessionLabel(17), 'about 15 minutes')
  assert.equal(sessionLabel(60), 'about an hour')
  assert.equal(sessionLabel(90), 'about 1.5 hours')
})

test('pushRecent keeps newest first, deduplicated and capped', () => {
  assert.deepEqual(pushRecent([], 'a'), ['a'])
  assert.deepEqual(pushRecent(['a', 'b'], 'b'), ['b', 'a'])
  assert.deepEqual(pushRecent(['a', 'b', 'c'], 'd', 2), ['d', 'a'])
  // A limit of zero would silently drop everything; it is treated as 1.
  assert.deepEqual(pushRecent(['a'], 'b', 0), ['b'])
})

test('catalogSummary composes a readable line and drops empty parts', () => {
  assert.equal(catalogSummary(42, 9, 6), '42 titles · 9 categories · 6 featured')
  assert.equal(catalogSummary(1, 1, 0), '1 title · 1 category')
  assert.equal(catalogSummary(0, 0, 0), '0 titles')
})
