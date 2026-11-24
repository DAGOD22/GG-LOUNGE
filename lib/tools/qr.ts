/**
 * A small, self-contained QR code encoder.
 *
 * Why this exists rather than a dependency: the tools page has to work offline
 * inside a school network that blocks CDNs, and a QR image is exactly the kind
 * of thing you want without a network round trip. There is no QR library in the
 * lockfile, and adding one for a single panel is not worth the install weight.
 *
 * Scope is deliberately narrow — it produces byte-mode codes at error
 * correction level M for versions 1 to 10, which covers any URL or sentence a
 * person would realistically type into a box (up to 213 bytes). That is enough
 * to be genuinely useful and small enough to be readable and testable.
 *
 * The algorithm follows ISO/IEC 18004 directly:
 *   1. encode the text as bytes, with the mode/length header,
 *   2. pad to the version's data capacity with the standard pad bytes,
 *   3. split into blocks, add Reed–Solomon error correction to each,
 *   4. interleave the blocks,
 *   5. place the modules, applying the eight standard data masks and picking
 *      the one with the lowest penalty score,
 *   6. draw the function patterns (finders, timing, alignment, format/version).
 */

/** Error correction level M — ~15% recovery, the usual default for printed codes. */
const EC_LEVEL_M = 0;

/** Format-bits value for level M in the QR spec's encoding. */
const EC_FORMAT_BITS_M = 0;

/**
 * Per-version block layout for level M.
 *
 * `blocks` is a list of groups, not a count: several versions mix block sizes
 * (version 9 has three 22-codeword blocks and two 23-codeword ones). Dividing
 * the data evenly across a flat block count is what silently corrupted every
 * version above 6 and left the smaller versions working — so the group
 * structure is spelled out rather than derived.
 */
const EC_TABLE_M: Record<number, { ecCodewords: number; blocks: { count: number; dataCodewords: number }[] }> = {
  1: { ecCodewords: 10, blocks: [{ count: 1, dataCodewords: 16 }] },
  2: { ecCodewords: 16, blocks: [{ count: 1, dataCodewords: 28 }] },
  3: { ecCodewords: 26, blocks: [{ count: 1, dataCodewords: 44 }] },
  4: { ecCodewords: 18, blocks: [{ count: 2, dataCodewords: 32 }] },
  5: { ecCodewords: 24, blocks: [{ count: 2, dataCodewords: 43 }] },
  6: { ecCodewords: 16, blocks: [{ count: 4, dataCodewords: 27 }] },
  7: { ecCodewords: 18, blocks: [{ count: 4, dataCodewords: 31 }] },
  8: { ecCodewords: 22, blocks: [{ count: 2, dataCodewords: 38 }, { count: 2, dataCodewords: 39 }] },
  9: { ecCodewords: 22, blocks: [{ count: 3, dataCodewords: 36 }, { count: 2, dataCodewords: 37 }] },
  10: { ecCodewords: 26, blocks: [{ count: 4, dataCodewords: 43 }, { count: 1, dataCodewords: 44 }] },
};

/** Total codewords (data + error correction) for each version. */
const TOTAL_CODEWORDS: Record<number, number> = {
  1: 26, 2: 44, 3: 70, 4: 100, 5: 134,
  6: 172, 7: 196, 8: 242, 9: 292, 10: 346,
};

/** Alignment-pattern centre coordinates per version. */
const ALIGNMENT: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** Byte-mode capacity for level M, versions 1–10. */
const BYTE_CAPACITY_M: Record<number, number> = {
  1: 14, 2: 26, 3: 42, 4: 62, 5: 84,
  6: 106, 7: 122, 8: 152, 9: 180, 10: 213,
};

export type QrMatrix = { size: number; modules: boolean[][]; version: number };

class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() {
    return this.bits.length;
  }
}

/* ---------------- Reed–Solomon over GF(256) ---------------- */

const EXP = new Array(512).fill(0);
const LOG = new Array(256).fill(0);
(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // primitive polynomial for QR
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Generator polynomial for `degree` error-correction codewords. */
function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Remainder of `data` divided by the generator — the EC codewords. */
function reedSolomon(data: number[], degree: number): number[] {
  const gen = generatorPoly(degree);
  const out = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.shift();
    out.push(0);
    for (let i = 0; i < degree; i++) out[i] ^= gfMul(gen[i + 1], factor);
  }
  return out;
}

/* ---------------- Encoding ---------------- */

