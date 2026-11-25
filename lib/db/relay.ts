/**
 * Relay fallback for co-op rooms.
 *
 * The room is peer-to-peer by design: no server sees the chat, the keys or the
 * presence pings once the handshake completes. That is the right default and it
 * must stay the default.
 *
 * But peer-to-peer is not always *possible*. Two peers behind strict NAT, a
 * school wifi that drops UDP, or a browser that never gathers a working
 * candidate set all leave a room saying "waiting" forever — and from the inside
 * that is indistinguishable from "the room is broken", because nothing is on
 * screen except a spinner. A room that cannot connect is not a privacy feature.
 *
 * So when a WebRTC channel has not opened within a few seconds, either side can
 * fall back to this: a small message queue keyed by room code, polled every
 * 700 ms. It carries exactly the messages the data channel carries, delivered
 * through the same `handleMessage` path, so nothing above the transport knows
 * the difference. The header says so plainly when it happens, because a player
 * deserves to know their chat is now going through a server.
 *
 * Design notes:
 *  - the queue is bounded and prunes aggressively; this is a transport, not a
 *    message archive;
 *  - a sequence number, not a timestamp, decides what is new, so two devices
 *    with skewed clocks cannot replay or skip;
 *  - `since` is a cursor per *reader*, so both sides can drain the same queue
 *    without stealing each other's messages.
 */
import { getMode, pgQuery, migrate } from './connection';
import { withLocalLock } from './local-store';

/** How long a relayed message survives. Two minutes is generous for a poll
 *  every 700 ms and keeps a busy room from growing without bound. */
const RELAY_TTL_MS = 2 * 60_000;
const MAX_QUEUE = 240;
const MAX_BODY = 4096;

export type RelayMessage = { seq: number; from: 'host' | 'guest'; body: string; at: number };

type Queue = { next: number; items: RelayMessage[] };
type Store = Record<string, Queue>;

async function readStore(): Promise<Store> {
  if (getMode() === 'postgres') {
    await migrate();
    await pgQuery('DELETE FROM "coop_relay" WHERE "at" < $1', [
      new Date(Date.now() - RELAY_TTL_MS).toISOString(),
    ]);
    const rows = await pgQuery<{ code: string; seq: string; from_side: string; body: string; at: string }>(
      `SELECT "code","seq","from_side","body","at" FROM "coop_relay" ORDER BY "code","seq"`,
    );
    const store: Store = {};
    for (const row of rows) {
      const queue = (store[row.code] ??= { next: 1, items: [] });
      const seq = Number(row.seq);
      queue.items.push({ seq, from: row.from_side as RelayMessage['from'], body: row.body, at: new Date(row.at).getTime() });
      queue.next = Math.max(queue.next, seq + 1);
    }
    return store;
  }
  let value: Store = {};
  await withLocalLock(async (state: any) => {
    state.coopRelay ??= {};
    const store = state.coopRelay as Store;
    for (const [code, queue] of Object.entries(store)) {
      queue.items = queue.items.filter(item => Date.now() - item.at < RELAY_TTL_MS).slice(-MAX_QUEUE);
      if (!queue.items.length) delete store[code];
    }
    value = store;
  });
  return value;
}

async function push(code: string, from: RelayMessage['from'], body: string): Promise<RelayMessage | null> {
  if (typeof body !== 'string' || body.length === 0 || body.length > MAX_BODY) return null;
  const now = Date.now();
  if (getMode() === 'postgres') {
    await migrate();
    const rows = await pgQuery<{ seq: string }>(
      `INSERT INTO "coop_relay" ("code","seq","from_side","body","at")
       VALUES ($1, COALESCE((SELECT MAX("seq") + 1 FROM "coop_relay" WHERE "code" = $1), 1), $2, $3, $4)
       RETURNING "seq"`,
      [code, from, body, new Date(now).toISOString()],
    );
    return { seq: Number(rows[0]?.seq ?? 1), from, body, at: now };
  }
  let created: RelayMessage | null = null;
  await withLocalLock(async (state: any) => {
    state.coopRelay ??= {};
    const store = state.coopRelay as Store;
    const queue = (store[code] ??= { next: 1, items: [] });
    created = { seq: queue.next++, from, body, at: now };
    queue.items.push(created);
    queue.items = queue.items.filter(item => now - item.at < RELAY_TTL_MS).slice(-MAX_QUEUE);
  });
  return created;
}

/** Messages with `seq > since`, and nothing belonging to the reader itself. */
async function drain(code: string, since: number, side: RelayMessage['from']): Promise<RelayMessage[]> {
  const store = await readStore();
  const queue = store[code];
  if (!queue) return [];
  return queue.items.filter(item => item.seq > since && item.from !== side);
}

export const relayStore = { readStore, push, drain };
