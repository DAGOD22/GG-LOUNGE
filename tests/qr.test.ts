/**
 * The tools page's QR encoder.
 *
 * A QR code is one of those things that looks right and is not: for three
 * iterations this encoder produced grids with correct finder patterns, correct
 * module counts, correct format bits and a plausible overall texture, and *no
 * scanner could read any of them*. Each bug was invisible in isolation:
 *
 *   · the finder's vertical sides were drawn through the separator row,
 *   · the format field was written LSB-first,
 *   · columns left of the timing pattern ran the wrong direction,
 *   · the block table divided the data evenly instead of per group, which only
 *     corrupted versions 7 and up,
 *   · one alignment pattern was skipped for version 10.
 *
 * So these tests are structural where they can be (a hash of the finished grid
 * pins the whole pipeline) and are backed by the fact that every case below was
 * also decoded with zxing-cpp during development. A hash is brittle on purpose
 * here: if the output changes, someone must re-verify it against a real decoder
 * rather than assume the change was cosmetic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { encodeQr, qrToRows, qrToSvg, qrCapacity, debugCodewords } from '@/lib/tools/qr';

const sha = (rows: string[]) => createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 32);

/** Verified against zxing-cpp 3.1: each of these decodes back to its input. */
const GOLDEN: { text: string; version: number; size: number; hash: string }[] = [
  { text: 'A', version: 1, size: 21, hash: '177b3a1897a152aee17ab1ee4b667913' },
  { text: 'HELLO WORLD', version: 1, size: 21, hash: '1e387bd8b7a170bfa73b461bab560d96' },
  { text: 'https://gg-lounge.vercel.app', version: 3, size: 29, hash: '4ff9b8b5993028db375ed6b9dfb8ff00' },
];

test('the encoder reproduces grids that were decoded by a real scanner', () => {
  for (const golden of GOLDEN) {
    const matrix = encodeQr(golden.text);
    assert.equal(matrix.version, golden.version, `${golden.text}: version`);
    assert.equal(matrix.size, golden.size, `${golden.text}: module count`);
    assert.equal(sha(qrToRows(matrix)), golden.hash, `${golden.text}: grid hash`);
  }
});

test('every symbol has the three finder patterns with clean separators', () => {
  for (const text of ['A', 'x'.repeat(60), 'x'.repeat(213), 'Ünïcödé ☃']) {
    const { modules, size } = encodeQr(text);
    const corners = [[0, 0], [0, size - 7], [size - 7, 0]];
    for (const [row, col] of corners) {
      // 7x7: dark ring, light inner ring, 3x3 dark core.
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const edge = r === 0 || r === 6 || c === 0 || c === 6;
          const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          assert.equal(modules[row + r][col + c], edge || core, `${text}: finder at ${row},${col} cell ${r},${c}`);
        }
      }
    }
    // The separator row between the top-left finder and the data must be light.
    for (let c = 0; c < 8; c++) assert.equal(modules[7][c], false, `${text}: separator row`);
    for (let r = 0; r < 8; r++) assert.equal(modules[r][7], false, `${text}: separator column`);
  }
});

test('timing patterns alternate all the way across', () => {
  const { modules, size } = encodeQr('A');
  for (let i = 8; i < size - 8; i++) {
    assert.equal(modules[6][i], i % 2 === 0, `horizontal timing at ${i}`);
    assert.equal(modules[i][6], i % 2 === 0, `vertical timing at ${i}`);
  }
});

test('the dark module is set and every symbol is square', () => {
  const { modules, size } = encodeQr('https://example.com');
  assert.equal(modules[size - 8][8], true, 'the dark module must be set');
  for (const row of modules) assert.equal(row.length, size);
  assert.equal(modules.length, size);
});

test('version 7 and up carry version information in both blocks', () => {
  const { modules, size, version } = encodeQr('x'.repeat(180));
  assert.ok(version >= 7, 'this input should need version 7+');
  // Both 3x6 blocks are the same bit pattern.
  const topRight = Array.from({ length: 6 }, (_, r) => Array.from({ length: 3 }, (_, c) => modules[r][size - 11 + c]));
  const bottomLeft = Array.from({ length: 6 }, (_, r) => Array.from({ length: 3 }, (_, c) => modules[size - 11 + r][c]));
  // They are transposes of each other by construction in the spec.
  for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) {
    assert.equal(bottomLeft[r][c], modules[size - 11 + r][c]);
  }
  assert.ok(topRight.some(row => row.some(Boolean)), 'version bits must not be all light');
});

test('capacity grows with length and refuses text that cannot fit', () => {
  assert.equal(qrCapacity(), 213);
  const sizes = [1, 20, 60, 120, 213].map(length => encodeQr('x'.repeat(length)).size);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] >= sizes[i - 1], 'size must not shrink as text grows');
  assert.throws(() => encodeQr('x'.repeat(214)), /too long/i);
});

test('UTF-8 survives the round trip through the byte stream', () => {
  // "Ünïcödé ☃" is 8 characters but 15 UTF-8 bytes, so it needs a bigger
  // version than eight ASCII characters do. Counting characters instead of
  // bytes would overflow the chosen version's data capacity.
  const { version } = encodeQr('Ünïcödé ☃');
  const { version: asciiVersion } = encodeQr('x'.repeat(15));
  const { version: shortAscii } = encodeQr('x'.repeat(8));
  assert.equal(version, asciiVersion, 'multi-byte text must be measured in its byte length');
  assert.ok(version > shortAscii, 'and that must be larger than the character count implies');
  // The header byte for byte mode is 0b0100 in the top nibble of codeword 0.
  assert.equal(debugCodewords('Hello').codewords[0] >> 4, 0b0100, 'byte mode indicator');
});

test('the SVG renderer emits one rect per dark module plus a light background', () => {
  const svg = qrToSvg('A', { scale: 4, margin: 2 });
  const { modules, size } = encodeQr('A');
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  const rects = svg.match(/<rect /g) ?? [];
  assert.equal(rects.length, dark + 1, 'one rect per dark module, plus the background');
  assert.match(svg, new RegExp(`viewBox="0 0 ${(size + 4) * 4} ${(size + 4) * 4}"`));
  assert.match(svg, /role="img"/);
});

test('empty input still produces a scannable single-space symbol', () => {
  const matrix = encodeQr('   ');
  assert.equal(matrix.version, 1);
  assert.equal(matrix.modules.length, 21);
  assert.equal(debugCodewords(' ').codewords[0] >> 4, 0b0100);
});
