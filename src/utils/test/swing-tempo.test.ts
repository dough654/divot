import { describe, it, expect } from 'vitest';
import {
  calculateSwingTempo,
  getTempoRating,
  IDEAL_TEMPO_MIN,
  IDEAL_TEMPO_MAX,
} from '../swing-tempo';
import type { RotationTrackingState } from '../shoulder-rotation';

// ============================================
// HELPERS
// ============================================

/** Creates a complete rotation state with all timestamps set. */
const makeRotationState = (overrides: Partial<RotationTrackingState> = {}): RotationTrackingState => ({
  baselineDiff: 0.01,
  backswingDetected: true,
  backswingSign: 1,
  backswingTimestamp: 1100,
  followThroughDetected: true,
  peakAbsDelta: 0.15,
  peakTimestamp: 1900,
  followThroughDelta: 0.10,
  followThroughTimestamp: 2300,
  takeawayTimestamp: 1000,
  impactTimestamp: 2200,
  ...overrides,
});

// ============================================
// calculateSwingTempo
// ============================================

describe('calculateSwingTempo', () => {
  it('calculates correct tempo for a 3:1 ratio using takeaway and impact timestamps', () => {
    const state = makeRotationState({
      takeawayTimestamp: 1000,
      peakTimestamp: 1900,
      impactTimestamp: 2200,
    });
    const result = calculateSwingTempo(state);
    expect(result).not.toBeNull();
    expect(result!.backswingDurationMs).toBe(900);
    expect(result!.downswingDurationMs).toBe(300);
    expect(result!.tempoRatio).toBeCloseTo(3.0);
  });

  it('calculates correct tempo for a 2:1 ratio', () => {
    const state = makeRotationState({
      takeawayTimestamp: 1000,
      peakTimestamp: 1600,
      impactTimestamp: 1900,
    });
    const result = calculateSwingTempo(state);
    expect(result).not.toBeNull();
    expect(result!.backswingDurationMs).toBe(600);
    expect(result!.downswingDurationMs).toBe(300);
    expect(result!.tempoRatio).toBeCloseTo(2.0);
  });

  it('falls back to backswingTimestamp when takeawayTimestamp is null', () => {
    const state = makeRotationState({
      takeawayTimestamp: null,
      backswingTimestamp: 1000,
      peakTimestamp: 1900,
      impactTimestamp: 2200,
    });
    const result = calculateSwingTempo(state);
    expect(result).not.toBeNull();
    expect(result!.backswingDurationMs).toBe(900);
  });

  it('falls back to followThroughTimestamp when impactTimestamp is null', () => {
    const state = makeRotationState({
      takeawayTimestamp: 1000,
      peakTimestamp: 1900,
      impactTimestamp: null,
      followThroughTimestamp: 2200,
    });
    const result = calculateSwingTempo(state);
    expect(result).not.toBeNull();
    expect(result!.downswingDurationMs).toBe(300);
  });

  it('returns null when all start timestamps are missing', () => {
    const state = makeRotationState({ takeawayTimestamp: null, backswingTimestamp: null });
    expect(calculateSwingTempo(state)).toBeNull();
  });

  it('returns null when peakTimestamp is missing', () => {
    const state = makeRotationState({ peakTimestamp: null });
    expect(calculateSwingTempo(state)).toBeNull();
  });

  it('returns null when all end timestamps are missing', () => {
    const state = makeRotationState({ impactTimestamp: null, followThroughTimestamp: null });
    expect(calculateSwingTempo(state)).toBeNull();
  });

  it('returns null when backswing duration is zero (peak == takeaway)', () => {
    const state = makeRotationState({
      takeawayTimestamp: 1000,
      peakTimestamp: 1000,
      impactTimestamp: 1300,
    });
    expect(calculateSwingTempo(state)).toBeNull();
  });

  it('returns null when downswing duration is zero (impact == peak)', () => {
    const state = makeRotationState({
      takeawayTimestamp: 1000,
      peakTimestamp: 1900,
      impactTimestamp: 1900,
    });
    expect(calculateSwingTempo(state)).toBeNull();
  });

  it('returns null when backswing duration is negative', () => {
    const state = makeRotationState({
      takeawayTimestamp: 2000,
      peakTimestamp: 1000,
      impactTimestamp: 2500,
    });
    expect(calculateSwingTempo(state)).toBeNull();
  });

  it('returns null when downswing duration is negative', () => {
    const state = makeRotationState({
      takeawayTimestamp: 1000,
      peakTimestamp: 2000,
      impactTimestamp: 1500,
    });
    expect(calculateSwingTempo(state)).toBeNull();
  });
});

// ============================================
// getTempoRating
// ============================================

describe('getTempoRating', () => {
  it('returns "ideal" for tour-average 3:1 ratio', () => {
    expect(getTempoRating(3.0)).toBe('ideal');
  });

  it('returns "ideal" at the minimum boundary', () => {
    expect(getTempoRating(IDEAL_TEMPO_MIN)).toBe('ideal');
  });

  it('returns "ideal" at the maximum boundary', () => {
    expect(getTempoRating(IDEAL_TEMPO_MAX)).toBe('ideal');
  });

  it('returns "fast" below minimum', () => {
    expect(getTempoRating(2.0)).toBe('fast');
    expect(getTempoRating(1.5)).toBe('fast');
  });

  it('returns "slow" above maximum', () => {
    expect(getTempoRating(4.0)).toBe('slow');
    expect(getTempoRating(5.0)).toBe('slow');
  });

  it('returns "fast" just below minimum', () => {
    expect(getTempoRating(IDEAL_TEMPO_MIN - 0.01)).toBe('fast');
  });

  it('returns "slow" just above maximum', () => {
    expect(getTempoRating(IDEAL_TEMPO_MAX + 0.01)).toBe('slow');
  });
});
