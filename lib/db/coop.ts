/**
 * Room-code signalling for peer-to-peer co-op.
 *
 * The room code is a lookup key, not the transport. Two players who have never
 * met, possibly on different mirrors of this site, both need to exchange a
 * WebRTC offer and answer — and the only thing they share is six characters
 * one of them read out loud. So the offer/answer pair is parked in this table
 * under that code for a couple of minutes, and the actual game traffic goes
 * peer to peer once the handshake completes.
 *
 * That is deliberate: signalling through the existing Postgres means no
 * WebSocket (which cannot stay open on serverless), no third-party signalling
 * service, no extra key, and a join that works across domains. The database
 * only ever sees SDP, which contains public ICE candidates and DTLS
 * fingerprints — the same material a browser would expose to the page anyway.
 */
import { getMode, pgQuery, migrate } from './connection';
import { withLocalLock } from './local-store';

/** A room is dead 10 minutes after it was made, or 3 minutes after last use. */
const ROOM_TTL_MS = 10 * 60_000;
const TOUCH_TTL_MS = 3 * 60_000;

export type CoopRoom = {
  code: string;
  offer: string;
  answer: string;
  hostName: string;
  guestName: string;
  status: 'waiting' | 'connecting' | 'connected';
  createdAt: number;
  touchedAt: number;
};

type Store = Record<string, CoopRoom>;

const MAX_SDP = 12_000;

function prune(store: Store, now = Date.now()): Store {
  for (const [code, room] of Object.entries(store)) {
    if (now - room.touchedAt > ROOM_TTL_MS) delete store[code];
  }
  return store;
}

function validSdp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_SDP && value.includes('v=0');
}

async function readStore(): Promise<Store> {
  if (getMode() === 'postgres') {
    await migrate();
    await pgQuery('DELETE FROM "coop_room" WHERE "touched_at" < $1', [
      new Date(Date.now() - ROOM_TTL_MS).toISOString(),
    ]);
    const rows = await pgQuery<{
      code: string; offer: string; answer: string; host_name: string; guest_name: string;
      status: string; created_at: string; touched_at: string;
    }>(
      `SELECT "code","offer","answer","host_name","guest_name","status",
              "created_at" AS "created_at","touched_at" AS "touched_at" FROM "coop_room"`,
    );
    const store: Store = {};
    for (const row of rows) {
      store[row.code] = {
        code: row.code,
        offer: row.offer,
        answer: row.answer,
        hostName: row.host_name,
        guestName: row.guest_name,
        status: row.status as CoopRoom['status'],
        createdAt: new Date(row.created_at).getTime(),
        touchedAt: new Date(row.touched_at).getTime(),
      };
    }
    return store;
  }
  // The local store gets a dedicated slice so co-op does not fan out into every
  // other writer's read-modify-write.
  let value: Store = {};
  await withLocalLock(async (state: any) => {
    state.coopRooms ??= {};
    prune(state.coopRooms);
    value = state.coopRooms;
  });
  return value;
}

async function writeRoom(room: CoopRoom): Promise<void> {
  if (getMode() === 'postgres') {
    await migrate();
    await pgQuery(
      `INSERT INTO "coop_room" ("code","offer","answer","host_name","guest_name","status","created_at","touched_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT ("code") DO UPDATE SET
         "offer"=EXCLUDED."offer", "answer"=EXCLUDED."answer",
         "host_name"=EXCLUDED."host_name", "guest_name"=EXCLUDED."guest_name",
         "status"=EXCLUDED."status", "touched_at"=EXCLUDED."touched_at"`,
      [
        room.code, room.offer, room.answer, room.hostName, room.guestName,
        room.status, new Date(room.createdAt).toISOString(), new Date(room.touchedAt).toISOString(),
      ],
    );
    return;
  }
  await withLocalLock(async (state: any) => {
    state.coopRooms ??= {};
    state.coopRooms[room.code] = room;
  });
}

async function deleteRoom(code: string): Promise<void> {
  if (getMode() === 'postgres') {
    await migrate();
    await pgQuery('DELETE FROM "coop_room" WHERE "code"=$1', [code]);
    return;
  }
  await withLocalLock(async (state: any) => {
    if (state.coopRooms) delete state.coopRooms[code];
  });
}

/** Reserve a code and park the host's offer under it. */
export async function createRoom(
  code: string,
  offer: unknown,
  hostName: string,
): Promise<CoopRoom | null> {
  if (!validSdp(offer)) return null;
  const store = await readStore();
  // A live code is never stolen; the caller generates another.
  const existing = store[code];
  if (existing && Date.now() - existing.touchedAt < TOUCH_TTL_MS) return null;
  const now = Date.now();
  const room: CoopRoom = {
    code,
    offer,
    answer: '',
    hostName: hostName.slice(0, 24),
    guestName: '',
    status: 'waiting',
    createdAt: now,
    touchedAt: now,
  };
  await writeRoom(room);
  return room;
}

/** Guest answers the host's offer. */
export async function answerRoom(
  code: string,
  answer: unknown,
  guestName: string,
): Promise<CoopRoom | null> {
  if (!validSdp(answer)) return null;
  const store = await readStore();
  const room = store[code];
  if (!room) return null;
  room.answer = answer;
  room.guestName = guestName.slice(0, 24);
  room.status = 'connecting';
  room.touchedAt = Date.now();
  await writeRoom(room);
  return room;
}

export async function getRoom(code: string): Promise<CoopRoom | null> {
  const store = await readStore();
  return store[code] ?? null;
}

/** Both sides call this while their connection is open, so a room ages out. */
export async function touchRoom(code: string): Promise<CoopRoom | null> {
  const store = await readStore();
  const room = store[code];
  if (!room) return null;
  room.touchedAt = Date.now();
  if (room.answer && room.offer) room.status = 'connected';
  await writeRoom(room);
  return room;
}

export async function closeRoom(code: string): Promise<void> {
  await deleteRoom(code);
}
