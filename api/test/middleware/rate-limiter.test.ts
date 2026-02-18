import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { rateLimiter } from '../../src/middleware/rate-limiter';
import { errorHandler } from '../../src/middleware/error-handler';
import type { AuthEnv } from '../../src/middleware/auth';

const createRateLimitedApp = (maxRequests: number) => {
  const app = new Hono<AuthEnv>();

  app.onError(errorHandler);

  // Fake auth — inject userId
  app.use('*', async (c, next) => {
    c.set('userId', 'user_01');
    await next();
  });

  app.use('*', rateLimiter({ maxRequests, windowMs: 60_000 }));
  app.get('/test', (c) => c.json({ ok: true }));

  return app;
};

describe('rate limiter', () => {
  it('allows requests under the limit', async () => {
    const app = createRateLimitedApp(5);

    for (let i = 0; i < 5; i++) {
      const res = await app.request('/test');
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 when limit is exceeded', async () => {
    const app = createRateLimitedApp(3);

    for (let i = 0; i < 3; i++) {
      const res = await app.request('/test');
      expect(res.status).toBe(200);
    }

    const blocked = await app.request('/test');
    expect(blocked.status).toBe(429);

    const json = await blocked.json();
    expect(json.error).toBe('Too many requests');
  });

  it('sets rate limit headers', async () => {
    const app = createRateLimitedApp(10);
    const res = await app.request('/test');

    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
  });
});
