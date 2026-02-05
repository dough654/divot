import { describe, it, expect } from 'vitest';
import { formatQuality, getQualityRating } from '../use-connection-quality';
import type { ConnectionQuality } from '@/src/types';

const createQuality = (overrides: Partial<ConnectionQuality> = {}): ConnectionQuality => ({
  latencyMs: 0,
  bitrateBps: 0,
  packetLossPercent: 0,
  jitterMs: 0,
  timestamp: Date.now(),
  ...overrides,
});

describe('formatQuality', () => {
  it('returns "No data" for null quality', () => {
    expect(formatQuality(null)).toBe('No data');
  });

  it('returns "Measuring..." when all values are zero', () => {
    const quality = createQuality();
    expect(formatQuality(quality)).toBe('Measuring...');
  });

  it('formats latency only', () => {
    const quality = createQuality({ latencyMs: 45 });
    expect(formatQuality(quality)).toBe('45ms');
  });

  it('formats bitrate only', () => {
    const quality = createQuality({ bitrateBps: 2_500_000 });
    expect(formatQuality(quality)).toBe('2.5 Mbps');
  });

  it('formats packet loss only', () => {
    const quality = createQuality({ packetLossPercent: 3 });
    expect(formatQuality(quality)).toBe('3% loss');
  });

  it('formats all metrics with pipe separator', () => {
    const quality = createQuality({
      latencyMs: 50,
      bitrateBps: 5_000_000,
      packetLossPercent: 2,
    });
    expect(formatQuality(quality)).toBe('50ms | 5.0 Mbps | 2% loss');
  });

  it('formats latency and bitrate without packet loss', () => {
    const quality = createQuality({
      latencyMs: 30,
      bitrateBps: 3_000_000,
    });
    expect(formatQuality(quality)).toBe('30ms | 3.0 Mbps');
  });

  it('handles sub-megabit bitrates', () => {
    const quality = createQuality({ bitrateBps: 500_000 });
    expect(formatQuality(quality)).toBe('0.5 Mbps');
  });

  it('ignores zero jitter (not displayed)', () => {
    const quality = createQuality({
      latencyMs: 25,
      jitterMs: 5,
    });
    // jitterMs is not included in formatQuality output
    expect(formatQuality(quality)).toBe('25ms');
  });
});

describe('getQualityRating', () => {
  describe('returns "unknown"', () => {
    it('for null quality', () => {
      expect(getQualityRating(null)).toBe('unknown');
    });
  });

  describe('returns "excellent"', () => {
    it('for low latency and no packet loss', () => {
      const quality = createQuality({ latencyMs: 25, packetLossPercent: 0 });
      expect(getQualityRating(quality)).toBe('excellent');
    });

    it('for latency just under 50ms threshold', () => {
      const quality = createQuality({ latencyMs: 49, packetLossPercent: 0.5 });
      expect(getQualityRating(quality)).toBe('excellent');
    });

    it('for packet loss just under 1% threshold', () => {
      const quality = createQuality({ latencyMs: 30, packetLossPercent: 0.9 });
      expect(getQualityRating(quality)).toBe('excellent');
    });
  });

  describe('returns "good"', () => {
    it('for moderate latency under 100ms', () => {
      const quality = createQuality({ latencyMs: 75, packetLossPercent: 1 });
      expect(getQualityRating(quality)).toBe('good');
    });

    it('when latency is at 50ms (boundary)', () => {
      const quality = createQuality({ latencyMs: 50, packetLossPercent: 0 });
      expect(getQualityRating(quality)).toBe('good');
    });

    it('when packet loss is at 1% (boundary)', () => {
      const quality = createQuality({ latencyMs: 25, packetLossPercent: 1 });
      expect(getQualityRating(quality)).toBe('good');
    });

    it('for latency just under 100ms', () => {
      const quality = createQuality({ latencyMs: 99, packetLossPercent: 2 });
      expect(getQualityRating(quality)).toBe('good');
    });
  });

  describe('returns "fair"', () => {
    it('for latency between 100-150ms', () => {
      const quality = createQuality({ latencyMs: 120, packetLossPercent: 3 });
      expect(getQualityRating(quality)).toBe('fair');
    });

    it('when latency is at 100ms (boundary)', () => {
      const quality = createQuality({ latencyMs: 100, packetLossPercent: 0 });
      expect(getQualityRating(quality)).toBe('fair');
    });

    it('when packet loss is at 3% (boundary)', () => {
      const quality = createQuality({ latencyMs: 25, packetLossPercent: 3 });
      expect(getQualityRating(quality)).toBe('fair');
    });

    it('for latency just under 150ms', () => {
      const quality = createQuality({ latencyMs: 149, packetLossPercent: 4 });
      expect(getQualityRating(quality)).toBe('fair');
    });
  });

  describe('returns "poor"', () => {
    it('for high latency over 150ms', () => {
      const quality = createQuality({ latencyMs: 200, packetLossPercent: 2 });
      expect(getQualityRating(quality)).toBe('poor');
    });

    it('when latency is at 150ms (boundary)', () => {
      const quality = createQuality({ latencyMs: 150, packetLossPercent: 0 });
      expect(getQualityRating(quality)).toBe('poor');
    });

    it('for high packet loss over 5%', () => {
      const quality = createQuality({ latencyMs: 25, packetLossPercent: 5 });
      expect(getQualityRating(quality)).toBe('poor');
    });

    it('for very high latency', () => {
      const quality = createQuality({ latencyMs: 500, packetLossPercent: 0 });
      expect(getQualityRating(quality)).toBe('poor');
    });

    it('for very high packet loss', () => {
      const quality = createQuality({ latencyMs: 30, packetLossPercent: 15 });
      expect(getQualityRating(quality)).toBe('poor');
    });
  });

  describe('edge cases', () => {
    it('ignores jitter in rating calculation', () => {
      const quality = createQuality({
        latencyMs: 25,
        packetLossPercent: 0,
        jitterMs: 100, // High jitter should not affect rating
      });
      expect(getQualityRating(quality)).toBe('excellent');
    });

    it('ignores bitrate in rating calculation', () => {
      const quality = createQuality({
        latencyMs: 25,
        packetLossPercent: 0,
        bitrateBps: 100_000, // Low bitrate should not affect rating
      });
      expect(getQualityRating(quality)).toBe('excellent');
    });
  });
});
