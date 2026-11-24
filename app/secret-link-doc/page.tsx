import type { Metadata } from 'next';
import Link from 'next/link';
import { Gamepad2, ArrowUpRight, Link2, AlertTriangle, Hash } from 'lucide-react';
import { games } from '@/lib/games';
import {
  absolute,
  appLinks,
  gameGroups,
  internalRoutes,
  plainDirectory,
  SITE_ORIGIN,
  sitePages,
  staticAssets,
} from '@/lib/link-map';
import { domainGroups, SITE_DOMAINS } from '@/lib/site-domains';
import { CopyDirectoryButton } from '@/components/CopyDirectoryButton';
import './link-doc.css';

/**
 * The link directory.
 *
 * Not in the navigation and not in the sitemap: it is a reference page for
 * whoever has the address, not a landing page. Everything on it is generated
 * from the catalogue, so the game lists cannot go stale the way a hand-written
 * list would.
 *
 * The page deliberately separates "send this to a friend" from "this endpoint
 * exists". Mixing the two is how a private route ends up pasted into a group
 * chat, so the internal half is labelled as internal and kept below the useful
 * half.
 */

export const metadata: Metadata = {
  title: 'Every link on GG-Lounge',
  description:
    'The complete GG-Lounge directory: every game landing page, player link and raw file, plus the lounge pages, app launchers and API routes.',
  // A reference page should not compete with the real library in search.
  robots: { index: false, follow: true },
  alternates: { canonical: '/secret-link-doc' },
};

const GAME_COUNT = games.length;

