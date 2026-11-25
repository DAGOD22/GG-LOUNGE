/**
 * CHATVERSE — the private chat behind the admin door.
 *
 * Why it is built this way, in one paragraph: a chat is the one feature where
 * "it works" is not enough, because the failure modes are silent. A message that
 * is queued client-side looks sent. A poll that returns everything looks fast.
 * A bot that posts a welcome message looks like activity. So this module is
 * deliberately boring: one table for rooms, one for messages, ordering by a
 * monotonic id, and *nothing* writes a row that a person did not type. There is
 * no seed data, no system messages, no "someone joined" — a room with no
 * messages says exactly that.
 *
 * Realtime is long-polling rather than WebSockets, for the same reason the rest
 * of this site works on Vercel: a function cannot hold a socket open. A long
 * poll that wakes on a watermark is one round trip per message instead of one
 * per second, and it degrades to a normal poll on a host that buffers.
 */
import { getMode, pgQuery, migrate } from './connection';
import { readLocal, withLocalLock } from './local-store';

export type ChatRoom = {
  id: string;
  name: string;
  topic: string;
  createdBy: string;
  createdAt: number;
  lastAt: number;
  messages: number;
};

export type ChatMessage = {
  id: number;
  room: string;
  author: string;
  /** Plain text, already trimmed and length-capped. Never HTML. */
  body: string;
  /** `/api/chat/media/<id>` for an uploaded image, or '' */
  media: string;
  /** Display name of the uploader's file, for alt text / download. */
  mediaName: string;
  at: number;
};

const MAX_BODY = 2000;
const MAX_ROOMS = 40;
const MAX_MESSAGES_PER_ROOM = 500;
const MAX_MEDIA = 6;

/* ------------------------------- sanitising ------------------------------- */

/**
 * Strip anything that could look like markup, collapse runs of blank lines, and
 * cap the length.
 *
 * Messages are rendered as text nodes, so this is not the XSS defence — that is
 * React's escaping. It exists so that a pasted wall of `<div>` soup does not
 * arrive looking like a bug in the chat, and so one message cannot be used to
 * scroll everybody's viewport.
 */
export function cleanBody(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    // Zero-width and bidi overrides let a message render as something other
    // than what it contains.
    .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MAX_BODY);
}

export function cleanRoomName(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[^\p{L}\p{N} #_.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function roomIdFrom(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/* --------------------------------- storage -------------------------------- */

type LocalChat = {
  chatRooms?: Record<string, ChatRoom>;
  chatMessages?: ChatMessage[];
  /** Author → last seen, so the room can say who is around. */
  chatPresence?: Record<string, number>;
};

const PRESENCE_TTL_MS = 25_000;

export async function listRooms(): Promise<ChatRoom[]> {
  if (getMode() === 'postgres') {
    await migrate();
    const rows = await pgQuery<{
      id: string; name: string; topic: string; created_by: string;
      created_at: string; last_at: string; messages: string;
    }>(
      `SELECT r."id", r."name", r."topic", r."created_by",
              r."created_at", r."last_at",
              (SELECT COUNT(*) FROM "chat_message" m WHERE m."room" = r."id")::text AS "messages"
         FROM "chat_room" r
        ORDER BY r."last_at" DESC
        LIMIT ${MAX_ROOMS}`,
    );
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      topic: row.topic,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).getTime(),
      lastAt: new Date(row.last_at).getTime(),
      messages: Number(row.messages),
    }));
  }
  const store = (await readLocal()) as unknown as LocalChat;
  const rooms = Object.values(store.chatRooms ?? {});
  const messages = store.chatMessages ?? [];
  return rooms
    .map(room => ({
      ...room,
      messages: messages.filter(message => message.room === room.id).length,
    }))
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, MAX_ROOMS);
}

export async function getRoom(id: string): Promise<ChatRoom | null> {
  const rooms = await listRooms();
  return rooms.find(room => room.id === id) ?? null;
}

