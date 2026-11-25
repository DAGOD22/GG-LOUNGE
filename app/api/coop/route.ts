import { NextResponse } from 'next/server';
import { answerRoom, closeRoom, createRoom, getRoom, touchRoom } from '@/lib/db/coop';
import { cleanName } from '@/lib/db/presence';
import { consumeSharedBudget, callerKey } from '@/lib/live-budget';
import { decodeSignal, isValidRoomCode, normalizeRoomCode, roomCodeFrom } from '@/lib/coop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Room signalling. Four actions, one route:
 *
 *   create   host parks its offer, gets back a code
 *   answer   guest posts its answer for that code
 *   poll     either side reads the other's half of the handshake
 *   close    either side ends the room
 *
 * The offer and answer are opaque strings validated by `lib/db/coop` (they must
 * look like SDP and are size-capped), so nothing here trusts the body beyond
 * "is this shaped like a session description".
 */
export async function POST(req: Request) {
  if (!(await consumeSharedBudget(`coop:${callerKey(req)}`, 120, 60))) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action : '';
  const name = cleanName(body?.name) ?? 'Player';

  if (action === 'create') {
    // The code is derived from the offer itself, so a host does not need the
    // server to allocate one — and two hosts in the same minute still get
    // different codes because their offers differ.
    const offer = typeof body?.offer === 'string' ? body.offer : '';
    let code = roomCodeFrom(offer);
    let room = await createRoom(code, offer, name);
    if (!room) {
      // Collision with a live room: salt and try a few more times rather than
      // handing back a code that is already in use.
      for (let attempt = 0; attempt < 5 && !room; attempt++) {
        code = roomCodeFrom(`${offer}:${attempt}:${Date.now()}`);
        room = await createRoom(code, offer, name);
      }
    }
    if (!room) {
      // Distinguish "your offer was rejected" from "we could not store it":
      // they need completely different answers from the player, and collapsing
      // them into one message is how the base64/SDP bug stayed invisible.
      return NextResponse.json(
        {
          error: decodeSignal(offer)
            ? 'The room server could not store that room. Try again in a moment.'
            : 'That connection offer was not readable. Reload the page and try again.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ code: room.code, status: room.status });
  }

  const rawCode = typeof body?.code === 'string' ? body.code : '';
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) return NextResponse.json({ error: 'Invalid code' }, { status: 400 });

  if (action === 'answer') {
    const answer = typeof body?.answer === 'string' ? body.answer : '';
    const room = await answerRoom(code, answer, name);
    if (!room) return NextResponse.json({ error: 'That room code is not open' }, { status: 404 });
    return NextResponse.json({ ok: true, status: room.status });
  }

  if (action === 'poll') {
    const room = await touchRoom(code);
    if (!room) return NextResponse.json({ error: 'That room code is not open' }, { status: 404 });
    return NextResponse.json({
      offer: room.offer,
      answer: room.answer,
      hostName: room.hostName,
      guestName: room.guestName,
      status: room.status,
    });
  }

  if (action === 'close') {
    await closeRoom(code);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

/** A cheap existence check so the join field can say "not open" before typing. */
export async function GET(req: Request) {
  const code = normalizeRoomCode(new URL(req.url).searchParams.get('code') ?? '');
  if (!isValidRoomCode(code)) return NextResponse.json({ open: false });
  const room = await getRoom(code);
  return NextResponse.json({ open: Boolean(room), status: room?.status ?? null });
}
