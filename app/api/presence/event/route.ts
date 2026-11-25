import { NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/db';
import { games } from '@/lib/games';
import { allowEvent, cleanGameId, cleanName, hostOnly, pushLiveEvent } from '@/lib/db/presence';
import { TOOLS } from '@/lib/tools/registry';
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
  // The feed used to be games-only, so "what are other people doing" could
  // never include the proxy or the apps page. These three cover the rest of
  // the site, with the noun supplied by the server rather than the client.
  visited: (name, title) => `${name} opened ${title}`,
  browsing: (name, title) => `${name} is browsing ${title} in the proxy`,
  tool: (name, title) => `${name} is using ${title}`,
};

/** Registry names, so a tool event can only name a tool that exists. */
const TOOL_NAMES = new Set(TOOLS.map(tool => tool.name));

/**
 * Where a client is allowed to say it went.
 *
 * Deliberately a closed set of *pages*, not a URL: a feed that echoes an
 * arbitrary path is a feed that can be made to say anything, and one that
 * echoes a proxied URL would leak another player's search terms.
 */
const PAGE_LABELS: Record<string, string> = {
  '/': 'the lounge',
  '/apps': 'the apps page',
  '/tools': 'the tools page',
  '/proxy': 'the proxy',
  '/gg-gpt': 'GG-GPT',
  '/request-game': 'game requests',
  '/youtube': 'the YouTube player',
};

/**
 * The trusted label for an event.
 *
 * This is the whole reason the feed can carry proxy visits and app opens
 * without becoming a text box: the client sends an id, a page path or a URL,
 * and *this function* decides what sentence that becomes. Anything it does not
 * recognise returns null and nothing is published.
 */
function resolveTarget(
  kind: string,
  body: Record<string, unknown>,
  gameId: string | null,
): { label: string; game: string | null; target: string | null } | null {
  if (kind === 'launch' || kind === 'achievement' || kind === 'join') {
    // Only advertise titles that are actually in the catalogue — the feed must
    // not become an oracle for hidden or unpublished ids, and the title is
    // taken from the catalogue so the sentence is never client text.
    const game = gameId ? games.find(entry => entry.id === gameId) : null;
    return game ? { label: game.title, game: game.id, target: game.id } : null;
  }
  if (kind === 'room') return { label: 'a co-op room', game: null, target: null };
  if (kind === 'visited') {
    const page = typeof body?.page === 'string' ? body.page.split('?')[0].split('#')[0] : '';
    const label = PAGE_LABELS[page];
    return label ? { label, game: null, target: page } : null;
  }
  if (kind === 'browsing') {
    // Hostname only: no path, no query, no search terms.
    const host = hostOnly(typeof body?.url === 'string' ? body.url : '');
    return host ? { label: host, game: null, target: host } : null;
  }
  if (kind === 'tool') {
    const tool = typeof body?.tool === 'string' ? body.tool.trim().slice(0, 40) : '';
    // Tool names come from the registry, so match one rather than trusting it.
    const known = TOOL_NAMES.has(tool) ? tool : '';
    return known ? { label: known, game: null, target: null } : null;
  }
  return null;
}

export async function POST(req: Request) {
  if (!(await consumeSharedBudget(`event:${callerKey(req)}`, 40, 60))) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const kind = typeof body?.kind === 'string' ? body.kind : '';
  const template = TEMPLATES[kind];
  if (!template) return NextResponse.json({ error: 'unknown kind' }, { status: 400 });

  const gameId = cleanGameId(body?.gameId);
  // resolveTarget turns whatever the client sent into a trusted label, or
  // nothing. A launch needs a real catalogue id; a visit needs a known page or
  // a hostname and nothing else.
  const target = resolveTarget(kind, body, gameId);
  if (!target) return NextResponse.json({ ok: false });

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
  const windowSeconds = kind === 'launch' || kind === 'browsing' ? 60 : 20;
  if (!(await allowEvent(id, kind, windowSeconds))) return NextResponse.json({ ok: true, skipped: true });

  await pushLiveEvent(kind, shown, template(shown, target.label), target.game, {
    target: target.target,
    label: target.label,
  });
  return NextResponse.json({ ok: true });
}
