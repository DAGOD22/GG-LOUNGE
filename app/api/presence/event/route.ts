import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/db';
import { games } from '@/lib/games';
import { allowEvent, cleanGameId, cleanName, pushLiveEvent } from '@/lib/db/presence';
import { consumeSharedBudget, callerKey } from '@/lib/live-budget';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Publish one activity event.
 *
 * The client sends a *kind* and a *game id*, never the sentence. The sentence
 * is composed here from the catalogue's own title and a fixed template, which
 * is what keeps the feed from becoming a public text field — there is no way
 * to get arbitrary words into it, so there is nothing to moderate.
 */
const TEMPLATES: Record<string, (name: string, title: string) => string> = {
  launch: (name, title) => `${name} just launched ${title}`,
  achievement: (name, title) => `${name} unlocked an achievement in ${title}`,
  room: name => `${name} opened a co-op room`,
  join: (name, title) => `${name} joined ${title} in split screen`,
};

export async function POST(req: Request) {
  if (!(await consumeSharedBudget(`event:${callerKey(req)}`, 40, 60))) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const kind = typeof body?.kind === 'string' ? body.kind : '';
  const template = TEMPLATES[kind];
  if (!template) return NextResponse.json({ error: 'unknown kind' }, { status: 400 });

  const gameId = cleanGameId(body?.gameId);
  if (!gameId) return NextResponse.json({ error: 'unknown game' }, { status: 400 });

  // Only advertise titles that are actually in the catalogue *and* playable —
  // the feed must not become an oracle for hidden or unpublished ids. The
  // title is taken from the catalogue, so the sentence is never client text.
  const game = games.find(entry => entry.id === gameId);
  if (!game) return NextResponse.json({ ok: false });

  const token = req.headers
    .get('cookie')
    ?.split(';')
    .map(part => part.trim())
    .find(part => part.startsWith('ggl_token='))
    ?.slice('ggl_token='.length)
    .trim() || '';
  const user = token ? await getUserFromToken(token).catch(() => null) : null;

  let id = '';
  let name: string | null = null;
  if (user) {
    id = `u:${user.id}`;
    name = cleanName(user.username);
  } else {
    const { guestIdFromToken } = await import('@/lib/owner');
    const guestId = guestIdFromToken(req.headers.get('x-gg-guest') || '');
    if (guestId) id = `g:${guestId}`;
  }
  if (!id) return NextResponse.json({ ok: false });

  const { ghostName, displayName } = await import('@/lib/presence');
  const shown = displayName({ id, username: name }) || ghostName(id);

  // One launch announcement per player per minute: a person cycling through
  // games should not own the feed.
  const windowSeconds = kind === 'launch' ? 60 : 20;
  if (!(await allowEvent(id, kind, windowSeconds))) return NextResponse.json({ ok: true, skipped: true });

  await pushLiveEvent(kind, shown, template(shown, game.title), game.id);
  return NextResponse.json({ ok: true });
}