function toBytes(text: string): number[] {
  // TextEncoder would be simpler but this keeps the module usable in the test
  // runner without pulling in a global, and it is the same UTF-8 encoding.
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function chooseVersion(byteLength: number): number {
  for (let version = 1; version <= 10; version++) {
    if (byteLength <= BYTE_CAPACITY_M[version]) return version;
  }
  throw new Error('That text is too long for a QR code — try under 200 characters.');
}

function buildCodewords(bytes: number[], version: number): number[] {
  const buffer = new BitBuffer();
  buffer.put(0b0100, 4); // byte mode
  buffer.put(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) buffer.put(byte, 8);

  const layout = EC_TABLE_M[version];
  const blockCount = layout.blocks.reduce((sum, group) => sum + group.count, 0);
  const totalDataCodewords = TOTAL_CODEWORDS[version] - layout.ecCodewords * blockCount;
  const capacityBits = totalDataCodewords * 8;

  // Terminator, then pad to a byte boundary, then the standard pad bytes.
  buffer.put(0, Math.min(4, capacityBits - buffer.length));
  while (buffer.length % 8 !== 0) buffer.bits.push(0);
  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (buffer.bits.length < capacityBits) {
    buffer.put(pads[padIndex % 2], 8);
    padIndex++;
  }

  const dataCodewords: number[] = [];
  for (let i = 0; i < buffer.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | buffer.bits[i + j];
    dataCodewords.push(byte);
  }

  // Split into the declared groups, EC each block, then interleave: every
  // block contributes its first data codeword before any block contributes its
  // second, then all error codewords interleave the same way.
  const { blocks: groups, ecCodewords } = EC_TABLE_M[version];
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (const group of groups) {
    for (let i = 0; i < group.count; i++) {
      const block = dataCodewords.slice(offset, offset + group.dataCodewords);
      offset += group.dataCodewords;
      dataBlocks.push(block);
      ecBlocks.push(reedSolomon(block, ecCodewords));
    }
  }

  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map(block => block.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecCodewords; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
}

/* ---------------- Matrix construction ---------------- */

type Grid = (boolean | null)[][];

function emptyGrid(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
}

function placeFinder(grid: Grid, row: number, col: number) {
  // Offsets -1..7: the 7x7 finder plus its one-module light separator.
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= grid.length || cc >= grid.length) continue;
      // Inside the 7x7 block the ring and the 3x3 core are dark; the separator
      // (any offset outside 0..6) is always light. Testing `c === 0` without
      // first bounding the offsets drew the finder's vertical sides straight
      // through the separator row — every code was 7 modules too tall to scan.
      const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      if (!inside) {
        grid[rr][cc] = false;
        continue;
      }
      const inRing = r === 0 || r === 6 || c === 0 || c === 6;
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      grid[rr][cc] = inRing || inCore;
    }
  }
}

function placeAlignment(grid: Grid, version: number) {
  const centres = ALIGNMENT[version];
  if (!centres.length) return;
  const size = grid.length;
  for (const row of centres) {
    for (const col of centres) {
      // An alignment pattern is drawn at every (row, col) pair from the centre
      // list except the three that would land on a finder. Testing the centRE
      // coordinates against 6 / size-7 is the trap: for version 10 the centres
      // are [6, 28, 50] and size-7 is 50, so the pair (50, 6) looks like a
      // finder collision when it is really the alignment block that legitimately
      // straddles the horizontal timing row — skipping it left a hole that made
      // the whole symbol unreadable. The rule is on the *pair*, not near it.
      const onFinder = (row === 6 && col === 6)
        || (row === 6 && col === size - 7)
        || (row === size - 7 && col === 6);
      if (onFinder) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const edge = Math.max(Math.abs(r), Math.abs(c));
          grid[row + r][col + c] = edge !== 1;
        }
      }
    }
  }
}

function reserveFormatAreas(grid: Grid, version: number) {
  const size = grid.length;
  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }
  // The dark module.
  grid[size - 8][8] = true;
  // Reserve the format-info cells so data placement skips them.
  for (let i = 0; i < 9; i++) {
    if (grid[8][i] === null) grid[8][i] = false;
    if (grid[i][8] === null) grid[i][8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (grid[8][i] === null) grid[8][i] = false;
    if (grid[i][8] === null) grid[i][8] = false;
  }
  // Version information for versions 7 and up.
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        grid[size - 11 + j][i] = false;
        grid[i][size - 11 + j] = false;
      }
    }
  }
}

