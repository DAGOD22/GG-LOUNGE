'use client';

/**
 * A minimal GIF89a encoder.
 *
 * Why by hand: shipping a GIF library for one export button is 40 KB of bundle
 * for something the browser does not otherwise need, and the `gifenc`/`gif.js`
 * options drag in a worker file that would need its own CSP entry. This is the
 * part of the format a screen recording actually uses:
 *
 *   header → logical screen descriptor → global colour table →
 *   (per frame: graphic control extension + image descriptor + LZW data) →
 *   trailer.
 *
 * The palette is a fixed 6-6-6 RGB cube (216 colours) plus 40 greys. That is
 * worse than median-cut quantisation on a photograph and completely fine for
 * game footage, which is flat-shaded and high-contrast; the alternative is a
 * palette pass that costs more than the encode itself.
 *
 * The LZW stage is textbook variable-width code emission, so the output opens
 * anywhere: browsers, Discord, Preview, `identify`.
 */

const PALETTE: number[][] = (() => {
  const cube: number[][] = [];
  const levels = [0, 51, 102, 153, 204, 255];
  for (const r of levels) for (const g of levels) for (const b of levels) cube.push([r, g, b]);
  const greys: number[][] = [];
  for (let i = 0; i < 40; i++) {
    const value = Math.round((i / 39) * 255);
    greys.push([value, value, value]);
  }
  return [...cube, ...greys];
})();

/** Nearest palette entry, with the cube's structure used as a lookup hint. */
function nearest(r: number, g: number, b: number): number {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const entry = PALETTE[i];
    const distance = (entry[0] - r) ** 2 + (entry[1] - g) ** 2 + (entry[2] - b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
      if (distance === 0) break;
    }
  }
  return bestIndex;
}

/** Byte writer with the little-endian helpers a GIF needs. */
class Bytes {
  private chunks: number[] = [];
  byte(value: number) { this.chunks.push(value & 0xff); }
  word(value: number) { this.byte(value); this.byte(value >> 8); }
  bytes(values: number[] | Uint8Array) { for (const value of values) this.byte(value); }
  ascii(text: string) { for (const char of text) this.byte(char.charCodeAt(0)); }
  done(): Uint8Array { return Uint8Array.from(this.chunks); }
}

/**
 * LZW-compress one frame's indices.
 *
 * The dictionary resets at 4096 entries because the code width is capped at
 * 12 bits; both encoder and decoder must reset on the same boundary, which is
 * why the `clear` code is emitted exactly there.
 */
function lzw(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let next = endCode + 1;
  let dictionary = new Map<string, number>();

  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  let prefix = String(indices[0] ?? 0);
  for (let i = 1; i < indices.length; i++) {
    const char = String(indices[i]);
    const combined = `${prefix},${char}`;
    if (dictionary.has(combined)) {
      prefix = combined;
      continue;
    }
    emit(dictionary.get(prefix) ?? Number(prefix));
    dictionary.set(combined, next++);
    if (next > 4095) {
      emit(clearCode);
      dictionary = new Map();
      codeSize = minCodeSize + 1;
      next = endCode + 1;
    } else if (next > (1 << codeSize) && codeSize < 12) {
      codeSize++;
    }
    prefix = char;
  }
  emit(dictionary.get(prefix) ?? Number(prefix));
  emit(endCode);
  if (bitCount > 0) out.push(bitBuffer & 0xff);

  // Sub-blocks of at most 255 bytes, terminated by a zero-length block.
  const blocks = new Bytes();
  blocks.byte(minCodeSize);
  for (let offset = 0; offset < out.length; offset += 255) {
    const slice = out.slice(offset, offset + 255);
    blocks.byte(slice.length);
    blocks.bytes(slice);
  }
  blocks.byte(0);
  return blocks.done();
}

/**
 * Encode frames into an animated GIF.
 *
 * @param frames  same dimensions for every frame
 * @param delayCs delay per frame in hundredths of a second (12 = ~8 fps)
 */
export function encodeGif(frames: ImageData[], width: number, height: number, delayCs = 12): Blob {
  const out = new Bytes();
  out.ascii('GIF89a');
  out.word(width);
  out.word(height);
  // Global colour table present, 8-bit, 256 entries.
  out.byte(0xf7);
  out.byte(0); // background index
  out.byte(0); // pixel aspect ratio
  for (let i = 0; i < 256; i++) {
    const entry = PALETTE[i] ?? [0, 0, 0];
    out.bytes(entry);
  }

  // Netscape loop extension: loop forever.
  out.bytes([0x21, 0xff, 0x0b]);
  out.ascii('NETSCAPE2.0');
  out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);

  for (const frame of frames) {
    // Graphic control: disposal 2 (restore to background) + delay.
    out.bytes([0x21, 0xf9, 0x04, 0x08]);
    out.word(delayCs);
    out.bytes([0x00, 0x00]);

    out.byte(0x2c); // image descriptor
    out.word(0);
    out.word(0);
    out.word(width);
    out.word(height);
    out.byte(0x00); // no local colour table, not interlaced

    const indices = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < indices.length; i++, p += 4) {
      const r = frame.data[p];
      const g = frame.data[p + 1];
      const b = frame.data[p + 2];
      // Exact cube lookup when the channel values are already cube levels.
      const ir = Math.round(r / 51);
      const ig = Math.round(g / 51);
      const ib = Math.round(b / 51);
      const cubeIndex = ir * 36 + ig * 6 + ib;
      indices[i] = Math.abs(ir * 51 - r) + Math.abs(ig * 51 - g) + Math.abs(ib * 51 - b) <= 6
        ? cubeIndex
        : nearest(r, g, b);
    }
    out.bytes(lzw(indices, 8));
  }

  out.byte(0x3b); // trailer
  const bytes = out.done();
  // Copy into a fresh buffer: Uint8Array.slice on a typed array returns a
  // Uint8Array<ArrayBufferLike>, which Blob accepts but TS models awkwardly.
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/gif' });
}
