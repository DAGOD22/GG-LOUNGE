import { NextResponse } from 'next/server';
import { isValidRoomCode, normalizeRoomCode, shouldForwardKey, parseRoomMessage } from '@/lib/coop';
import { relayStore } from '@/lib/db/relay';
import { describeDbError } from '@/lib/db/errors';
import { callerKey, consumeSharedBudget } from '@/lib/live-budget';
import { getMode, isEphemeralHost } from '@/lib/db/connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The room's fallback transport.
 *
 * Two actions over one route, mirroring the signalling route's shape:
 *
 *   post  push one message into the room's queue
 *   poll  drain everything newer than the caller's cursor
 *
 * This exists because peer-to-peer simply fails on some networks, and a room
 * that cannot connect has no way to say why. The relay is a pipe: bounded,
 * two-minute-lived, and it validates every payload with the *same* parser the
 * data channel uses, so a relayed message cannot be a shape the peer would
 * never have sent directly.
 */

const RELAY_MESSAGE_CAP = 4096;

function storeAvailable(): boolean {
  return !isEphemeralHost() || getMode() === 'postgres';
}

export async function POST(req: Request) {
  // Relay polling is chatty (about 1.5 requests/second per player), so its
  // budget is per room-code rather than per IP: two players behind one school
  // NAT share an address and would otherwise spend one budget between them.
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action : '';
  const code = normalizeRoomCode(typeof body?.code === 'string' ? body.code : '');
  if (!isValidRoomCode(code)) return NextResponse.json({ error: 'Invalid code' }, { status: 400 });

  if (!(await consumeSharedBudget(`relay:${callerKey(req)}:${code}`, 400, 60))) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  if (!storeAvailable()) {
    return NextResponse.json({ error: 'Relay unavailable: no database', relay: false }, { status: 503 });
  }

  const side = body?.side === 'guest' ? 'guest' : 'host';

  try {
    if (action === 'post') {
      const body_ = typeof body?.body === 'string' ? body.body : '';
      if (!body_ || body_.length > RELAY_MESSAGE_CAP) {
        return NextResponse.json({ error: 'Message too large' }, { status: 413 });
      }
      // The envelope must already be a valid room message. Forwarding arbitrary
      // strings would make this a general-purpose message bus.
      let parsed: unknown;
      try {
        parsed = JSON.parse(body_);
      } catch {
        return NextResponse.json({ error: 'Not a room message' }, { status: 400 });
      }
      const message = parseRoomMessage(parsed);
      if (!message) return NextResponse.json({ error: 'Not a room message' }, { status: 400 });
      // A relayed key press is one of the few things worth refusing outright:
      // the data channel only ever carries keys the local toggle allows.
      if (message.t === 'input' && message.frame.t !== 'release-all' && !shouldForwardKey(message.frame.c)) {
        return NextResponse.json({ error: 'Key not forwardable' }, { status: 400 });
      }
      const stored = await relayStore.push(code, side, body_);
      if (!stored) return NextResponse.json({ error: 'Could not queue' }, { status: 503 });
      return NextResponse.json({ ok: true, seq: stored.seq });
    }

    if (action === 'poll') {
      const since = Number.isFinite(Number(body?.since)) ? Math.max(0, Math.trunc(Number(body.since))) : 0;
      const items = await relayStore.drain(code, since, side);
      const cursor = items.length ? items[items.length - 1].seq : since;
      return NextResponse.json({ relay: true, messages: items.map(item => item.body), cursor });
    }
  } catch (cause) {
    const info = describeDbError(cause);
    console.error('[coop/relay]', info.detail);
    return NextResponse.json({ error: info.message, schema: info.schema }, { status: 503 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
