import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { games } from '@/lib/games';
import { ProxyGameFrame } from '@/components/ProxyGameFrame';

export const dynamic = 'force-dynamic';

/**
 * Chrome-free player for titles that only exist as a live site. The page shows
 * nothing but the game: no address bar, no proxy branding, no navigation. The
 * proxy runs behind the scenes in the service worker.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const game = games.find(entry => entry.id === id);
  return { title: game ? `${game.title} · GG-LOUNGE` : 'GG-LOUNGE', robots: { index: false } };
}

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = games.find(entry => entry.id === id && entry.proxy);
  if (!game) notFound();
  return <ProxyGameFrame title={game.title} target={game.path} />;
}