export default function SecretLinkDocPage() {
  const groups = gameGroups();
  const pages = sitePages();
  const appsSection = appLinks();
  const internal = internalRoutes();
  const statics = staticAssets();
  const misc = groups.find(group => group.key === 'Misc');

  return (
    <main className="lounge-shell" id="main-content">
      <div className="noise" aria-hidden="true" />

      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-mark"><Gamepad2 size={19} /></span>
          <span>GG-LOUNGE<span className="tm">™</span></span>
        </Link>
        <nav className="header-nav">
          <Link href="/">Library</Link>
          <Link href="/apps">Apps</Link>
          <Link href="/proxy">Proxy</Link>
          <Link href="/gg-gpt">GG-GPT</Link>
        </nav>
        <div className="header-status"><span className="live-dot" /> Link directory</div>
      </header>

      <section className="catalog doc-shell">
        <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={14} /> UNLISTED • {GAME_COUNT} GAMES • {groups.length} CATEGORIES •{' '}
          {SITE_DOMAINS.length} ADDRESSES
        </p>
        <h1 className="doc-title">Every link on GG-Lounge<span>.</span></h1>
        <p className="doc-lede">
          This is the whole map: every address the lounge answers on, its own pages, every playable
          title in all three of its URL shapes, the app launchers, the files and the API. It is
          generated from the catalogue itself, so if a game is listed here it has files behind it —
          nothing on this page is a guess, and nothing here points at a title the site has quietly
          dropped.
        </p>

        {/* All six hostnames as one glanceable row, before the long sections. */}
        <p className="doc-hostline" aria-label="All addresses">
          {SITE_DOMAINS.map((domain, index) => (
            <span key={domain.host}>
              <a href={`https://${domain.host}`} rel="noopener">{domain.host}</a>
              {index < SITE_DOMAINS.length - 1 && <span aria-hidden="true"> · </span>}
            </span>
          ))}
        </p>

        <div className="doc-callout">
          <Hash size={16} />
          <p>
            <strong>Three links per game, each for a different job.</strong> The{' '}
            <strong>landing page</strong> (<code>/g/&lt;id&gt;</code>) is the one to share — it has the
            title, description and preview image for link unfurls. The <strong>play</strong> link
            (<code>/?game=&lt;id&gt;</code>) opens the lounge with that game already running. The{' '}
            <strong>player</strong> (<code>/play/&lt;id&gt;</code>) is chrome-free, just the game.
            The raw file is what the browser loads inside the frame.
          </p>
        </div>

        <div className="doc-actions">
          <CopyDirectoryButton text={plainDirectory()} />
          <a className="doc-action" href="/sitemap.xml">Sitemap <ArrowUpRight size={13} /></a>
          <a className="doc-action" href="/api/games">Catalogue JSON <ArrowUpRight size={13} /></a>
          <span className="doc-origin">{SITE_ORIGIN.replace(/^https?:\/\//, '')}</span>
        </div>

        {/*
          Every address, before anything else.
          The whole point of this page is "where is the lounge", and the answer
          has six parts. It goes first so a reader never has to scroll past 250
          games to find the second hostname.
        */}
        <section className="doc-section" id="addresses">
          <div className="doc-section-head">
            <h2>Every address <span>{SITE_DOMAINS.length}</span></h2>
            <p>
              This is one deployment reachable at six hostnames. The canonical one is what every
              link on this page is built from; the rest serve the same lounge. They are listed
              rather than hidden: a link someone already has should still work, and a decoy name
              is only useful if you know it exists.
            </p>
          </div>

          {domainGroups().map(group => (
            <div className="doc-domain-group" key={group.key}>
              <h3 className="doc-domain-label">
                {group.label} <span>{group.domains.length}</span>
              </h3>
              <p className="doc-domain-blurb">{group.blurb}</p>
              <ul className="doc-domains">
                {group.domains.map(domain => (
                  <li key={domain.host} className={domain.canonical ? 'is-canonical' : undefined}>
                    <a href={`https://${domain.host}`} rel="noopener">
                      <code>{domain.host}</code>
                      {domain.canonical && <span className="doc-badge">canonical</span>}
                      {domain.redirectsTo && (
                        <span className="doc-badge doc-badge-muted">308 → {domain.redirectsTo}</span>
                      )}
                      {domain.disguise === 'decoy' && (
                        <span className="doc-badge doc-badge-warn">decoy</span>
                      )}
                    </a>
                    <span className="doc-note">{domain.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <Section section={pages} />

        <section className="doc-section" id="games">
          <div className="doc-section-head">
            <h2>Games <span>{GAME_COUNT}</span></h2>
            <p>
              Grouped by the same shelves the library uses. Anything whose genre has no tab on the
              front page — shooters, strategy, sports, the one-offs — is collected into{' '}
              <strong>{misc?.games.length ?? 0} Misc</strong> at the bottom instead of pretending to
              be a category of its own.
            </p>
          </div>

          {groups.map(group => (
            <div className="doc-group" key={group.key} id={`cat-${group.key.toLowerCase()}`}>
              <div className="doc-group-head">
                <h3>
                  {group.label} <span>{group.games.length}</span>
                </h3>
                {group.blurb && <p>{group.blurb}</p>}
              </div>
              <ul className="doc-games">
                {group.games.map(game => (
                  <li key={game.id} className="doc-game">
                    <a className="doc-game-title" href={game.landing}>
                      {game.title}
                      {game.proxied && <span className="doc-tag">proxy</span>}
                    </a>
                    <span className="doc-game-links">
                      <a href={game.landing} title="Landing page"><code>/g/{game.id}</code></a>
                      <a href={game.play} title="Open in the lounge"><code>?game={game.id}</code></a>
                      <a href={game.player} title="Chrome-free player"><code>/play/{game.id}</code></a>
                      <a href={game.raw} title="Raw game file"><code>file</code></a>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <Section section={appsSection} />
        <Section section={statics} />

        <section className="doc-section" id="internal">
          <div className="doc-section-head">
            <h2>{internal.label} <span>{internal.links.length}</span></h2>
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertTriangle size={15} style={{ flex: '0 0 auto', marginTop: 2, color: 'var(--coral)' }} />
              <span>
                {internal.blurb} Several of these are admin-scoped, rate-limited or POST-only;
                opening them in a browser tab is expected to fail. They are documented so the map is
                complete, not because they are useful links. Tickets marked <em>Internal</em> should
                not be shared.
              </span>
            </p>
          </div>
          <ul className="doc-links">
            {internal.links.map(link => (
              <li key={`${link.label}-${link.href}`}>
                <a href={link.href}><code>{link.label}</code></a>
                {link.note && <span className={`doc-note${link.note.startsWith('Internal') ? ' doc-note-warn' : ''}`}>{link.note}</span>}
              </li>
            ))}
          </ul>
        </section>

        <footer className="doc-footer">
          <p>
            Made by <strong>DAGOD22</strong> — GG-Lounge Studios™. Games remain the property of their
            respective creators; the links here point at copies this site hosts.
          </p>
          <span>
            <Link href="/">Library</Link> • <Link href="/privacy">Privacy</Link> •{' '}
            <Link href="/terms">Terms</Link>
          </span>
        </footer>
      </section>
    </main>
  );
}

function Section({ section }: { section: { label: string; blurb: string; links: { label: string; href: string; note?: string }[] } }) {
  return (
    <section className="doc-section" id={section.label.toLowerCase().replace(/[^a-z]+/g, '-')}>
      <div className="doc-section-head">
        <h2>{section.label} <span>{section.links.length}</span></h2>
        <p>{section.blurb}</p>
      </div>
      <ul className="doc-links">
        {section.links.map(link => (
          <li key={link.href}>
            <a href={link.href}><code>{link.label}</code></a>
            {link.note && <span className="doc-note">{link.note}</span>}
            <span className="doc-abs">{absolute(link.href)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
