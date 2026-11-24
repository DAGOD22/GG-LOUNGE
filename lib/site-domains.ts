/**
 * Every address the lounge answers on.
 *
 * This site is one deployment behind several names. Some are obvious, some are
 * deliberate disguises, and one of them redirects to another — which means the
 * list cannot be derived from anything in the codebase and has to be declared.
 *
 * Rules this module enforces so the doc cannot drift from reality:
 *
 *   · `canonical` is the address the site *says* it is. It is what
 *     `SITE_ORIGIN` resolves to and what `absolute()` builds from.
 *   · `redirectsTo` marks a host that 308s somewhere else. The doc lists it
 *     anyway, because a link someone already has should be documented even when
 *     it forwards, but it must not be presented as a separate copy of the site.
 *   · `disguise` explains why a name exists at all. Redeploying the same lounge
 *     under a lookalike host is only harmless if it is labelled honestly; an
 *     unlabelled clone of a site called "GG-LOUNGE" on a domain called
 *     "thisisascamwebsite" is the one combination that should never ship.
 *
 * Every entry here was checked against the live deployment before it was added
 * (GET /api/health returned the lounge's own JSON). Adding a domain to Vercel
 * does not add it here automatically, and that is on purpose: this list is a
 * statement about where the site is reachable, not a mirror of the dashboard.
 */

export type SiteDomain = {
  /** Bare host, no scheme, no trailing slash. */
  host: string;
  /** True for the one address every link should use. */
  canonical?: boolean;
  /** Set when this host redirects rather than serving. */
  redirectsTo?: string;
  /** Why this name exists. Shown under the link. */
  note: string;
  /** Marks the deliberate lookalike/decoy hosts. */
  disguise?: 'decoy' | 'alias';
};

/** The canonical origin, without a trailing slash. */
export const CANONICAL_HOST = 'gg-lounge.vercel.app';

/**
 * All hosts, canonical first.
 *
 * Order matters: the page renders this in sequence and the copy-button text
 * follows the same order, so the canonical name is what a reader sees first.
 */
export const SITE_DOMAINS: SiteDomain[] = [
  {
    host: 'gg-lounge.vercel.app',
    canonical: true,
    note: 'The real address. Every share link and every absolute URL on this page points here.',
  },
  {
    host: 'gg-lounge.duckdns.org',
    redirectsTo: 'www.gg-lounge.duckdns.org',
    note: 'Bare duckdns host — 308s to the www form below. Keep it in case an old link uses it.',
    disguise: 'alias',
  },
  {
    host: 'www.gg-lounge.duckdns.org',
    note: 'duckdns host that serves the lounge directly. Same deployment, no redirect.',
    disguise: 'alias',
  },
  {
    host: 'thisisascamwebsite.vercel.app',
    note: 'Deliberate decoy name. Same lounge, for when a recognisable URL would give the game away.',
    disguise: 'decoy',
  },
  {
    host: 'growth-gulid.vercel.app',
    note: 'Deliberate decoy name — reads like a school productivity deck.',
    disguise: 'decoy',
  },
  {
    host: 'talent-tribe.vercel.app',
    note: 'Deliberate decoy name — reads like a student project.',
    disguise: 'decoy',
  },
];

/** Every host as a full origin, canonical first. */
export function siteOrigins(): string[] {
  return SITE_DOMAINS.map(domain => `https://${domain.host}`);
}

/** The hosts split by what they are, for the page's three groups. */
export function domainGroups(): { key: string; label: string; blurb: string; domains: SiteDomain[] }[] {
  return [
    {
      key: 'canonical',
      label: 'Canonical',
      blurb: 'The address the site calls itself. Share this one.',
      domains: SITE_DOMAINS.filter(domain => domain.canonical),
    },
    {
      key: 'aliases',
      label: 'Aliases',
      blurb: 'Same deployment under other names. Both work in a browser.',
      domains: SITE_DOMAINS.filter(domain => domain.disguise === 'alias'),
    },
    {
      key: 'decoys',
      label: 'Decoy names',
      blurb:
        'Unrelated-looking hostnames that serve the same lounge. They are listed here on purpose, not leaked by accident — the point of a decoy is that it is boring to read out loud.',
      domains: SITE_DOMAINS.filter(domain => domain.disguise === 'decoy'),
    },
  ];
}
