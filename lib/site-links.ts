/**
 * Links the site points at but does not own.
 *
 * Kept in one place so the announcement banner, and anything else that needs
 * the same destination, cannot drift apart.
 */

/**
 * The "THIS DOC" link in the summer banner.
 *
 * It points at the lounge's own unlisted link directory, `/secret-link-doc`.
 * That page is the doc the banner promises: every game, every URL shape, the
 * app launchers, the raw files and the API map, generated from the catalogue
 * so it cannot go stale.
 *
 * It used to fall back to `/request-game` whenever
 * `NEXT_PUBLIC_ANNOUNCEMENT_DOC_URL` was unset — which it always was — so the
 * banner's main call to action landed on a form instead of the doc it was
 * advertising. The secret page is now the default, and an env override is only
 * for pointing at an external doc on purpose.
 *
 * `SECRET_DOC_PATH` is exported so the banner, the link map and the tests all
 * agree on one string.
 */
export const SECRET_DOC_PATH = '/secret-link-doc';

export const ANNOUNCEMENT_DOC_URL =
  process.env.NEXT_PUBLIC_ANNOUNCEMENT_DOC_URL || SECRET_DOC_PATH;

/** Absolute form, for anywhere that needs a full URL rather than a path. */
export function announcementDocHref(origin = ''): string {
  const href = ANNOUNCEMENT_DOC_URL;
  return /^https?:\/\//i.test(href) ? href : `${origin}${href}`;
}
