/**
 * Address posture validation using pose joint positions.
 *
 * Distinguishes address position from follow-through hold (or other
 * non-address still positions) by checking wrist height relative to
 * shoulders. At address, wrists are at hip level (below shoulders).
 * In follow-through, wrists are at or above shoulder level.
 *
 * Used alongside stillness detection to prevent false address triggers
 * when the golfer holds their follow-through.
 */

/** Joint indices in the 72-element pose array (index * 3 = offset). */
const JOINT = {
  leftShoulder: 2,
  rightShoulder: 3,
  leftWrist: 6,
  rightWrist: 7,
} as const;

/** Values per joint: x, y, confidence. */
const STRIDE = 3;

/** Default minimum confidence to include a joint. */
const DEFAULT_MIN_CONFIDENCE = 0.3;

/** Minimum number of shoulder-wrist pairs needed for a reliable check. */
const MIN_SHOULDERS = 1;
const MIN_WRISTS = 1;

export type AddressPostureResult = {
  /** Whether the pose looks like a plausible address position. */
  isAddressPosture: boolean;
  /** Debug reason string (e.g., "wrists above shoulders", "insufficient joints"). */
  reason: string;
};

/**
 * Extract a joint's Y coordinate and confidence from the pose array.
 * Returns null if confidence is below threshold.
 */
const getJointY = (
  poseData: readonly number[],
  jointIndex: number,
  minConfidence: number,
): number | null => {
  const offset = jointIndex * STRIDE;
  const confidence = poseData[offset + 2];
  if (confidence < minConfidence) return null;
  return poseData[offset + 1]; // y coordinate
};

/**
 * Check whether the current pose is a plausible address position.
 *
 * Verifies that the average wrist Y is below (greater than, in screen
 * coordinates) the average shoulder Y. This catches follow-through holds
 * where wrists are at or above shoulder level.
 *
 * Returns `isAddressPosture: true` when:
 * - Wrists are below shoulders (address, setup, idle standing)
 * - Insufficient joints tracked (falls back to stillness-only, doesn't block)
 *
 * Returns `isAddressPosture: false` when:
 * - Wrists are at or above shoulders (follow-through, arms raised)
 *
 * @param poseData - 72-element array (24 joints x 3: x, y, confidence)
 * @param minConfidence - Minimum joint confidence to include (default 0.3)
 */
export const checkAddressPosture = (
  poseData: readonly number[],
  minConfidence: number = DEFAULT_MIN_CONFIDENCE,
): AddressPostureResult => {
  // Collect confident shoulder Y values
  const shoulderYValues: number[] = [];
  const leftShoulderY = getJointY(poseData, JOINT.leftShoulder, minConfidence);
  if (leftShoulderY !== null) shoulderYValues.push(leftShoulderY);
  const rightShoulderY = getJointY(poseData, JOINT.rightShoulder, minConfidence);
  if (rightShoulderY !== null) shoulderYValues.push(rightShoulderY);

  // Collect confident wrist Y values
  const wristYValues: number[] = [];
  const leftWristY = getJointY(poseData, JOINT.leftWrist, minConfidence);
  if (leftWristY !== null) wristYValues.push(leftWristY);
  const rightWristY = getJointY(poseData, JOINT.rightWrist, minConfidence);
  if (rightWristY !== null) wristYValues.push(rightWristY);

  // Not enough joints — can't check, allow address (don't block)
  if (shoulderYValues.length < MIN_SHOULDERS || wristYValues.length < MIN_WRISTS) {
    return { isAddressPosture: true, reason: 'insufficient joints' };
  }

  const avgShoulderY = shoulderYValues.reduce((a, b) => a + b, 0) / shoulderYValues.length;
  const avgWristY = wristYValues.reduce((a, b) => a + b, 0) / wristYValues.length;

  // Screen coordinates: Y increases downward. Wrists below shoulders = wrist Y > shoulder Y.
  if (avgWristY > avgShoulderY) {
    return { isAddressPosture: true, reason: 'wrists below shoulders' };
  }

  return {
    isAddressPosture: false,
    reason: `wrists above shoulders (wristY=${avgWristY.toFixed(3)} shoulderY=${avgShoulderY.toFixed(3)})`,
  };
};
