import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateBackoffDelay,
  DEFAULT_BACKOFF_CONFIG,
  type BackoffConfig,
} from '../exponential-backoff';

describe('calculateBackoffDelay', () => {
  beforeEach(() => {
    // Fix Math.random to 0.5 for deterministic tests (jitter = 0)
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns base delay for attempt 0 with no jitter', () => {
    const delay = calculateBackoffDelay(0);
    // random=0.5 → (0.5*2-1)=0 → jitter=0
    expect(delay).toBe(1000);
  });

  it('doubles delay for each attempt', () => {
    expect(calculateBackoffDelay(0)).toBe(1000);
    expect(calculateBackoffDelay(1)).toBe(2000);
    expect(calculateBackoffDelay(2)).toBe(4000);
    expect(calculateBackoffDelay(3)).toBe(8000);
  });

  it('caps delay at maxDelayMs', () => {
    const config: BackoffConfig = {
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      maxAttempts: 10,
      jitterFactor: 0,
    };
    // attempt 3 = 8000, should be capped to 5000
    expect(calculateBackoffDelay(3, config)).toBe(5000);
    expect(calculateBackoffDelay(5, config)).toBe(5000);
  });

  it('returns null when attempt exceeds maxAttempts', () => {
    expect(calculateBackoffDelay(5)).toBeNull();
    expect(calculateBackoffDelay(6)).toBeNull();
    expect(calculateBackoffDelay(100)).toBeNull();
  });

  it('returns a value for the last valid attempt', () => {
    expect(calculateBackoffDelay(4)).not.toBeNull();
  });

  it('applies positive jitter when random > 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    // jitter = 1000 * 0.3 * (0.9*2-1) = 1000 * 0.3 * 0.8 = 240
    const delay = calculateBackoffDelay(0);
    expect(delay).toBe(1240);
  });

  it('applies negative jitter when random < 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    // jitter = 1000 * 0.3 * (0.1*2-1) = 1000 * 0.3 * -0.8 = -240
    const delay = calculateBackoffDelay(0);
    expect(delay).toBe(760);
  });

  it('never returns negative delays', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const config: BackoffConfig = {
      baseDelayMs: 100,
      maxDelayMs: 30000,
      maxAttempts: 5,
      jitterFactor: 1.5, // extreme jitter
    };
    // jitter = 100 * 1.5 * (0*2-1) = 100 * 1.5 * -1 = -150
    // delay = max(0, 100 + (-150)) = 0
    const delay = calculateBackoffDelay(0, config);
    expect(delay).toBeGreaterThanOrEqual(0);
  });

  it('respects custom config', () => {
    const config: BackoffConfig = {
      baseDelayMs: 500,
      maxDelayMs: 10000,
      maxAttempts: 3,
      jitterFactor: 0,
    };
    expect(calculateBackoffDelay(0, config)).toBe(500);
    expect(calculateBackoffDelay(1, config)).toBe(1000);
    expect(calculateBackoffDelay(2, config)).toBe(2000);
    expect(calculateBackoffDelay(3, config)).toBeNull();
  });

  it('uses default config values', () => {
    expect(DEFAULT_BACKOFF_CONFIG).toEqual({
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      maxAttempts: 5,
      jitterFactor: 0.3,
    });
  });
});