function placeData(grid: Grid, codewords: number[]) {
  const size = grid.length;
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  const bitAt = (index: number) => (index < totalBits ? (codewords[index >> 3] >> (7 - (index & 7))) & 1 : 0);

  // Two-module-wide columns, right to left, alternating direction — with one
  // exception that is easy to get backwards: every column pair left of the
  // vertical timing column also flips its direction. Without that flip the
  // whole left half is transposed and the code is unreadable, while still
  // looking plausible. (This is the exact rule the spec states as "upwards
  // except when the column is left of column 6".)
  for (let right = size - 1; right >= 1; right -= 2) {
    const columnRight = right <= 6 ? right - 1 : right;
    // Direction is the low bit of the column index pair, XOR'd with "this
    // column is left of the timing pattern". Dropping the second term — which
    // is exactly what the previous version did — transposes the entire left
    // half of the symbol, and the code becomes unreadable while still looking
    // like a QR code.
    const upward = ((columnRight & 2) === 0) !== (columnRight < 6);
    for (let vertical = 0; vertical < size; vertical++) {
      for (let z = 0; z < 2; z++) {
        const col = columnRight - z;
        const row = upward ? size - 1 - vertical : vertical;
        if (grid[row][col] !== null) continue;
        grid[row][col] = bitAt(bitIndex) === 1;
        bitIndex++;
      }
    }
  }
}

