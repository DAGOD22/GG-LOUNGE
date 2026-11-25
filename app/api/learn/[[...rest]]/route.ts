import { handleAliasRequest } from "@/lib/bare-alias";

/**
 * /api/learn is an alias of the Bare proxy.
 *
 * These exist because strict school networks block URLs by keyword, so a
 * filtered /api/bare/ can still be reached under a harmless-looking name.
 * The implementation is shared in lib/bare-alias.ts; this file only wires the
 * route to it. Adding another alias means adding a folder and a line in
 * BARE_ALIASES.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export {
  handleAliasRequest as GET,
  handleAliasRequest as POST,
  handleAliasRequest as PUT,
  handleAliasRequest as PATCH,
  handleAliasRequest as DELETE,
  handleAliasRequest as OPTIONS,
  handleAliasRequest as HEAD,
};
