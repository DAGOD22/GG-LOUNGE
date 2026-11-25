// Simple in-memory rate limiter — per-IP, per-route
// For Postgres deploy it resets per serverless instance, but still throttles abuse bursts.
// For file-mode it is global in that instance. Good enough for 60 req/min; Cloudflare/Vercel edge will do the rest.

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// Auto-clean every 5 minutes. `process` is absent in edge runtimes, so the
// handle is optional and only unref'd when Node gives us one.
declare const globalThis: { __rlClean?: ReturnType<typeof setInterval> } & typeof global;
if (typeof setInterval !== 'undefined') {
  if (!globalThis.__rlClean) {
    globalThis.__rlClean = setInterval(() => {
      const now = Date.now();
      for (const [k, b] of buckets.entries()) if (b.resetAt < now) buckets.delete(k);
    }, 5 * 60 * 1000);
    // Don't hold the event loop open (Node only; browsers return a number).
    const handle = globalThis.__rlClean as unknown as { unref?: () => void };
    if (typeof handle?.unref === 'function') handle.unref();
  }
}

/** One bucket decision, as returned by rateLimit(). */
export type RateDecision = { ok: boolean; remaining: number; resetAt: number; count: number }

export function rateLimit(key: string, limit: number, windowMs: number): RateDecision {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    const b = { count: 1, resetAt: now + windowMs }
    buckets.set(key, b)
    return { ok: true, remaining: limit - 1, resetAt: b.resetAt, count: 1 }
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt, count: bucket.count }
  }
  bucket.count++
  return { ok: true, remaining: limit - bucket.count, resetAt: bucket.resetAt, count: bucket.count }
}

/**
 * Read a bucket without spending from it.
 *
 * `rateLimit` is consume-and-report; a caller that only wants to display "N left"
 * (or that has already decided to reject) must not increment the counter while
 * asking, or the reported number is always one too low.
 */
export function peekRateLimit(key: string, limit: number, windowMs = 15 * 60 * 1000) {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    return { ok: true, remaining: limit, resetAt: now + windowMs, count: 0 }
  }
  return { ok: bucket.count < limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt, count: bucket.count }
}

export function getClientIp(req: Request | { headers: Headers } | any): string {
  try {
    const h = (req.headers?.get ? req.headers : new Headers(req.headers)) as Headers
    const f = h.get('x-forwarded-for') || ''
    const ip = f.split(',')[0].trim() || h.get('x-real-ip') || h.get('x-gate-ip') || 'unknown'
    return ip || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function rateLimitResponse(limit: number, remaining: number, resetAt: number) {
  return {
    'x-ratelimit-limit': String(limit),
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-reset': String(Math.ceil(resetAt / 1000)),
  }
}
