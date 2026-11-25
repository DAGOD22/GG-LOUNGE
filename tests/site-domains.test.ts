/**
 * Every address the lounge answers on.
 *
 * The doc page lists six hostnames. The failure mode worth guarding against is
 * not a typo — it is the list drifting from reality in either direction: a
 * domain added to Vercel but never documented, or a hostname documented that
 * was removed and now 404s. Neither can be caught from source alone, so these
 * tests pin the parts that *are* checkable: the shape of every host, that
 * exactly one is canonical, that the canonical one is what SITE_ORIGIN builds
 * from, and that every host reaches the doc page's own copy text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CANONICAL_HOST, SITE_DOMAINS, domainGroups, siteOrigins } from '@/lib/site-domains';
import { SITE_ORIGIN, plainDirectory } from '@/lib/link-map';

/** The six hosts from the Vercel domain list, as verified live. */
const EXPECTED = [
  'gg-lounge.vercel.app',
  'gg-lounge.duckdns.org',
  'www.gg-lounge.duckdns.org',
  'thisisascamwebsite.vercel.app',
  'growth-gulid.vercel.app',
  'talent-tribe.vercel.app',
];

test('all six addresses are listed', () => {
  assert.deepEqual(SITE_DOMAINS.map(domain => domain.host).sort(), [...EXPECTED].sort());
});

test('exactly one canonical address, and it is the one the site builds from', () => {
  const canonical = SITE_DOMAINS.filter(domain => domain.canonical);
  assert.equal(canonical.length, 1, 'one host must be canonical');
  assert.equal(canonical[0].host, CANONICAL_HOST);
  // SITE_ORIGIN is what absolute() uses for every URL on the page, so it has to
  // agree with the declared canonical host or the doc contradicts itself.
  assert.equal(SITE_ORIGIN, `https://${CANONICAL_HOST}`);
});

test('hosts are bare hostnames, never URLs', () => {
  for (const domain of SITE_DOMAINS) {
    assert.match(domain.host, /^[a-z0-9.-]+\.[a-z]{2,}$/, `${domain.host} must be a bare host`);
    assert.ok(!domain.host.includes('/'), `${domain.host} must not contain a path`);
    assert.ok(!domain.host.startsWith('http'), `${domain.host} must not include a scheme`);
    assert.ok(!domain.host.endsWith('/'), `${domain.host} must not end with a slash`);
  }
});

test('every host carries a note explaining why it exists', () => {
  for (const domain of SITE_DOMAINS) {
    assert.ok(domain.note.trim().length > 20, `${domain.host} needs a real explanation`);
  }
});

test('the redirecting host says where it goes, and that host is listed too', () => {
  const redirectors = SITE_DOMAINS.filter(domain => domain.redirectsTo);
  assert.equal(redirectors.length, 1, 'the bare duckdns host is the only 308');
  assert.equal(redirectors[0].host, 'gg-lounge.duckdns.org');
  const target = redirectors[0].redirectsTo!;
  assert.ok(
    SITE_DOMAINS.some(domain => domain.host === target),
    `redirect target ${target} must also be in the list`,
  );
});

test('decoy names are labelled as decoys rather than passed off as normal', () => {
  const decoys = SITE_DOMAINS.filter(domain => domain.disguise === 'decoy').map(d => d.host);
  assert.deepEqual(decoys.sort(), [
    'growth-gulid.vercel.app',
    'talent-tribe.vercel.app',
    'thisisascamwebsite.vercel.app',
  ]);
  // An unlabelled lookalike host is the one thing that must never ship.
  const lookalikes = ['thisisascamwebsite.vercel.app', 'growth-gulid.vercel.app', 'talent-tribe.vercel.app'];
  for (const host of lookalikes) {
    const entry = SITE_DOMAINS.find(domain => domain.host === host)!;
    assert.equal(entry.disguise, 'decoy', `${host} must be marked as a decoy`);
    assert.ok(!entry.canonical, `${host} must never be canonical`);
  }
});

test('the three groups cover every host exactly once', () => {
  const groups = domainGroups();
  assert.deepEqual(groups.map(group => group.key), ['canonical', 'aliases', 'decoys']);
  const covered = groups.flatMap(group => group.domains.map(domain => domain.host));
  assert.equal(covered.length, SITE_DOMAINS.length, 'no host may be listed twice');
  assert.deepEqual([...covered].sort(), [...EXPECTED].sort());
});

test('origins are absolute https with no trailing slash', () => {
  const origins = siteOrigins();
  assert.equal(origins.length, 6);
  for (const origin of origins) {
    assert.match(origin, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/);
  }
});

test('the copy-button text leads with all six addresses', () => {
  const text = plainDirectory();
  assert.ok(text.includes('== ALL ADDRESSES =='), 'the addresses section must come first');
  for (const host of EXPECTED) {
    assert.ok(text.includes(`https://${host}`), `${host} must appear in the copied text`);
  }
  // The canonical host is flagged; a redirecting one is flagged as such.
  assert.ok(text.includes('https://gg-lounge.vercel.app (canonical)'));
  assert.ok(text.includes('redirects to www.gg-lounge.duckdns.org'));
});

test('the doc page renders every address', () => {
  // The page is generated from the module, so this pins that it actually reads
  // it rather than having a second hand-written copy.
  const page = readFileSync(new URL('../app/secret-link-doc/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /SITE_DOMAINS\.map/, 'the host line must come from SITE_DOMAINS');
  assert.match(page, /domainGroups\(\)/, 'the grouped section must come from domainGroups()');
  assert.match(page, /id="addresses"/, 'the section needs an anchor to link to');
  // No hard-coded host list: a literal Vercel host here would drift.
  assert.doesNotMatch(
    page,
    /thisisascamwebsite\.vercel\.app/,
    'hostnames belong in lib/site-domains.ts, not inlined in the page',
  );
});


