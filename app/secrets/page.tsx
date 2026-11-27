import type { Metadata } from 'next';
import { VaultPage } from '@/components/live/secrets/VaultPage';

/**
 * The Vault — the unlisted page for the site's ten secret features.
 *
 * The secrecy is enforced on the surface, not by obscurity theatre: this page
 * has `robots: noindex, nofollow`, it is absent from the sitemap, `robots.txt`
 * disallows it, and nothing anywhere links to it. It exists so that the person
 * who knows the address can see what they have found and what is left.
 */
export const metadata: Metadata = {
  title: 'The Vault',
  description: 'A page with nothing on it that anyone was meant to find.',
  robots: { index: false, follow: false },
};

export default function SecretsPage() {
  return <VaultPage />;
}