function maskAt(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

/** The standard penalty rules, used to pick the least noisy mask. */
function penalty(grid: boolean[][]): number {
  const size = grid.length;
  let score = 0;

  // Rule 1: runs of five or more same-coloured modules.
  for (let i = 0; i < size; i++) {
    let runRow = 1;
    let runCol = 1;
    for (let j = 1; j < size; j++) {
      runRow = grid[i][j] === grid[i][j - 1] ? runRow + 1 : 1;
      if (runRow === 5) score += 3;
      else if (runRow > 5) score += 1;
      runCol = grid[j][i] === grid[j - 1][i] ? runCol + 1 : 1;
      if (runCol === 5) score += 3;
      else if (runCol > 5) score += 1;
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const value = grid[r][c];
      if (grid[r][c + 1] === value && grid[r + 1][c] === value && grid[r + 1][c + 1] === value) score += 3;
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns.
  const pattern = [true, false, true, true, true, false, true];
  const matches = (values: boolean[], start: number) => {
    if (start + pattern.length > values.length) return false;
    for (let i = 0; i < pattern.length; i++) if (values[start + i] !== pattern[i]) return false;
    // Must be preceded or followed by four light modules to count.
    const before = values.slice(Math.max(0, start - 4), start);
    const after = values.slice(start + 7, start + 11);
    const darkBefore = before.some(v => v);
    const darkAfter = after.some(v => v);
    return !darkBefore || !darkAfter;
  };
  for (let i = 0; i < size; i++) {
    const row = grid[i];
    const col = grid.map(r => r[i]);
    for (let j = 0; j < size; j++) {
      if (matches(row, j)) score += 40;
      if (matches(col, j)) score += 40;
    }
  }

  // Rule 4: proportion of dark modules.
  let dark = 0;
  for (const row of grid) for (const value of row) if (value) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

function drawFormatBits(grid: Grid, mask: number) {
  const size = grid.length;
  // Level M (00) plus the three-bit mask id, then 10 BCH bits, then XOR with
  // the standard mask pattern. `bits` is 15 wide with bit 14 as the MSB.
  const data = (EC_FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (index: number) => ((bits >>> index) & 1) === 1;

  // Placement is MSB-first from (8,0). Writing the LSB there instead produces a
  // grid that looks like a QR code in every respect except that no decoder can
  // read it — the format field is the first thing a reader parses.
  for (let i = 0; i <= 5; i++) grid[8][i] = bit(14 - i);
  grid[8][7] = bit(8);
  grid[8][8] = bit(7);
  grid[7][8] = bit(6);
  for (let i = 0; i <= 5; i++) grid[5 - i][8] = bit(5 - i);

  // The second, mirrored copy.
  for (let i = 0; i <= 6; i++) grid[size - 1 - i][8] = bit(14 - i);
  for (let i = 0; i <= 7; i++) grid[8][size - 8 + i] = bit(7 - i);

  // The dark module, always set.
  grid[size - 8][8] = true;
}

function drawVersionBits(grid: Grid, version: number) {
  if (version < 7) return;
  const size = grid.length;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const on = ((bits >>> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    grid[a][b] = on;
    grid[b][a] = on;
  }
}

/**
 * Encode `text` and return the module grid.
 *
 * The masks are applied to a copy of the grid and scored, so the caller gets a
 * finished code with no post-processing to forget.
 */
export function encodeQr(text: string, forceMask?: number): QrMatrix {
  const value = text.trim() || ' ';
  const bytes = toBytes(value);
  const version = chooseVersion(bytes.length);
  const size = 17 + version * 4;
  const codewords = buildCodewords(bytes, version);

  const base = emptyGrid(size);
  placeFinder(base, 0, 0);
  placeFinder(base, 0, size - 7);
  placeFinder(base, size - 7, 0);
  placeAlignment(base, version);
  reserveFormatAreas(base, version);
  placeData(base, codewords);

  // `placeData` only fills data cells; everything else is already a boolean.
  const dataGrid = base.map(row => row.map(cell => cell === true));
  // Remember which cells are function patterns so masking does not touch them.
  const functional = base.map((row, r) =>
    row.map((cell, c) => cell !== null && !isDataCell(r, c, size, version)),
  );

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  const masks = forceMask === undefined ? [0,1,2,3,4,5,6,7] : [forceMask];
  for (const mask of masks) {
    const candidate = dataGrid.map((row, r) =>
      row.map((value, c) => (functional[r][c] ? value : value !== maskAt(mask, r, c))),
    );
    drawFormatBits(candidate as Grid, mask);
    drawVersionBits(candidate as Grid, version);
    const score = penalty(candidate as boolean[][]);
    if (score < bestScore) {
      bestScore = score;
      best = candidate as boolean[][];
    }
  }

  return { size, modules: best as boolean[][], version };
}

/**
 * Whether a cell is data (maskable) rather than part of a function pattern.
 * Kept as an explicit rule rather than a parallel flag grid because it is much
 * easier to check against the spec's diagram.
 */
function isDataCell(row: number, col: number, size: number, version: number): boolean {
  // Finder patterns and their separators.
  const inFinder = (r: number, c: number) => r >= 0 && c >= 0 && r < 9 && c < 9;
  if (inFinder(row, col) || inFinder(row, col - (size - 8)) || inFinder(row - (size - 8), col)) return false;
  // Timing patterns.
  if (row === 6 || col === 6) return false;
  // Alignment patterns, when they exist.
  for (const centreRow of ALIGNMENT[version]) {
    for (const centreCol of ALIGNMENT[version]) {
      if ((centreRow === 6 && centreCol === 6) || (centreRow === 6 && centreCol === size - 7) || (centreRow === size - 7 && centreCol === 6)) continue;
      if (Math.abs(row - centreRow) <= 2 && Math.abs(col - centreCol) <= 2) return false;
    }
  }
  // Version information blocks.
  if (version >= 7) {
    if (row >= size - 11 && row <= size - 9 && col <= 5) return false;
    if (col >= size - 11 && col <= size - 9 && row <= 5) return false;
  }
  return true;
}

/** Rows of 0/1, the format every renderer and test wants. */
export function qrToRows(matrix: QrMatrix): string[] {
  return matrix.modules.map(row => row.map(cell => (cell ? '1' : '0')).join(''));
}

/** A standalone SVG string — no DOM needed, so it also works in tests. */
export function qrToSvg(text: string, options: { scale?: number; margin?: number; dark?: string; light?: string } = {}): string {
  const { size, modules } = encodeQr(text);
  const scale = options.scale ?? 6;
  const margin = options.margin ?? 4;
  const dimension = (size + margin * 2) * scale;
  const rects: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!modules[row][col]) continue;
      rects.push(
        `<rect x="${(col + margin) * scale}" y="${(row + margin) * scale}" width="${scale}" height="${scale}"/>`,
      );
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dimension}" height="${dimension}" ` +
    `viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges" role="img">` +
    `<rect width="${dimension}" height="${dimension}" fill="${options.light ?? '#ffffff'}"/>` +
    `<g fill="${options.dark ?? '#000000'}">${rects.join('')}</g></svg>`
  );
}

/** Alphanumeric check used by the tools UI to tell the user what it can hold. */
export function qrCapacity(): number {
  return BYTE_CAPACITY_M[10];
}

export { EC_LEVEL_M, ALPHANUMERIC };

/** Exposed for tests: the interleaved codeword stream for a given text. */
export function debugCodewords(text: string): { version: number; codewords: number[] } {
  const bytes = toBytes(text.trim() || ' ');
  const version = chooseVersion(bytes.length);
  return { version, codewords: buildCodewords(bytes, version) };
}
