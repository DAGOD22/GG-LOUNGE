'use client';

/**
 * The summer drop announcement.
 *
 * Three things decide whether a bar like this helps or hurts:
 *
 *   · it must not shift the page after hydration, so the dismissed flag is
 *     read in a layout effect and the bar renders nothing until it is known;
 *     a flash of a banner someone already closed is worse than no banner;
 *   · it must not cover the navigation, so it is a normal block in the flow
 *     (the dashboard already sits above the header for the same reason),
 *     never `position: fixed`;
 *   · it must survive a theme change, so every colour comes from the site's
 *     own custom properties rather than hard-coded hex.
 *
 * The CTA is a real anchor with `rel="noopener noreferrer"`, so opening the
 * doc cannot hand this page's window to the destination.
 */

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { X, ArrowUpRight, Sparkles } from 'lucide-react';
import { ANNOUNCEMENT_DOC_URL } from '@/lib/site-links';

const STORAGE_KEY = 'ggl_summer_banner_dismissed_v1';

export function AnnouncementBanner() {
  // `null` means "not decided yet" — the first paint renders nothing at all,
  // so a returning visitor never sees the bar they closed last time.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    let closed = false;
    try {
      closed = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // Storage can throw in private modes and in some embedded webviews.
      // A banner that cannot remember being closed is still better than a
      // crash, so fall through and show it.
    }
    setDismissed(closed);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* see above */
    }
  }, []);

  // Escape closes it, matching the dialog convention used elsewhere on the page.
  useEffect(() => {
    if (dismissed !== false) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissed, dismiss]);

  if (dismissed !== false) return null;

  return (
    <aside className="gg-banner" role="region" aria-label="Announcement">
      <div className="gg-banner-inner">
        <span className="gg-banner-eyebrow" aria-hidden="true">
          <Sparkles size={12} /> Summer drop
        </span>
        <p className="gg-banner-copy">
          <strong>👀 HUGE THINGS ARE DROPPING OVER SUMMER:</strong> We&apos;re adding insane unreleased
          games, secret features, private proxies &amp; crazy new themes — and all the new links &amp;
          drops will ONLY go inside{' '}
          <a
            className="gg-banner-cta"
            href={ANNOUNCEMENT_DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            THIS DOC <ArrowUpRight size={12} />
          </a>
          . Save it before break or miss everything!
        </p>
        <button className="gg-banner-close" onClick={dismiss} aria-label="Dismiss announcement">
          <X size={14} />
        </button>
      </div>
    </aside>
  );
}
