import { describe, it, expect, afterEach } from 'vitest';
import { createRateLimiter } from '../src/rate-limiter';

describe('createRateLimiter', () => {
  const limiterInstances: ReturnType<typeof createRateLimiter>[] = [];

  const makeLimiter = (...args: Parameters<typeof createRateLimiter>) => {
    const limiter = createRateLimiter(...args);
    limiterInstances.push(limiter);
    return limiter;
  };

  afterEach(() => {
    limiterInstances.forEach((l) => l.destroy());
    limiterInstances.length = 0;
  });

  it('allows requests within the limit', () => {
    const limiter = makeLimiter({ maxRequests: 3, windowMs: 60_000 });

    expect(limiter.isRateLimited('client-a')).toBe(false);
    expect(limiter.isRateLimited('client-a')).toBe(false);
    expect(limiter.isRateLimited('client-a')).toBe(false);
  });

  it('blocks requests exceeding the limit', () => {
    const limiter = makeLimiter({ maxRequests: 2, windowMs: 60_000 });

    expect(limiter.isRateLimited('client-a')).toBe(false);
    expect(limiter.isRateLimited('client-a')).toBe(false);
    expect(limiter.isRateLimited('client-a')).toBe(true);
    expect(limiter.isRateLimited('client-a')).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = makeLimiter({ maxRequests: 1, windowMs: 60_000 });

    expect(limiter.isRateLimited('client-a')).toBe(false);
    expect(limiter.isRateLimited('client-b')).toBe(false);
    expect(limiter.isRateLimited('client-a')).toBe(true);
    expect(limiter.isRateLimited('client-b')).toBe(true);
  });

  it('allows requests again after the window expires', async () => {
    const limiter = makeLimiter({ maxRequests: 1, windowMs: 50 });

    expect(limiter.isRateLimited('client-a')).toBe(false);
    expect(limiter.isRateLimited('client-a')).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(limiter.isRateLimited('client-a')).toBe(false);
  });

  it('reset clears all tracked entries', () => {
    const limiter = makeLimiter({ maxRequests: 1, windowMs: 60_000 });

    expect(limiter.isRateLimited('client-a')).toBe(false);
    expect(limiter.isRateLimited('client-a')).toBe(true);

    limiter.reset();

    expect(limiter.isRateLimited('client-a')).toBe(false);
  });

  it('handles a burst at exactly the limit', () => {
    const limiter = makeLimiter({ maxRequests: 5, windowMs: 60_000 });

    for (let i = 0; i < 5; i++) {
      expect(limiter.isRateLimited('client-a')).toBe(false);
    }

    expect(limiter.isRateLimited('client-a')).toBe(true);
  });
});
