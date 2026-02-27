/**
 * Simple in-memory sliding window rate limiter.
 * Tracks timestamps of requests per key and rejects when the limit is exceeded.
 */

type RateLimiterConfig = {
  maxRequests: number;
  windowMs: number;
  cleanupIntervalMs?: number;
};

type RateLimiterInstance = {
  /** Returns true if the request should be blocked. Records the attempt either way. */
  isRateLimited: (key: string) => boolean;
  /** Manually remove all tracked entries. Useful for testing. */
  reset: () => void;
  /** Stop the periodic cleanup timer. Call on server shutdown. */
  destroy: () => void;
};

/**
 * Creates a rate limiter that allows `maxRequests` per `windowMs` per key.
 *
 * @example
 * const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });
 * if (limiter.isRateLimited(clientIp)) {
 *   // reject request
 * }
 */
const createRateLimiter = (config: RateLimiterConfig): RateLimiterInstance => {
  const { maxRequests, windowMs, cleanupIntervalMs = 60_000 } = config;
  const entries = new Map<string, number[]>();

  const cleanup = () => {
    const now = Date.now();
    entries.forEach((timestamps, key) => {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        entries.delete(key);
      } else {
        entries.set(key, valid);
      }
    });
  };

  const cleanupTimer = setInterval(cleanup, cleanupIntervalMs);
  // Don't block process exit
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  const isRateLimited = (key: string): boolean => {
    const now = Date.now();
    const timestamps = entries.get(key) ?? [];
    const valid = timestamps.filter((t) => now - t < windowMs);

    valid.push(now);
    entries.set(key, valid);

    return valid.length > maxRequests;
  };

  const reset = () => {
    entries.clear();
  };

  const destroy = () => {
    clearInterval(cleanupTimer);
    entries.clear();
  };

  return { isRateLimited, reset, destroy };
};

export { createRateLimiter };
export type { RateLimiterConfig, RateLimiterInstance };
