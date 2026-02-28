interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key)
    }
  }
}, 60_000)

/**
 * Simple in-memory rate limiter.
 * Returns { success: true } if under limit, { success: false, retryAfter } if exceeded.
 */
export function rateLimit(
  key: string,
  { limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): { success: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: limit - 1 }
  }

  entry.count++

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { success: false, remaining: 0, retryAfter }
  }

  return { success: true, remaining: limit - entry.count }
}
