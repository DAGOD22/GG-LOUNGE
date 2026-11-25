/**
 * Turning a database error into a sentence a person can act on.
 *
 * The room API used to forward whatever Postgres said, verbatim and unclipped:
 * one screenshot of it read "The room server is unavailable: column "room" does
 * not exist", which is technically true, useless to a player, and — because the
 * text is unbounded — could fill the panel with a stack of parser output.
 *
 * Schema drift is the interesting case. It means a database from an older build
 * is missing something this build expects, which is ours to fix, not the
 * player's. Say that, keep the detail for the server log, and never let raw SQL
 * text reach the browser.
 */

export type DbErrorInfo = {
  /** One short sentence, safe to show a player. */
  message: string;
  /** True when the deployment's own schema is at fault, not the request. */
  schema: boolean;
  /** Trimmed technical detail, for server logs only. */
  detail: string;
};

const MAX_DETAIL = 300;

export function describeDbError(error: unknown): DbErrorInfo {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const detail = raw.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL);

  // missing column / missing relation: a table from an older build
  if (/column .* does not exist|relation .* does not exist|undefined column|undefined table/i.test(raw)) {
    return {
      message: "The room database needs upgrading. Try again in a minute — this fixes itself.",
      schema: true,
      detail,
    };
  }
  if (/duplicate key|unique constraint/i.test(raw)) {
    return { message: "That room code is already in use. Try again.", schema: false, detail };
  }
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|terminating connection/i.test(raw)) {
    return {
      message: "The room database did not answer. Try again in a moment.",
      schema: false,
      detail,
    };
  }
  if (/too many connections|remaining connection slots/i.test(raw)) {
    return { message: "The room server is busy. Try again in a moment.", schema: false, detail };
  }
  // Anything else: do not leak SQL to the browser.
  return {
    message: "The room server had a problem with that request. Try again.",
    schema: false,
    detail,
  };
}
