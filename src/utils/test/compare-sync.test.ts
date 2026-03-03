import { describe, it, expect } from 'vitest';
import {
  computeSyncOffset,
  computeSyncedPosition,
  formatTimeCompact,
} from '@/src/utils/compare-sync';

describe('computeSyncOffset', () => {
  it('returns null when left sync point is null', () => {
    expect(computeSyncOffset(null, 2000)).toBeNull();
  });

  it('returns null when right sync point is null', () => {
    expect(computeSyncOffset(1000, null)).toBeNull();
  });

  it('returns null when both sync points are null', () => {
    expect(computeSyncOffset(null, null)).toBeNull();
  });

  it('computes positive offset when right is ahead', () => {
    expect(computeSyncOffset(1000, 3000)).toBe(2000);
  });

  it('computes negative offset when left is ahead', () => {
    expect(computeSyncOffset(3000, 1000)).toBe(-2000);
  });

  it('returns zero when both sync points are equal', () => {
    expect(computeSyncOffset(2000, 2000)).toBe(0);
  });
});

describe('computeSyncedPosition', () => {
  it('returns null when offset is null', () => {
    expect(computeSyncedPosition(1000, null, 'left')).toBeNull();
  });

  it('adds offset when source is left panel', () => {
    expect(computeSyncedPosition(1000, 2000, 'left')).toBe(3000);
  });

  it('subtracts offset when source is right panel', () => {
    expect(computeSyncedPosition(3000, 2000, 'right')).toBe(1000);
  });

  it('clamps to zero when result would be negative', () => {
    expect(computeSyncedPosition(500, 2000, 'right')).toBe(0);
  });

  it('clamps to target duration when provided', () => {
    expect(computeSyncedPosition(5000, 3000, 'left', 6000)).toBe(6000);
  });

  it('handles zero offset (both sync points aligned)', () => {
    expect(computeSyncedPosition(2500, 0, 'left')).toBe(2500);
    expect(computeSyncedPosition(2500, 0, 'right')).toBe(2500);
  });

  it('handles negative offset (left sync ahead of right)', () => {
    // offset = right - left = 1000 - 3000 = -2000
    expect(computeSyncedPosition(4000, -2000, 'left')).toBe(2000);
    expect(computeSyncedPosition(1000, -2000, 'right')).toBe(3000);
  });
});

describe('formatTimeCompact', () => {
  it('formats zero', () => {
    expect(formatTimeCompact(0)).toBe('0:00');
  });

  it('formats seconds with padding', () => {
    expect(formatTimeCompact(5000)).toBe('0:05');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimeCompact(65000)).toBe('1:05');
  });

  it('handles negative values as zero', () => {
    expect(formatTimeCompact(-1000)).toBe('0:00');
  });

  it('truncates partial seconds', () => {
    expect(formatTimeCompact(5500)).toBe('0:05');
  });
});
