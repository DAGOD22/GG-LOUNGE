/**
 * Links the site points at but does not own.
 *
 * Kept in one place so the announcement banner, and anything else that needs
 * the same destination, cannot drift apart.
 */

/**
 * The "THIS DOC" link in the summer banner.
 *
 * Set `NEXT_PUBLIC_ANNOUNCEMENT_DOC_URL` in the Vercel project to the real
 * document before the banner goes out. The fallback deliberately points at the
 * site's own request page rather than a placeholder host: if the variable is
 * missing, the button still lands somewhere real and useful instead of a 404,
 * and the banner can ship without a broken call to action.
 */
export const ANNOUNCEMENT_DOC_URL =
  process.env.NEXT_PUBLIC_ANNOUNCEMENT_DOC_URL || 'https://gg-lounge.vercel.app/request-game';
