import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AuthEnv } from './auth';

type RateLimitEntry = {
  timestamps: number[];
};

type RateLimiterOptions = {
  /** Maximum requests allowed in the window. Default: 100. */
  maxRequests?: number;
  /** Window duration in milliseconds. Default: 60_000 (1 minute). */
  windowMs?: number;
  /** How often to purge expired entries in milliseconds. Default: 300_000 (5 minutes). */
  cleanupIntervalMs?: number;
};

/**
 * Simple in-memory sliding-window rate limiter keyed by userId.
 * Suitable for single-instance deployments. For multi-instance,
 * replace with Redis-backed storage.
 */
export const rateLimiter = (options?: RateLimiterOptions) => {
  const maxRequests = options?.maxRequests ?? 100;
  const windowMs = options?.windowMs ?? 60_000;
  const cleanupIntervalMs = options?.cleanupIntervalMs ?? 300_000;

  const store = new Map<string, RateLimitEntry>();

  // Periodically purge stale entries to prevent memory leaks
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, cleanupIntervalMs);
  // Don't keep the process alive for cleanup (Node.js only)
  (cleanup as unknown as { unref?: () => void }).unref?.();

  return createMiddleware<AuthEnv>(async (c, next) => {
    const userId = c.get('userId');
    const now = Date.now();

    let entry = store.get(userId);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(userId, entry);
    }

    // Drop timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
      throw new HTTPException(429, { message: 'Too many requests' });
    }

    entry.timestamps.push(now);

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(maxRequests - entry.timestamps.length));

    await next();
  });
};
