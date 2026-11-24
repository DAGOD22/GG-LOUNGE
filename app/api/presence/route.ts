import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/db';
import {
  cleanCursor,
  cleanGameId,
  cleanName,
  countPresence,
  recentLiveEvents,
  touchPresence,
} from '@/lib/db/presence';
import { consumeSharedBudget, callerKey } from '@/lib/live-budget';
import { GHOST_PRESETS, displayName } from '@/lib/presence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Presence heartbeat.
 *
 * One POST does both halves of the feature: it says "I am here, this is where
 * my pointer is, this is what I look like" and returns who else is here plus
 * the latest activity. A separate GET would double the request count for no
 * benefit, and at one call every 2.5 s per player that matters.
 *
 * The caller's identity is never taken from the body. It is the signed-in
 * account's user id, or a signed guest id, exactly like `/api/user-state` — so
 * a client cannot impersonate another player's ghost cursor by editing JSON.
 */
export async function POST(req: Request) {
  // Two calls a second per IP is far beyond any legitimate client, and this is
  // a shared counter across lambda instances rather than a per-process one.
  if (!(await consumeSharedBudget(`presence:${callerKey(req)}`, 120, 60))) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));

  const token = req.headers
    .get('cookie')
    ?.split(';')
    .map(part => part.trim())
    .find(part => part.startsWith('ggl_token='))
    ?.slice('ggl_token='.length)
    .trim() || '';

  let id = '';
  let username: string | null = null;
  const user = token ? await getUserFromToken(token).catch(() => null) : null;
  if (user) {
    id = `u:${user.id}`;
    username = cleanName(user.username);
  } else {
    // Guests are identified by the same signed token the rest of the site
    // uses. Unsigned ids are ignored rather than trusted.
    const guest = req.headers.get('x-gg-guest') || '';
    const { guestIdFromToken } = await import('@/lib/owner');
    const guestId = guestIdFromToken(guest);
    if (guestId) id = `g:${guestId}`;
  }

  if (!id) {
    // No identity, no presence. Watching anonymously would let one browser tab
    // appear as unlimited players.
    return NextResponse.json({ online: 0, others: 0, peers: [], events: [] });
  }

  const cursor = cleanCursor(body?.cursor);
  if (!GHOST_PRESETS.has(cursor.preset)) cursor.preset = 'system';
  const game = cleanGameId(body?.game);

  const { peers, online } = await touchPresence(id, { username, cursor, game });
  const events = await recentLiveEvents().catch(() => []);

  // `online` includes the caller, so it is always at least 1. Everything a
  // person reads is built from the other players instead.
  const others = peers.filter(peer => peer.id !== id);

  return NextResponse.json(
    {
      online,
      others: others.length,
      self: id,
      peers: others.map(peer => ({
        id: peer.id,
        username: peer.username,
        // Resolved here so every client shows the same name for the same
        // player, signed in or not, instead of each one inventing its own.
        name: displayName(peer),
        cursor: peer.cursor,
        game: peer.game,
        seen: peer.seenAt,
      })),
      // The store speaks `createdAt`, the client type speaks `at`. Sending both
      // means a consumer can use either without silently reading `undefined` —
      // which is what happened when only the store's field name went out.
      events: events.map(event => ({
        id: event.id,
        kind: event.kind,
        name: event.name,
        message: event.message,
        game: event.game,
        at: event.createdAt,
        createdAt: event.createdAt,
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/** Leaving the site: drop the row now instead of waiting out the TTL. */
export async function DELETE(req: Request) {
  const guest = req.headers.get('x-gg-guest') || '';
  const { guestIdFromToken } = await import('@/lib/owner');
  const guestId = guestIdFromToken(guest);
  if (!guestId) return NextResponse.json({ ok: true });
  const { dropPresence } = await import('@/lib/db/presence');
  await dropPresence(`g:${guestId}`).catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function GET() {
  // A bare GET is a cheap way to ask "is anyone on?" without writing a row.
  const events = await recentLiveEvents().catch(() => []);
  // `mode` and `live` are here to be diagnosable: the difference between "no
  // one is playing" and "the live tables were never created" is invisible from
  // the outside otherwise, and this endpoint is the one place to see it.
  const { getMode } = await import('@/lib/db/connection');
  const mode = getMode();
  const live = await countPresence().catch(() => null);
  return NextResponse.json(
    {
      events: events.map(event => ({
        id: event.id,
        kind: event.kind,
        name: event.name,
        message: event.message,
        game: event.game,
        at: event.createdAt,
        createdAt: event.createdAt,
      })),
      mode,
      online: live,
      live: live !== null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
