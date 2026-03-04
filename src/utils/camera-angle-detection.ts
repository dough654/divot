import type { CameraAngle } from '@/src/types/recording';

/**
 * Camera angle auto-detection from pose shoulder geometry.
 *
 * From DTL (side view), left and right shoulders nearly overlap horizontally —
 * X gap typically 0.01–0.04 at address, up to ~0.10 during rotation.
 * From face-on (front view), shoulders are spread wide — X gap typically 0.15–0.30+.
 *
 * Uses a sliding window of recent classifications so the detected angle
 * can update as the user changes position (e.g. walking to camera face-on,
 * then getting into a DTL stance).
 */

const LEFT_SHOULDER_INDEX = 2;
const RIGHT_SHOULDER_INDEX = 3;
const STRIDE = 3;

const DEFAULT_MIN_CONFIDENCE = 0.3;

/** Threshold below which we classify as DTL. */
const DTL_THRESHOLD = 0.08;

/** Threshold above which we classify as face-on. */
const FACE_ON_THRESHOLD = 0.18;

const DEFAULT_MIN_FRAMES = 8;
const DEFAULT_MIN_AGREEMENT = 0.7;

/** Max recent classifications to keep. At ~10fps, 12 frames ≈ 1.2s of history. */
const WINDOW_SIZE = 12;

export type AngleSignal = {
  angle: CameraAngle;
  confidence: number;
} | null;

export type AngleAccumulator = {
  /** Sliding window of recent angle classifications (null signals excluded). */
  recentAngles: CameraAngle[];
};

/**
 * Classify camera angle from a single pose frame's shoulder X spread.
 * Returns null if either shoulder has insufficient confidence.
 */
export const classifyCameraAngle = (
  poseData: readonly number[],
  minConfidence = DEFAULT_MIN_CONFIDENCE,
): AngleSignal => {
  const leftOffset = LEFT_SHOULDER_INDEX * STRIDE;
  const rightOffset = RIGHT_SHOULDER_INDEX * STRIDE;

  const leftConf = poseData[leftOffset + 2];
  const rightConf = poseData[rightOffset + 2];

  if (leftConf < minConfidence || rightConf < minConfidence) {
    return null;
  }

  const leftX = poseData[leftOffset];
  const rightX = poseData[rightOffset];
  const gap = Math.abs(leftX - rightX);

  if (gap < DTL_THRESHOLD) {
    return { angle: 'dtl', confidence: 1 - gap / DTL_THRESHOLD };
  }

  if (gap > FACE_ON_THRESHOLD) {
    return { angle: 'face-on', confidence: Math.min(1, (gap - FACE_ON_THRESHOLD) / FACE_ON_THRESHOLD) };
  }

  // Ambiguous zone — still classify but with low confidence
  const midpoint = (DTL_THRESHOLD + FACE_ON_THRESHOLD) / 2;
  if (gap < midpoint) {
    return { angle: 'dtl', confidence: 0.3 };
  }
  return { angle: 'face-on', confidence: 0.3 };
};

/** Create a fresh accumulator with an empty sliding window. */
export const createAngleAccumulator = (): AngleAccumulator => ({
  recentAngles: [],
});

/**
 * Feed a single frame's signal into the sliding window.
 * Returns a new accumulator (immutable). Null signals are ignored.
 * Window is capped at WINDOW_SIZE, oldest entries slide out.
 */
export const updateAngleAccumulator = (
  acc: AngleAccumulator,
  signal: AngleSignal,
): AngleAccumulator => {
  if (signal === null) return acc;

  const updated = [...acc.recentAngles, signal.angle];
  return {
    recentAngles: updated.length > WINDOW_SIZE ? updated.slice(-WINDOW_SIZE) : updated,
  };
};

/**
 * Check if the sliding window has enough agreement to determine the angle.
 * Returns the detected angle or null if consensus hasn't been reached.
 */
export const getDetectedAngle = (
  acc: AngleAccumulator,
  minFrames = DEFAULT_MIN_FRAMES,
  minAgreement = DEFAULT_MIN_AGREEMENT,
): CameraAngle | null => {
  if (acc.recentAngles.length < minFrames) return null;

  let dtlCount = 0;
  for (const angle of acc.recentAngles) {
    if (angle === 'dtl') dtlCount++;
  }

  const total = acc.recentAngles.length;
  const faceOnCount = total - dtlCount;

  if (dtlCount / total >= minAgreement) return 'dtl';
  if (faceOnCount / total >= minAgreement) return 'face-on';

  return null;
};
