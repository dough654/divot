/**
 * Pose-based stillness detection.
 *
 * Computes average joint displacement between consecutive pose frames to
 * determine if the person is standing still — immune to background motion
 * (TVs, wind, other people) unlike frame differencing.
 *
 * Uses normalized coordinates (0–1), so displacement values are
 * resolution-independent.
 */

/** Number of joints in a pose frame (Apple Vision / MediaPipe 24-joint model). */
const JOINT_COUNT = 24;

/** Values per joint: x, y, confidence. */
const VALUES_PER_JOINT = 3;

/** Minimum joints required for a reliable stillness measurement. */
const MIN_JOINTS_FOR_MEASUREMENT = 4;

/** Default minimum confidence to include a joint in the displacement calculation. */
const DEFAULT_MIN_CONFIDENCE = 0.3;

export type PoseDisplacement = {
  /** Average displacement across qualifying joints (normalized coordinates). */
  displacement: number;
  /** Number of joints that contributed to the measurement. */
  jointCount: number;
};

/**
 * Compute average joint displacement between two consecutive pose frames.
 *
 * Only considers joints that have confidence above `minConfidence` in BOTH
 * frames. Returns displacement 0 with jointCount 0 if too few joints qualify.
 *
 * @param currentPose - 72-element array (24 joints x 3: x, y, confidence)
 * @param previousPose - 72-element array from the previous frame
 * @param minConfidence - Minimum confidence to include a joint (default 0.3)
 * @returns Average displacement and number of qualifying joints
 */
export const computePoseDisplacement = (
  currentPose: readonly number[],
  previousPose: readonly number[],
  minConfidence: number = DEFAULT_MIN_CONFIDENCE,
): PoseDisplacement => {
  let totalDisplacement = 0;
  let jointCount = 0;

  for (let i = 0; i < JOINT_COUNT; i++) {
    const base = i * VALUES_PER_JOINT;
    const currentConfidence = currentPose[base + 2];
    const previousConfidence = previousPose[base + 2];

    // Only use joints confident in both frames
    if (currentConfidence < minConfidence || previousConfidence < minConfidence) continue;

    const dx = currentPose[base] - previousPose[base];
    const dy = currentPose[base + 1] - previousPose[base + 1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    totalDisplacement += distance;
    jointCount++;
  }

  return {
    displacement: jointCount > 0 ? totalDisplacement / jointCount : 0,
    jointCount,
  };
};

/**
 * Check whether a pose displacement measurement represents stillness.
 *
 * @param result - Output from computePoseDisplacement
 * @param threshold - Maximum average displacement to consider "still" (default 0.01)
 * @returns true if enough joints are tracked and displacement is below threshold
 */
export const isPoseStill = (
  result: PoseDisplacement,
  threshold: number = 0.01,
): boolean => {
  if (result.jointCount < MIN_JOINTS_FOR_MEASUREMENT) return false;
  return result.displacement < threshold;
};
