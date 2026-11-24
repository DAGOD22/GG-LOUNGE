/**
 * Which URL a launched game lives at.
 *
 * One rule, and the reason for it: a launch has to be its own history entry and
 * its own page view, so Vercel Web Analytics can count it and a shared link can
 * restore it. The *canonical* way to do that is `?game=<slug>` on the main page,
 * which needs no routing help and keeps the grid, the header and the Lounge
 * dashboard one Back press away.
 *
 * The older `/play/<id>` form is still honoured — links already exist in the
 * wild — but new launches stay on the query form so behaviour is identical for
 * a local game and a proxied one. Keeping both shapes meant two code paths, and
 * the path form is what made a copied link to a local title dead-end earlier.
 */

export type LaunchableGame = { id: string; proxy?: boolean };

/** The query-only form used for every launch. */
export function gameUrl(game: LaunchableGame): string {
  return `?game=${encodeURIComponent(game.id)}`;
}

/** The absolute deep-link form, for share buttons and the sitemap. */
export function absoluteGameUrl(game: LaunchableGame, origin: string): string {
  return `${origin.replace(/\/$/, '')}/${gameUrl(game)}`.replace('/?', '/?');
}

/**
 * Exists so the `?game=` contract has a single definition. Any other query
 * parameter is left alone: `?q=` search links must keep working.
 */
export const GAME_QUERY_KEY = 'game';
