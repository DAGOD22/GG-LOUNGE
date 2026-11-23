/**
 * Serialises model calls.
 *
 * The keyless provider gives **one reply every 45 seconds per IP**, and every
 * Vercel function shares an egress IP. Without coordination, ten people asking
 * a question at once produce ten requests where one would have succeeded, and
 * nine people get an error — the app is then at its worst exactly when it is
 * busiest.
 *
 * So model calls queue: one in flight, the rest wait briefly for their turn.
 * If the wait would be too long, callers are told to try in a moment instead of
 * burning the quota. Deterministic answers (maths, conversions, prices, the
 * clock) bypass this entirely, which is why they are computed before a model is
 * ever considered.
 */

const MAX_WAIT_MS = 12_000;

let inFlight: Promise<unknown> | null = null;
let nextFreeAt = 0;

/** Called after a rate-limit response so the next caller waits its turn. */
export function backOff(ms = 45_000): void {
  nextFreeAt = Math.max(nextFreeAt, Date.now() + ms);
}

/** How long a caller would currently have to wait, in ms. */
export function waitEstimate(): number {
  const queued = inFlight ? 4_000 : 0;
  return Math.max(nextFreeAt - Date.now(), 0) + queued;
}

/**
 * Run `fn` with exclusive access to the model. Returns `null` when the wait
 * would be unreasonable, so the caller can serve a deterministic or cached
 * answer instead of making the user stare at a spinner.
 */
export async function exclusive<T>(fn: () => Promise<T>): Promise<T | null> {
  if (waitEstimate() > MAX_WAIT_MS) return null;

  // Wait for whatever is already running.
  while (inFlight) {
    await inFlight.catch(() => undefined);
  }

  const run = fn();
  const gate = run.then(
    () => undefined,
    () => undefined,
  );
  inFlight = gate;
  try {
    return await run;
  } finally {
    if (inFlight === gate) inFlight = null;
  }
}

/**
 * Streaming variant of {@link exclusive}: yields events as they arrive while
 * holding the slot, so a queued response still streams token-by-token instead
 * of arriving as one blob at the end.
 *
 * Yields nothing when the wait would be unreasonable; the caller detects that
 * and returns a queued message.
 */
export async function* exclusiveStream<T>(fn: () => AsyncGenerator<T>): AsyncGenerator<T> {
  if (waitEstimate() > MAX_WAIT_MS) return;

  while (inFlight) {
    await inFlight.catch(() => undefined);
  }

  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tracked = gate as Promise<unknown>;
  inFlight = tracked;
  try {
    yield* fn();
  } finally {
    release();
    if (inFlight === tracked) inFlight = null;
  }
}
