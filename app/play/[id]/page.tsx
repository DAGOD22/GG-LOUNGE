import { GAME_FRAME_SANDBOX } from '@/lib/frame-policy'
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { games } from '@/lib/games';
import { ProxyGameFrame } from '@/components/ProxyGameFrame';

export const dynamic = 'force-dynamic';

/**
 * Chrome-free player.
 *
 * This route is what a copied game link points at, so it has to work for every
 * game, not only the proxied ones. A local game previously 404'd here even
 * though /? game=<id> would have launched it — a shared link that dead-ends is
 * worse than no share button at all.
 *
 *   · proxied titles render through the built-in browser (ProxyGameFrame)
 *   · local titles render their own files in a full-viewport frame
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const game = games.find(entry => entry.id === id);
  return { title: game ? game.title : 'Play', robots: { index: false } };
}

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = games.find(entry => entry.id === id);
  if (!game) notFound();
  if (game.proxy) return <ProxyGameFrame title={game.title} target={game.path} />;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <Link
        href="/"
        style={{
          position: 'absolute', top: 10, left: 10, zIndex: 2, padding: '7px 12px', borderRadius: 999,
          background: 'rgba(11,13,18,.82)', color: '#f4f2ec', fontSize: 12, fontWeight: 800,
          textDecoration: 'none', border: '1px solid rgba(255,255,255,.18)',
        }}
      >
        ← All games
      </Link>
      <iframe
        src={game.path}
        title={game.title}
        allow="autoplay; fullscreen; gamepad; clipboard-write"
        sandbox={GAME_FRAME_SANDBOX}
        allowFullScreen
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