export async function createRoom(
  name: string,
  topic: string,
  createdBy: string,
): Promise<ChatRoom | null> {
  const clean = cleanRoomName(name);
  if (!clean) return null;
  const id = roomIdFrom(clean) || `room-${Date.now()}`;
  const now = Date.now();
  const room: ChatRoom = {
    id,
    name: clean,
    topic: topic.slice(0, 120),
    createdBy,
    createdAt: now,
    lastAt: now,
    messages: 0,
  };
  if (getMode() === 'postgres') {
    await migrate();
    // Creating a room that exists is not an error — it is "open that room".
    await pgQuery(
      `INSERT INTO "chat_room" ("id","name","topic","created_by","created_at","last_at")
       VALUES ($1,$2,$3,$4,NOW(),NOW())
       ON CONFLICT ("id") DO UPDATE SET "last_at" = NOW()`,
      [id, clean, room.topic, createdBy.slice(0, 24)],
    );
    return (await getRoom(id)) ?? room;
  }
  await withLocalLock(async (store: any) => {
    const rooms: Record<string, ChatRoom> = (store.chatRooms ??= {});
    const existing = rooms[id];
    if (existing) existing.lastAt = now;
    else rooms[id] = room;
    // Old, empty rooms are dead weight on a self-hosted box.
    const all = Object.values(rooms).sort((a, b) => b.lastAt - a.lastAt);
    for (const stale of all.slice(MAX_ROOMS)) delete rooms[stale.id];
  });
  return room;
}

export async function deleteRoom(id: string): Promise<void> {
  if (getMode() === 'postgres') {
    await migrate();
    await pgQuery('DELETE FROM "chat_message" WHERE "room" = $1', [id]);
    await pgQuery('DELETE FROM "chat_room" WHERE "id" = $1', [id]);
    return;
  }
  await withLocalLock(async (store: any) => {
    delete (store.chatRooms ?? {})[id];
    store.chatMessages = (store.chatMessages ?? []).filter((m: ChatMessage) => m.room !== id);
  });
}

export async function postMessage(
  room: string,
  author: string,
  body: string,
  media: { url: string; name: string } | null = null,
): Promise<ChatMessage | null> {
  const text = cleanBody(body);
  // A message with neither words nor an image is not a message. This is what
  // stops an empty `send` (or a stray Enter) from appending a blank line that
  // everyone else then has to scroll past.
  if (!text && !media) return null;
  const now = Date.now();

  if (getMode() === 'postgres') {
    await migrate();
    const rows = await pgQuery<{ id: string; at: string }>(
      `INSERT INTO "chat_message" ("room","author","body","media","media_name")
       VALUES ($1,$2,$3,$4,$5) RETURNING "id"::text AS "id", "at"`,
      [room, author.slice(0, 24), text, media?.url ?? '', media?.name.slice(0, 80) ?? ''],
    );
    await pgQuery('UPDATE "chat_room" SET "last_at" = NOW() WHERE "id" = $1', [room]);
    // Keep each room bounded. Deleting by id keeps the newest N.
    await pgQuery(
      `DELETE FROM "chat_message" WHERE "room" = $1 AND "id" < (
         SELECT COALESCE(MIN("id"),0) FROM (
           SELECT "id" FROM "chat_message" WHERE "room" = $1 ORDER BY "id" DESC LIMIT $2
         ) AS recent)`,
      [room, MAX_MESSAGES_PER_ROOM],
    );
    return {
      id: Number(rows[0]?.id ?? 0),
      room,
      author,
      body: text,
      media: media?.url ?? '',
      mediaName: media?.name ?? '',
      at: new Date(rows[0]?.at ?? now).getTime(),
    };
  }

  let saved: ChatMessage | null = null;
  await withLocalLock(async (store: any) => {
    const all: ChatMessage[] = (store.chatMessages ??= []);
    const rooms: Record<string, ChatRoom> = (store.chatRooms ??= {});
    const id = (all.at(-1)?.id ?? 0) + 1;
    saved = {
      id,
      room,
      author: author.slice(0, 24),
      body: text,
      media: media?.url ?? '',
      mediaName: media?.name ?? '',
      at: now,
    };
    all.push(saved);
    const mine = all.filter(message => message.room === room);
    if (mine.length > MAX_MESSAGES_PER_ROOM) {
      const drop = new Set(mine.slice(0, mine.length - MAX_MESSAGES_PER_ROOM).map(m => m.id));
      store.chatMessages = all.filter((m: ChatMessage) => !drop.has(m.id));
    }
    if (rooms[room]) rooms[room].lastAt = now;
  });
  return saved;
}

