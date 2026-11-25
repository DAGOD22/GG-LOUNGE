/**
 * Screenshot and image storage for CHATVERSE.
 *
 * Two hard rules, both learned from how image uploads usually go wrong here:
 *
 *   · **The type is decided by the bytes, not by the filename or the header.**
 *     A `.png` that contains HTML is an XSS vector the moment anyone serves it
 *     back with a sniffable content type, so this sniffs the magic number and
 *     refuses anything that is not actually an image or a short video.
 *   · **It is stored out of band.** Images are their own row and are served by
 *     their own route with `X-Content-Type-Options: nosniff` and a fixed
 *     content type from the sniff, never a caller-supplied one. Listing a room
 *     therefore never carries image bytes.
 *
 * The size cap is deliberately small (4 MB): this is a chat for screenshots,
 * and a 20 MB upload on a school connection is a broken feature regardless of
 * how much storage the server has.
 */
import { getMode, pgQuery, migrate } from './connection';
import { readLocal, withLocalLock } from './local-store';

export const MAX_CHAT_MEDIA_BYTES = 4 * 1024 * 1024;

export type ChatMedia = {
  id: string;
  mime: string;
  bytes: Buffer;
  size: number;
  name: string;
  createdAt: number;
};

/**
 * Identify an image or video from its first bytes.
 *
 * Returns the MIME type to serve it back as, or null. Only formats every
 * browser decodes are accepted — no SVG, because an SVG is a document that can
 * run script even when served as `image/svg+xml`.
 */
export function sniffMedia(head: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((byte, index) => head[index] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) {
    return 'image/webp';
  }
  // ISO-BMFF: "....ftyp" — accept only the still/video brands we can trust.
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1') return 'image/heic';
    if (brand.startsWith('mp4') || brand === 'isom' || brand === 'iso2' || brand === 'M4V ' || brand === 'qt  ') {
      return 'video/mp4';
    }
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'video/webm';
  return null;
}

/** An id that cannot be guessed and cannot escape a path. */
export function newMediaId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function putMedia(
  bytes: Buffer,
  mime: string,
  name: string,
  room: string,
): Promise<{ id: string; url: string }> {
  const id = newMediaId();
  const cleanName = name.replace(/[^\w.\- ]/g, '').slice(0, 80) || 'image';

  if (getMode() === 'postgres') {
    await migrate();
    await pgQuery(
      `INSERT INTO "chat_media" ("id","room","kind","mime","bytes","size","name")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, room.slice(0, 40), mime.startsWith('video/') ? 'video' : 'image', mime, bytes, bytes.length, cleanName],
    );
    // Old uploads are pruned so the table cannot grow without bound.
    await pgQuery(
      `DELETE FROM "chat_media" WHERE "created_at" < NOW() - interval '30 days'`,
    );
  } else {
    await withLocalLock(async (store: any) => {
      const media: Record<string, ChatMedia> = (store.chatMedia ??= {});
      media[id] = {
        id,
        mime,
        bytes,
        size: bytes.length,
        name: cleanName,
        createdAt: Date.now(),
      };
      const all = Object.values(media).sort((a, b) => b.createdAt - a.createdAt);
      for (const stale of all.slice(400)) delete media[stale.id];
    });
  }
  return { id, url: `/api/chat/media/${id}` };
}

export async function getMedia(id: string): Promise<ChatMedia | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  if (getMode() === 'postgres') {
    await migrate();
    const rows = await pgQuery<{
      id: string; mime: string; bytes: Buffer; size: number; name: string; created_at: string;
    }>(
      'SELECT "id","mime","bytes","size","name","created_at" FROM "chat_media" WHERE "id" = $1',
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      mime: row.mime,
      bytes: Buffer.from(row.bytes),
      size: Number(row.size),
      name: row.name,
      createdAt: new Date(row.created_at).getTime(),
    };
  }
  const store = (await readLocal()) as unknown as { chatMedia?: Record<string, ChatMedia> };
  const row = store.chatMedia?.[id];
  if (!row) return null;
  // The local JSON round-trips Buffers as { type: 'Buffer', data: [...] }.
  const bytes = Buffer.isBuffer(row.bytes)
    ? row.bytes
    : Buffer.from((row.bytes as unknown as { data: number[] }).data ?? []);
  return { ...row, bytes };
}
