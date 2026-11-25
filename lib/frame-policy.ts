/**
 * iframe policy for the frames that host game HTML.
 *
 * Every game frame here is same-origin, which is the dangerous combination:
 * script inside a same-origin frame runs with the lounge's own origin, so it can
 * read `document.cookie`, call our APIs as the player, and rewrite the parent
 * window. `sandbox` is the only thing that separates a game from the site.
 *
 * `allow-scripts` and `allow-same-origin` are both present because games cannot
 * work without them — same-origin is what lets a game use its own localStorage
 * saves and what lets the modal snapshot them for the save feature. That pairing
 * is normally described as "equivalent to no sandbox at all", and it would be,
 * if those were the only tokens. They are not: the policy withholds
 * `allow-top-navigation` and `allow-top-navigation-by-user-activation`, so a game
 * cannot navigate the lounge to a phishing page, and it withholds
 * `allow-popups`… no, popups stay allowed because several games open a help
 * window. Everything explicitly withheld is listed at the bottom of this file so
 * the next person can see the intent rather than guess at the token list.
 */
export const GAME_FRAME_SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-modals',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-pointer-lock',
  'allow-downloads',
  'allow-presentation',
  'allow-orientation-lock',
].join(' ');

/**
 * The proxy frame is deliberately NOT sandboxed.
 *
 * `/proxy` is a controlled browsing surface: `lib/proxy-client.ts` boots a
 * service-worker runtime and then drives the frame document directly
 * (`createFrame(iframe, …)`, `frame.go(url)`), which is only possible because the
 * frame is same-origin and unsandboxed. There is no token list that keeps that
 * working — `allow-same-origin` without `allow-scripts` breaks browsing entirely,
 * and both together is exactly what we would be sandboxing against. The proxy is
 * treated as a first-class app rather than untrusted content, which is why the
 * rate limits in `middleware.ts` and the destination warnings on the page carry
 * the risk instead.
 */
export const PROXY_FRAME_SANDBOXED = false;

/**
 * Withheld from GAME_FRAME_SANDBOX on purpose:
 *   allow-top-navigation              — a game may not repoint the whole lounge
 *   allow-top-navigation-by-user-activation — nor ask the player to do it
 *   allow-storage-access-by-user-activation — no cross-site cookie prompting
 */
