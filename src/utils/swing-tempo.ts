/**
 * Swing tempo calculation from shoulder rotation timestamps.
 *
 * Tempo = backswing duration / downswing duration. Tour average is ~3:1.
 * - Backswing duration: peak rotation timestamp - backswing start timestamp
 * - Downswing duration: follow-through timestamp - peak rotation timestamp
 */

import type { RotationTrackingState } from './shoulder-rotation';

// ============================================
// CONSTANTS
// ============================================

/** Minimum tempo ratio considered "ideal" (inclusive). */
export const IDEAL_TEMPO_MIN = 2.5;

/** Maximum tempo ratio considered "ideal" (inclusive). */
export const IDEAL_TEMPO_MAX = 3.5;

// ============================================
// TYPES
// ============================================

export type SwingTempo = {
  /** Time from backswing start to top of backswing (ms). */
  backswingDurationMs: number;
  /** Time from top of backswing to follow-through confirmation (ms). */
  downswingDurationMs: number;
  /** Ratio of backswing to downswing (e.g. 3.0 for 3:1). */
  tempoRatio: number;
};

export type TempoRating = 'ideal' | 'fast' | 'slow';

// ============================================
// FUNCTIONS
// ============================================

/**
 * Calculates swing tempo from rotation tracking state.
 *
 * Uses tempo-specific timestamps for accuracy:
 * - takeawayTimestamp (first motion above low threshold — actual start of rotation)
 * - peakTimestamp (top of backswing)
 * - impactTimestamp (zero crossing after peak — approximate impact)
 *
 * Falls back to detection timestamps if tempo timestamps aren't available.
 *
 * @returns Tempo data, or null if timestamps are missing or invalid
 */
export const calculateSwingTempo = (
  rotationState: RotationTrackingState,
): SwingTempo | null => {
  const { peakTimestamp } = rotationState;
  const startTimestamp = rotationState.takeawayTimestamp ?? rotationState.backswingTimestamp;
  const endTimestamp = rotationState.impactTimestamp ?? rotationState.followThroughTimestamp;

  if (
    startTimestamp === null ||
    peakTimestamp === null ||
    endTimestamp === null
  ) {
    return null;
  }

  const backswingDurationMs = peakTimestamp - startTimestamp;
  const downswingDurationMs = endTimestamp - peakTimestamp;

  if (backswingDurationMs <= 0 || downswingDurationMs <= 0) {
    return null;
  }

  const tempoRatio = backswingDurationMs / downswingDurationMs;

  return { backswingDurationMs, downswingDurationMs, tempoRatio };
};

/**
 * Categorizes a tempo ratio as ideal, fast, or slow.
 *
 * - ideal: 2.5:1 to 3.5:1 (tour average range)
 * - fast: below 2.5:1 (rushing the backswing)
 * - slow: above 3.5:1 (too slow on the downswing)
 */
export const getTempoRating = (ratio: number): TempoRating => {
  if (ratio < IDEAL_TEMPO_MIN) return 'fast';
  if (ratio > IDEAL_TEMPO_MAX) return 'slow';
  return 'ideal';
};
