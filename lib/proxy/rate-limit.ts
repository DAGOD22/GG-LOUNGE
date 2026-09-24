/**
 * Fixed-window per-client rate limiting for the proxy route.
 *
 * Serverless means state is per instance; that is still a real brake on
 * abuse, and Vercel's own edge limits sit in front of it. Tunable via
 * GG_PROXY_RATE_LIMIT (requests / 60s / client, default 600).
 */

type Bucket = { count: number; resetAt: number }

const GLOBAL_KEY = Symbol.for('gg.proxy.rateLimit')
type Store = Map<string, Bucket>

function store(): Store {
  const g = globalThis as Record<symbol, unknown>
  if (!(GLOBAL_KEY in g) || !(g[GLOBAL_KEY] instanceof Map)) g[GLOBAL_KEY] = new Map<string, Bucket>()
  return g[GLOBAL_KEY] as Store
}

export function rateLimitFor(clientIp: string, now = Date.now()): { ok: boolean; retryAfter: number } {
  const limit = Number(process.env.GG_PROXY_RATE_LIMIT || 600)
  if (!Number.isFinite(limit) || limit <= 0) return { ok: true, retryAfter: 0 }
  const map = store()
  // Sweep expired buckets when the map grows.
  if (map.size > 5000) {
    for (const [key, bucket] of map) if (bucket.resetAt <= now) map.delete(key)
  }
  const bucket = map.get(clientIp)
  if (!bucket || bucket.resetAt <= now) {
    map.set(clientIp, { count: 1, resetAt: now + 60_000 })
    return { ok: true, retryAfter: 0 }
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  bucket.count++
  return { ok: true, retryAfter: 0 }
}
