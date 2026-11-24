/**
 * Live presence and the activity feed.
 *
 * There is no WebSocket server here, and that is a deliberate architectural
 * choice rather than a shortcut. The site runs as serverless functions on
 * Vercel, where a socket cannot outlive the request that opened it, so a
 * "realtime channel" in the usual sense would either need a second paid host
 * or would work in dev and silently die in production. Instead every client
 * posts a heartbeat every couple of seconds and reads a snapshot in the same
 * round trip, which is one indexed query on a table that holds only currently
 * online players. The client-side cost is smoothed by interpolation: ghost
 * cursors ease toward their target at 60fps, so a 2.5 s poll still looks
 * continuous instead of stepping.
 */
import { getMode, pgQuery, migrate } from './connection';
import { withLocalLock, readLocal } from './local-store';

export const PRESENCE_TTL_MS = 30_000;
const EVENT_KEEP = 200;
const POLL_EVENTS = 8;

/** The fixed set of things a player can be doing. Never free text. */
export const ACTIVITY_KINDS = ['game', 'app', 'page', 'proxy', 'tools', 'idle'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityInput = { kind: ActivityKind; label: string; game: string | null };

/**
 * Bound an activity payload.
 *
 * `label` is the only field that can carry user-visible text, so it is the only
 * one worth worrying about: control characters stripped, length capped at 40,
 * and for a proxy destination reduced to a bare hostname. A path or a query on
 * a proxied URL can contain a search term, a reset token or a username, and a
 * roster that broadcasts those to every other player is a privacy hole, not a
 * feature.
 */
export function cleanActivity(input: unknown): ActivityInput | null {
  const raw = (input ?? {}) as Record<string, unknown>;
  const kind = typeof raw.kind === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(raw.kind)
    ? (raw.kind as ActivityKind)
    : null;
  if (!kind || kind === 'idle') return null;
  const label = String(raw.label ?? '')
    // Control characters, but also the invisible ones: a zero-width space or a
    // bidi override lets a label look like one thing while being another, and
    // the roster renders it as-is.
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .trim()
    .slice(0, 40);
  if (!label) return null;
  const game = kind === 'game' ? cleanGameId(raw.game) : null;
  return { kind, label: kind === 'proxy' ? hostOnly(label) : label, game };
}

/** `https://www.youtube.com/watch?v=x` → `youtube.com`. Anything odd → ''. */
export function hostOnly(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    // A label must look like a hostname. Without this, any bare word the client
    // sends becomes a "destination" in the roster ("in the proxy on hello").
    if (!host.includes('.') || !/[a-z]/.test(host)) return '';
    return host.slice(0, 60);
  } catch {
    return '';
  }
}

export type PresenceCursorInput = {
  x: number;
  y: number;
  preset: string;
  image: string;
  size: number;
  accent: string;
};

export type PresenceRow = {
  id: string;
  username: string | null;
  cursor: PresenceCursorInput;
  game: string | null;
  activity: ActivityInput | null;
  seenAt: number;
};

export type LiveEventRow = {
  id: number;
  kind: string;
  name: string;
  message: string;
  game: string | null;
  target: string | null;
  label: string | null;
  createdAt: number;
};

/**
 * `visited` is the one the feed needed and did not have: "opened the proxy on
 * youtube.com" and "is on the apps page" are what the user asked to see, and
 * neither is a launch.
 */
const ALLOWED_KINDS = new Set(['launch', 'achievement', 'online', 'room', 'join', 'visited']);

/** Trim and bound a name that will be shown to other players. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
  return name || null;
}

/** Trim and bound a catalogue id; no free text ever reaches the feed through it. */
export function cleanGameId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id) ? id : null;
}

