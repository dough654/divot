/**
 * Shoulder rotation tracking for two-phase swing detection.
 *
 * From the down-the-line camera angle, the signed shoulder X difference
 * (leftShoulder.x - rightShoulder.x) changes direction between backswing
 * and follow-through. A real swing produces a sign change; a practice
 * backswing returns to baseline without crossing to the opposite side.
 *
 * Phase 1 — Backswing: |delta from baseline| >= threshold, records direction
 * Phase 2 — Follow-through: delta crosses to opposite sign above threshold → confirmed
 */

// ============================================
// CONSTANTS
// ============================================

/** Minimum delta from baseline to detect backswing rotation (8% frame width). */
export const BACKSWING_ROTATION_THRESHOLD = 0.08;

/** Minimum delta in opposite direction to confirm follow-through (8% frame width). */
export const FOLLOW_THROUGH_ROTATION_THRESHOLD = 0.08;

/** Maximum time between backswing detection and follow-through before reset (ms). */
export const ROTATION_TIMEOUT_MS = 5000;

/**
 * Lower threshold for tempo takeaway detection (3% frame width).
 * Above typical baseline drift (0.5–2%) but well below backswing threshold (8%).
 * Captures the actual start of shoulder rotation for accurate tempo.
 */
export const TAKEAWAY_ROTATION_THRESHOLD = 0.03;

// ============================================
// JOINT LAYOUT
// ============================================

/** Joint indices in the 72-element pose array (index * 3 = offset). */
const LEFT_SHOULDER_INDEX = 2;
const RIGHT_SHOULDER_INDEX = 3;
const STRIDE = 3;

/** Default minimum confidence for a shoulder to be considered valid. */
const DEFAULT_MIN_CONFIDENCE = 0.3;

// ============================================
// TYPES
// ============================================

export type ShoulderRotationSample = {
  /** Signed difference: leftShoulder.x - rightShoulder.x */
  diff: number;
  /** Whether both shoulders had sufficient confidence. */
  valid: boolean;
};

export type RotationTrackingState = {
  /** Shoulder diff captured at address (baseline). */
  baselineDiff: number;
  /** Whether a backswing rotation was detected. */
  backswingDetected: boolean;
  /** Direction of the backswing: +1 or -1 (sign of delta from baseline). */
  backswingSign: number;
  /** Timestamp when backswing was first detected (for timeout). */
  backswingTimestamp: number | null;
  /** Whether follow-through was detected (swing confirmed). */
  followThroughDetected: boolean;
  /** Running maximum of |delta from baseline| across all samples (for telemetry). */
  peakAbsDelta: number;
  /** Timestamp when peakAbsDelta was last updated (top of backswing for tempo). */
  peakTimestamp: number | null;
  /** |delta from baseline| at the moment follow-through was confirmed (for telemetry). */
  followThroughDelta: number;
  /** Timestamp when follow-through was confirmed (for swing detection). */
  followThroughTimestamp: number | null;
  /** Timestamp when delta first exceeds TAKEAWAY_THRESHOLD (actual start of rotation for tempo). */
  takeawayTimestamp: number | null;
  /** Timestamp when delta crosses zero after peak (approximate impact for tempo). */
  impactTimestamp: number | null;
};

export type RotationTrackingResult = {
  /** Updated tracking state. */
  state: RotationTrackingState;
  /** Whether a full swing (backswing + follow-through) was confirmed. */
  swingConfirmed: boolean;
};

/** Initial state for rotation tracking (before any tracking begins). */
export const INITIAL_ROTATION_STATE: RotationTrackingState = {
  baselineDiff: 0,
  backswingDetected: false,
  backswingSign: 0,
  backswingTimestamp: null,
  followThroughDetected: false,
  peakAbsDelta: 0,
  peakTimestamp: null,
  followThroughDelta: 0,
  followThroughTimestamp: null,
  takeawayTimestamp: null,
  impactTimestamp: null,
};

// ============================================
// FUNCTIONS
// ============================================

/**
 * Computes the signed shoulder X difference from raw pose data.
 *
 * @param poseData - 72-element flat array (24 joints × 3: x, y, confidence)
 * @param minConfidence - Minimum confidence for a shoulder to be valid (default 0.3)
 * @returns The signed diff and whether both shoulders were confident enough
 */
export const computeShoulderDiff = (
  poseData: readonly number[],
  minConfidence = DEFAULT_MIN_CONFIDENCE,
): ShoulderRotationSample => {
  const leftOffset = LEFT_SHOULDER_INDEX * STRIDE;
  const rightOffset = RIGHT_SHOULDER_INDEX * STRIDE;

  const leftX = poseData[leftOffset];
  const rightX = poseData[rightOffset];
  const leftConf = poseData[leftOffset + 2];
  const rightConf = poseData[rightOffset + 2];

  const valid = leftConf >= minConfidence && rightConf >= minConfidence;

  return {
    diff: leftX - rightX,
    valid,
  };
};

