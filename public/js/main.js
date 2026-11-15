/*
 * Compatibility shim.
 *
 * Some HTML5 game pages request `/js/main.js` because it was the host site's
 * shared script. Those pages expect the request to succeed (a 404 shows up as a
 * console error and, in a few builds, stalls the loader), but none of them need
 * anything from it: it only contained that site's ads and analytics.
 *
 * Serving this no-op keeps those builds quiet without shipping third-party
 * tracking or ad code.
 */
void 0;