/** Bound a client-supplied cursor payload before it is stored or fanned out. */
export function cleanCursor(input: unknown): PresenceCursorInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, value))
      : fallback;
  const preset = typeof raw.preset === 'string' ? raw.preset : 'system';
  const image = typeof raw.image === 'string' && raw.image.length <= 40_000 ? raw.image : '';
  const accent = typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent)
    ? raw.accent
    : '#d7f34a';
  return {
    x: number(raw.x, 0, 100, 50),
    y: number(raw.y, 0, 100, 50),
    // Whitelisted by the caller (GHOST_PRESETS); anything else is a plain
    // pointer rather than an unknown preset the client cannot draw.
    preset,
    image,
    size: Math.round(number(raw.size, 16, 64, 40)),
    accent,
  };
}

type LocalPresence = { presence: Record<string, PresenceRow>; events: LiveEventRow[] };

/**
 * Record a heartbeat and return everyone else who is still online.
 *
 * The write and the read happen together so a player sees the room they just
 * joined rather than the room as it was one poll ago.
 */
export async function touchPresence(
  id: string,
  data: {
    username: string | null;
    cursor: PresenceCursorInput;
    game: string | null;
    activity: ActivityInput | null;
  },
): Promise<{ peers: PresenceRow[]; online: number }> {
  const now = Date.now();
  const cutoff = now - PRESENCE_TTL_MS;

  if (getMode() === 'postgres') {
    await migrate();
    await pgQuery(
      `INSERT INTO "live_presence"
         ("id","username","x","y","cursor_preset","cursor_image","cursor_size","accent","game","kind","label","seen_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT ("id") DO UPDATE SET
         "username"=EXCLUDED."username", "x"=EXCLUDED."x", "y"=EXCLUDED."y",
         "cursor_preset"=EXCLUDED."cursor_preset", "cursor_image"=EXCLUDED."cursor_image",
         "cursor_size"=EXCLUDED."cursor_size", "accent"=EXCLUDED."accent",
         "game"=EXCLUDED."game", "kind"=EXCLUDED."kind", "label"=EXCLUDED."label",
         "seen_at"=NOW()`,
      [
        id,
        data.username,
        data.cursor.x,
        data.cursor.y,
        data.cursor.preset,
        data.cursor.image,
        data.cursor.size,
        data.cursor.accent,
        data.game,
        data.activity?.kind ?? null,
        data.activity?.label ?? null,
      ],
    );
    // Housekeeping rides along with the write that would have created the row.
    await pgQuery('DELETE FROM "live_presence" WHERE "seen_at" < $1', [new Date(cutoff).toISOString()]);
    const rows = await pgQuery<{
      id: string; username: string | null; x: number; y: number;
      preset: string; image: string; size: number; accent: string;
      game: string | null; kind: string | null; label: string | null; seen: string;
    }>(
      `SELECT "id","username","x","y","cursor_preset" AS "preset","cursor_image" AS "image",
              "cursor_size" AS "size","accent","game","kind","label","seen_at" AS "seen"
         FROM "live_presence" WHERE "seen_at" >= $1 ORDER BY "seen_at" DESC LIMIT 80`,
      [new Date(cutoff).toISOString()],
    );
    const peers = rows.map(row => ({
      id: row.id,
      username: row.username,
      cursor: {
        x: Number(row.x),
        y: Number(row.y),
        preset: row.preset,
        image: row.image,
        size: Number(row.size),
        accent: row.accent,
      },
      game: row.game,
      activity: row.kind && row.label
        ? { kind: row.kind as ActivityKind, label: row.label, game: row.game }
        : null,
      seenAt: new Date(row.seen).getTime(),
    }));
    return { peers, online: peers.length };
  }

  let peers: PresenceRow[] = [];
  await withLocalLock(async (store: any) => {
    const presence: Record<string, PresenceRow> = (store.presence ??= {});
    for (const [key, row] of Object.entries(presence)) {
      if (row.seenAt < cutoff) delete presence[key];
    }
    presence[id] = {
      id,
      username: data.username,
      cursor: data.cursor,
      game: data.game,
      activity: data.activity,
      seenAt: now,
    };
    peers = Object.values(presence).sort((a, b) => b.seenAt - a.seenAt).slice(0, 80);
  });
  return { peers, online: peers.length };
}