/**
 * Creates initial rotation tracking state with the address baseline captured.
 *
 * @param baselineDiff - The shoulder diff at address position
 * @returns Fresh tracking state anchored to the baseline
 */
export const startRotationTracking = (baselineDiff: number): RotationTrackingState => ({
  baselineDiff,
  backswingDetected: false,
  backswingSign: 0,
  backswingTimestamp: null,
  followThroughDetected: false,
  peakAbsDelta: 0,
  peakTimestamp: null,
  followThroughDelta: 0,
  followThroughTimestamp: null,
  takeawayTimestamp: null,
  impactTimestamp: null,
});

/**
 * Updates rotation tracking state with a new shoulder sample.
 *
 * Two-phase detection:
 * 1. Backswing: |delta from baseline| >= BACKSWING_ROTATION_THRESHOLD → records direction
 * 2. Follow-through: delta crosses to opposite sign, |delta| >= FOLLOW_THROUGH_ROTATION_THRESHOLD → confirmed
 *
 * @param state - Current tracking state
 * @param sample - Current shoulder rotation sample
 * @param timestamp - Current timestamp in ms
 * @returns Updated state and whether a full swing was confirmed
 */
export const updateRotationTracking = (
  state: RotationTrackingState,
  sample: ShoulderRotationSample,
  timestamp: number,
): RotationTrackingResult => {
  // Already confirmed — stay confirmed
  if (state.followThroughDetected) {
    return { state, swingConfirmed: true };
  }

  // Invalid sample — no state change
  if (!sample.valid) {
    return { state, swingConfirmed: false };
  }

  const delta = sample.diff - state.baselineDiff;
  const absDelta = Math.abs(delta);

  // Track running peak |delta| and its timestamp for tempo calculation.
  // Only update during backswing phase — once we're in follow-through direction,
  // the opposite-sign absDelta could exceed backswing peak and overwrite it.
  const inBackswingPhase = state.backswingDetected &&
    (state.backswingSign > 0 ? delta >= 0 : delta <= 0);
  const peakUpdated = inBackswingPhase && absDelta > state.peakAbsDelta;
  const peakAbsDelta = peakUpdated ? absDelta : state.peakAbsDelta;
  const peakTimestamp = peakUpdated ? timestamp : state.peakTimestamp;

  // Tempo: detect takeaway (first time delta exceeds low threshold)
  const takeawayTimestamp = state.takeawayTimestamp === null && absDelta >= TAKEAWAY_ROTATION_THRESHOLD
    ? timestamp
    : state.takeawayTimestamp;

  // Tempo: detect impact (first zero crossing after backswing peak).
  // After backswing is detected, when delta crosses to opposite sign, that's
  // approximately impact — capture only the first crossing.
  const isOppositeSign = state.backswingDetected &&
    (state.backswingSign > 0 ? delta < 0 : delta > 0);
  const impactTimestamp = state.impactTimestamp === null && isOppositeSign
    ? timestamp
    : state.impactTimestamp;

  // Check timeout: if backswing detected but no follow-through within timeout, reset
  if (
    state.backswingDetected &&
    state.backswingTimestamp !== null &&
    timestamp - state.backswingTimestamp >= ROTATION_TIMEOUT_MS
  ) {
    return {
      state: startRotationTracking(state.baselineDiff),
      swingConfirmed: false,
    };
  }

  // Phase 1: detect backswing
  if (!state.backswingDetected) {
    if (absDelta >= BACKSWING_ROTATION_THRESHOLD) {
      return {
        state: {
          ...state,
          backswingDetected: true,
          backswingSign: delta > 0 ? 1 : -1,
          backswingTimestamp: timestamp,
          peakAbsDelta: absDelta,
          peakTimestamp: timestamp,
          takeawayTimestamp,
          impactTimestamp,
        },
        swingConfirmed: false,
      };
    }
    return { state: { ...state, peakAbsDelta, peakTimestamp, takeawayTimestamp, impactTimestamp }, swingConfirmed: false };
  }

  // Phase 2: detect follow-through (opposite direction from backswing)
  if (isOppositeSign && absDelta >= FOLLOW_THROUGH_ROTATION_THRESHOLD) {
    return {
      state: {
        ...state,
        followThroughDetected: true,
        // Freeze peak at backswing maximum — don't let follow-through overwrite
        peakAbsDelta: state.peakAbsDelta,
        peakTimestamp: state.peakTimestamp,
        followThroughDelta: absDelta,
        followThroughTimestamp: timestamp,
        takeawayTimestamp,
        impactTimestamp,
      },
      swingConfirmed: true,
    };
  }

  return { state: { ...state, peakAbsDelta, peakTimestamp, takeawayTimestamp, impactTimestamp }, swingConfirmed: false };
};
