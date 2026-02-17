/**
 * Address posture validation using pose joint positions.
 *
 * Distinguishes address position from follow-through hold (or other
 * non-address still positions) by checking wrist height relative to
 * the torso midpoint (halfway between shoulders and hips).
 *
 * At address, wrists hang at hip level — well below the torso midpoint.
 * In follow-through, wrists are up near shoulder level — above the midpoint.
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
  leftHip: 8,
  rightHip: 9,
} as const;

/** Values per joint: x, y, confidence. */
const STRIDE = 3;

/** Default minimum confidence to include a joint. */
const DEFAULT_MIN_CONFIDENCE = 0.3;

export type AddressPostureResult = {
  /** Whether the pose looks like a plausible address position. */
  isAddressPosture: boolean;
  /** Debug reason string. */
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

/** Average an array of numbers, or return null if empty. */
const avg = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Check whether the current pose is a plausible address position.
 *
 * Computes the torso midpoint (average of shoulder Y and hip Y) and
 * checks that wrists are below it (greater Y in screen coordinates).
 * At address, wrists hang at hip level — well below midpoint. In a
 * follow-through hold, wrists are near shoulder level — above midpoint.
 *
 * Falls back gracefully:
 * - If hips are missing, uses shoulders only (original check).
 * - If shoulders are missing but hips available, uses hips only.
 * - If neither shoulders nor hips are tracked, returns true (don't block).
 * - If wrists aren't tracked, returns true (don't block).
 *
 * @param poseData - 72-element array (24 joints x 3: x, y, confidence)
 * @param minConfidence - Minimum joint confidence to include (default 0.3)
 */
export const checkAddressPosture = (
  poseData: readonly number[],
  minConfidence: number = DEFAULT_MIN_CONFIDENCE,
): AddressPostureResult => {
  // Collect confident joint Y values
  const shoulderYValues: number[] = [];
  const leftShoulderY = getJointY(poseData, JOINT.leftShoulder, minConfidence);
  if (leftShoulderY !== null) shoulderYValues.push(leftShoulderY);
  const rightShoulderY = getJointY(poseData, JOINT.rightShoulder, minConfidence);
  if (rightShoulderY !== null) shoulderYValues.push(rightShoulderY);

  const hipYValues: number[] = [];
  const leftHipY = getJointY(poseData, JOINT.leftHip, minConfidence);
  if (leftHipY !== null) hipYValues.push(leftHipY);
  const rightHipY = getJointY(poseData, JOINT.rightHip, minConfidence);
  if (rightHipY !== null) hipYValues.push(rightHipY);

  const wristYValues: number[] = [];
  const leftWristY = getJointY(poseData, JOINT.leftWrist, minConfidence);
  if (leftWristY !== null) wristYValues.push(leftWristY);
  const rightWristY = getJointY(poseData, JOINT.rightWrist, minConfidence);
  if (rightWristY !== null) wristYValues.push(rightWristY);

  // Need at least one wrist to check
  if (wristYValues.length === 0) {
    return { isAddressPosture: true, reason: 'insufficient joints (no wrists)' };
  }

  const avgShoulderY = avg(shoulderYValues);
  const avgHipY = avg(hipYValues);
  const avgWristY = avg(wristYValues)!; // guaranteed non-null from check above

  // Compute the reference Y threshold — the torso midpoint between shoulders and hips.
  // Screen coordinates: Y increases downward.
  let referenceY: number | null = null;
  let referenceLabel: string;

  if (avgShoulderY !== null && avgHipY !== null) {
    // Both available — use midpoint of torso
    referenceY = (avgShoulderY + avgHipY) / 2;
    referenceLabel = 'torso midpoint';
  } else if (avgShoulderY !== null) {
    // Hips missing — fall back to shoulders only
    referenceY = avgShoulderY;
    referenceLabel = 'shoulders';
  } else if (avgHipY !== null) {
    // Shoulders missing — fall back to hips only
    referenceY = avgHipY;
    referenceLabel = 'hips';
  } else {
    return { isAddressPosture: true, reason: 'insufficient joints (no torso)' };
  }

  // Wrists must be below (greater Y) the reference point
  if (avgWristY > referenceY) {
    return { isAddressPosture: true, reason: `wrists below ${referenceLabel}` };
  }

  return {
    isAddressPosture: false,
    reason: `wrists above ${referenceLabel} (wristY=${avgWristY.toFixed(3)} ref=${referenceY.toFixed(3)})`,
  };
};
