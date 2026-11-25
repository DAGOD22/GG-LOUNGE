/**
 * Feature 6 — an LSB PNG vault.
 *
 * Hides a short text message in the least-significant bits of an image's
 * pixels. A PNG is required rather than a JPEG because JPEG's DCT quantisation
 * destroys the low bit of every coefficient — you can hide in a JPEG, but not
 * simply, and not in a way that survives the first re-save.
 *
 * Format, and why it is not just the raw message:
 *
 *   magic  "GGL1"                  4 bytes
 *   length uint32 big-endian       4 bytes  (defends against reading past the end)
 *   body   UTF-8 JSON              length bytes
 *   crc32  of body                 4 bytes  (defends against a half-copied file)
 *
 * The reader returns null rather than throwing for anything malformed, because
 * every image that does not contain a message is a valid input to the reader.
 */

const MAGIC = [0x47, 0x47, 0x4c, 0x31]; // "GGL1"

/**
 * A copy of an image, constructed portably.
 *
 * `new ImageData(...)` exists in a browser and in a worker, but not in Node —
 * and this module is exercised by the test suite, which runs there. When the
 * constructor is missing a structurally identical object is returned: the
 * caller that needs a real `ImageData` (`putImageData`) only ever runs in a
 * browser, where the constructor is present.
 */
function cloneImage(image: ImageData): ImageData {
  const data = new Uint8ClampedArray(image.data);
  if (typeof ImageData === 'function') return new ImageData(data, image.width, image.height);
  return { data, width: image.width, height: image.height, colorSpace: 'srgb' } as ImageData;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** How many bytes an image can hold, before headers. */
export function capacityBytes(width: number, height: number): number {
  // 3 channels (alpha is left alone so the image never gets a visible seam)
  // divided by 8 bits per byte.
  return Math.floor((width * height * 3) / 8);
}

export class StegoError extends Error {}

/**
 * Write `message` into the pixels of `image`.
 *
 * Refuses rather than truncating when the image is too small: a silently
 * half-written message is indistinguishable from corruption on the way back out.
 */
export function embed(image: ImageData, message: string): ImageData {
  const body = new TextEncoder().encode(message);
  const header = new Uint8Array(8);
  header.set(MAGIC, 0);
  new DataView(header.buffer).setUint32(4, body.length, false);
  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, crc32(body), false);

  const payload = new Uint8Array(header.length + body.length + checksum.length);
  payload.set(header, 0);
  payload.set(body, header.length);
  payload.set(checksum, header.length + body.length);

  if (payload.length > capacityBytes(image.width, image.height)) {
    throw new StegoError(
      `That message needs ${payload.length} bytes and this image holds ${capacityBytes(image.width, image.height)}. ` +
        `Use a bigger PNG or a shorter message.`,
    );
  }

  const out = cloneImage(image);
  for (let index = 0; index < payload.length * 8; index++) {
    const byte = payload[index >> 3];
    const bit = (byte >> (7 - (index & 7))) & 1;
    // Skip every fourth byte: alpha. Writing into alpha makes the image
    // translucent in a pattern that looks like a printing defect.
    const pixelByte = Math.floor(index / 3) * 4 + (index % 3);
    out.data[pixelByte] = (out.data[pixelByte] & 0xfe) | bit;
  }
  return out;
}

/** Read a message back, or null when there is not one. */
export function extract(image: ImageData): string | null {
  if (capacityBytes(image.width, image.height) < 12) return null;
  const read = (fromByte: number, count: number): Uint8Array => {
    const out = new Uint8Array(count);
    for (let index = 0; index < count * 8; index++) {
      const pixelByte = Math.floor((fromByte * 8 + index) / 3) * 4 + ((fromByte * 8 + index) % 3);
      out[index >> 3] |= (image.data[pixelByte] & 1) << (7 - (index & 7));
    }
    return out;
  };

  const header = read(0, 8);
  if (!MAGIC.every((byte, index) => header[index] === byte)) return null;
  const length = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(4, false);
  if (!length || length > capacityBytes(image.width, image.height) - 12) return null;

  const body = read(8, length);
  const checksum = read(8 + length, 4);
  const expected = new DataView(checksum.buffer, checksum.byteOffset, checksum.byteLength).getUint32(0, false);
  if (crc32(body) !== expected) return null;

  try {
    return new TextDecoder().decode(body);
  } catch {
    return null;
  }
}

/**
 * A rough visual-difference score, 0-100.
 *
 * Changing the low bit of a channel moves that channel by at most 1/255, which
 * is invisible — unless every pixel changes at once in a smooth gradient, where
 * the eye can sometimes pick out banding. This gives the UI something honest to
 * show next to "Hide": a number that says how much the pixels moved.
 */
export function difference(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return 100;
  let total = 0;
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      total += Math.abs(a.data[i + channel] - b.data[i + channel]);
      count++;
    }
  }
  return count ? Math.round((total / count) * 1000) / 1000 : 0;
}