/** How many people the live tables think are online. Null when unreachable. */
export async function countPresence(): Promise<number> {
  const cutoff = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
  if (getMode() === 'postgres') {
    await migrate();
    const rows = await pgQuery<{ n: string }>(
      'SELECT COUNT(*)::text AS "n" FROM "live_presence" WHERE "seen_at" >= $1',
      [cutoff],
    );
    return Number(rows[0]?.n ?? 0);
  }
  const store = (await readLocal()) as unknown as LocalPresence;
  const presence = store.presence ?? {};
  const now = Date.now();
  return Object.values(presence).filter(row => row.seenAt >= now - PRESENCE_TTL_MS).length;
}

/** Forget a player immediately, for the "leaving the site" path. */
export async function dropPresence(id: string): Promise<void> {
  if (getMode() === 'postgres') {
    await migrate();
    await pgQuery('DELETE FROM "live_presence" WHERE "id"=$1', [id]);
    return;
  }
  await withLocalLock(async (store: any) => {
    if (store.presence) delete store.presence[id];
  });
}

/**
 * Append an activity event.
 *
 * The message is composed on the server from a fixed set of templates and the
 * player's own display name, never from client text — otherwise the feed is a
 * public chat box with extra steps, which is a moderation problem this feature
 * does not need.
 */
export async function pushLiveEvent(
  kind: string,
  name: string,
  message: string,
  game: string | null = null,
  extra: { target?: string | null; label?: string | null } = {},
): Promise<void> {
  if (!ALLOWED_KINDS.has(kind)) return;
  const safeMessage = message.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
  const safeName = (cleanName(name) ?? 'Someone').slice(0, 24);

  if (getMode() === 'postgres') {
    await migrate();
    await pgQuery(
      `INSERT INTO "live_event" ("kind","name","message","game","target","label") VALUES ($1,$2,$3,$4,$5,$6)`,
      [kind, safeName, safeMessage, game, extra.target ?? null, extra.label ?? null],
    );
    // Keep the table bounded; the feed only ever reads the newest handful.
    await pgQuery(
      `DELETE FROM "live_event" WHERE "id" < (
         SELECT COALESCE(MIN("id"),0) FROM (
           SELECT "id" FROM "live_event" ORDER BY "id" DESC LIMIT $1
         ) AS recent)`,
      [EVENT_KEEP],
    );
    return;
  }

  await withLocalLock(async (store: any) => {
    const events: LiveEventRow[] = (store.events ??= []);
    events.push({
      id: (events.at(-1)?.id ?? 0) + 1,
      kind,
      name: safeName,
      message: safeMessage,
      game,
      target: extra.target ?? null,
      label: extra.label ?? null,
      createdAt: Date.now(),
    });
    if (events.length > EVENT_KEEP) events.splice(0, events.length - EVENT_KEEP);
  });
}

/** The newest few events, so a fresh page shows a populated feed. */
export async function recentLiveEvents(limit = POLL_EVENTS): Promise<LiveEventRow[]> {
  const take = Math.max(1, Math.min(limit, 40));
  if (getMode() === 'postgres') {
    await migrate();
    const rows = await pgQuery<{
      id: string; kind: string; name: string; message: string; game: string | null;
      target: string | null; label: string | null; created: string;
    }>(
      `SELECT "id","kind","name","message","game","target","label","created_at" AS "created"
         FROM "live_event" ORDER BY "id" DESC LIMIT $1`,
      [take],
    );
    return rows.map(row => ({
      id: Number(row.id),
      kind: row.kind,
      name: row.name,
      message: row.message,
      game: row.game,
      target: row.target,
      label: row.label,
      createdAt: new Date(row.created).getTime(),
    }));
  }
  const store = (await readLocal()) as unknown as LocalPresence;
  const events = store.events ?? [];
  return events.slice(-take).reverse();
}

/** Throttles "Sam just launched Slope" so one player cannot flood the feed. */
export async function allowEvent(id: string, kind: string, windowSeconds: number): Promise<boolean> {
  const { consumeSharedBudget } = await import('../live-budget');
  return consumeSharedBudget(`evt:${kind}:${id}`, 1, windowSeconds);
}