/**
 * Messages after a watermark.
 *
 * `after` is the last id the caller already has, which makes this both "give me
 * the backlog" (after = 0) and "tell me what is new" (after = last seen). Using
 * the id rather than a timestamp matters: two messages in the same millisecond
 * would otherwise be lost by one client and duplicated by another.
 */
export async function readMessages(room: string, after = 0, limit = 80): Promise<ChatMessage[]> {
  const take = Math.max(1, Math.min(limit, 200));
  if (getMode() === 'postgres') {
    await migrate();
    const rows = await pgQuery<{
      id: string; room: string; author: string; body: string;
      media: string; media_name: string; at: string;
    }>(
      `SELECT "id"::text AS "id","room","author","body","media","media_name","at"
         FROM "chat_message"
        WHERE "room" = $1 AND "id" > $2
        ORDER BY "id" ASC
        LIMIT $3`,
      [room, after, take],
    );
    return rows.map(row => ({
      id: Number(row.id),
      room: row.room,
      author: row.author,
      body: row.body,
      media: row.media,
      mediaName: row.media_name,
      at: new Date(row.at).getTime(),
    }));
  }
  const store = (await readLocal()) as unknown as LocalChat;
  return (store.chatMessages ?? [])
    .filter(message => message.room === room && message.id > after)
    .sort((a, b) => a.id - b.id)
    .slice(0, take);
}

/** The newest id in a room, so a long poll knows when something arrived. */
export async function latestId(room: string): Promise<number> {
  if (getMode() === 'postgres') {
    await migrate();
    const rows = await pgQuery<{ id: string }>(
      'SELECT COALESCE(MAX("id"),0)::text AS "id" FROM "chat_message" WHERE "room" = $1',
      [room],
    );
    return Number(rows[0]?.id ?? 0);
  }
  const store = (await readLocal()) as unknown as LocalChat;
  const mine = (store.chatMessages ?? []).filter(message => message.room === room);
  return mine.length ? mine[mine.length - 1].id : 0;
}

/* -------------------------------- presence -------------------------------- */

export async function markPresent(room: string, who: string): Promise<void> {
  if (getMode() === 'postgres') {
    await migrate();
    await pgQuery(
      `INSERT INTO "chat_presence" ("room","who","seen_at") VALUES ($1,$2,NOW())
       ON CONFLICT ("room","who") DO UPDATE SET "seen_at" = NOW()`,
      [room, who.slice(0, 24)],
    );
    await pgQuery('DELETE FROM "chat_presence" WHERE "seen_at" < NOW() - ($1 || \' seconds\')::interval', [
      String(Math.ceil(PRESENCE_TTL_MS / 1000)),
    ]);
    return;
  }
  const now = Date.now();
  await withLocalLock(async (store: any) => {
    const presence: Record<string, number> = (store.chatPresence ??= {});
    presence[`${room}/${who}`] = now;
    for (const [key, seen] of Object.entries(presence)) {
      if (now - seen > PRESENCE_TTL_MS) delete presence[key];
    }
  });
}

export async function whoIsHere(room: string): Promise<string[]> {
  if (getMode() === 'postgres') {
    await migrate();
    const rows = await pgQuery<{ who: string }>(
      `SELECT "who" FROM "chat_presence"
        WHERE "room" = $1 AND "seen_at" >= NOW() - ($2 || ' seconds')::interval
        ORDER BY "seen_at" DESC`,
      [room, String(Math.ceil(PRESENCE_TTL_MS / 1000))],
    );
    return rows.map(row => row.who);
  }
  const store = (await readLocal()) as unknown as LocalChat;
  const now = Date.now();
  return Object.entries(store.chatPresence ?? {})
    .filter(([key, seen]) => key.startsWith(`${room}/`) && now - seen <= PRESENCE_TTL_MS)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key.slice(room.length + 1));
}

/** Caps how much a single client can post. Separate from the route limiter:
 *  that one protects the function, this one protects the conversation. */
export function canPost(recentCount: number): boolean {
  return recentCount < 20;
}

export const CHAT_LIMITS = { MAX_BODY, MAX_ROOMS, MAX_MESSAGES_PER_ROOM, MAX_MEDIA };
