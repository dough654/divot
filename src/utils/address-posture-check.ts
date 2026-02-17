/**
 * Address posture validation using pose joint positions.
 *
 * Distinguishes address position from follow-through hold by checking:
 * 1. Body in frame — at least one shoulder + one hip detected
 * 2. Wrist height — wrists must be near hip level (bottom 25% of torso)
 * 3. Forward bend — shoulders must be offset in X from hips (spine tilt)
 * 4. Shoulders aligned down the line — shoulders close together in X
 *
 * Camera is behind the golfer looking down the line:
 * - At address: side-on, wrists at hips, forward tilt, shoulders stacked.
 * - In follow-through: rotated toward target, wrists high, shoulders spread.
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

/**
 * Wrist height threshold as a fraction of the shoulder→hip distance.
 * 0.75 means wrists must be at least 75% of the way from shoulders to hips
 * (i.e., in the bottom quarter of the torso, near hip level).
 */
const WRIST_HEIGHT_RATIO = 0.75;

/**
 * Minimum absolute X offset between shoulders and hips for forward bend
 * detection (normalized coordinates). At address, the golfer tilts forward
 * from the hips so shoulders shift horizontally relative to hips.
 * 0.05 = 5% of frame width — requires a real forward tilt, rejects
 * standing upright at a slight camera angle.
 */
const MIN_FORWARD_BEND_X = 0.05;

/**
 * Maximum X gap between left and right shoulder for the "shoulders aligned
 * down the line" check. At address, the golfer is side-on to the camera so
 * both shoulders nearly overlap in X. In follow-through, the body has
 * rotated toward the target and the shoulders spread apart horizontally.
 * 0.06 = 6% of frame width — tight enough to reject rotated positions,
 * loose enough to tolerate slight camera angle variation.
 */
const MAX_SHOULDER_X_GAP = 0.06;

type JointCoords = { x: number; y: number };

export type AddressPostureResult = {
  /** Whether the pose looks like a plausible address position. */
  isAddressPosture: boolean;
  /** Debug reason string. */
  reason: string;
};

/**
 * Extract a joint's X, Y coordinates from the pose array.
 * Returns null if confidence is below threshold.
 */
const getJoint = (
  poseData: readonly number[],
  jointIndex: number,
  minConfidence: number,
): JointCoords | null => {
  const offset = jointIndex * STRIDE;
  const confidence = poseData[offset + 2];
  if (confidence < minConfidence) return null;
  return { x: poseData[offset], y: poseData[offset + 1] };
};

/** Average an array of numbers, or return null if empty. */
const avg = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Check whether the current pose is a plausible address position.
 *
 * Four conditions must all pass:
 *
 * 1. **Body in frame**: At least one shoulder and one hip must be detected.
 *    Rejects when the golfer is too close to the camera (lower body cut off).
 *
 * 2. **Wrists near hip level**: Wrists must be in the bottom 25% of the
 *    torso (between 75% and 100% of the shoulder→hip distance). At address,
 *    arms hang down with wrists at hip level. In follow-through, wrists
 *    are up at chest/shoulder height.
 *
 * 3. **Forward bend**: Shoulders must have a meaningful horizontal (X)
 *    offset from hips. At address, the golfer tilts forward from the hips
 *    so shoulders are displaced toward the ball. In follow-through, the
 *    torso is more upright with shoulders roughly above hips.
 *
 * 4. **Shoulders aligned down the line**: Left and right shoulders must be
 *    close together in X. At address the golfer is side-on, so shoulders
 *    nearly overlap. In follow-through the body has rotated toward the
 *    target, spreading the shoulders apart horizontally.
 *
 * Each check is skipped when its required joints are missing (falls back
 * to true for that check — doesn't block address detection).
 *
 * @param poseData - 72-element array (24 joints x 3: x, y, confidence)
 * @param minConfidence - Minimum joint confidence to include (default 0.3)
 */
export const checkAddressPosture = (
  poseData: readonly number[],
  minConfidence: number = DEFAULT_MIN_CONFIDENCE,
): AddressPostureResult => {
  // Extract confident joints
  const leftShoulder = getJoint(poseData, JOINT.leftShoulder, minConfidence);
  const rightShoulder = getJoint(poseData, JOINT.rightShoulder, minConfidence);
  const leftHip = getJoint(poseData, JOINT.leftHip, minConfidence);
  const rightHip = getJoint(poseData, JOINT.rightHip, minConfidence);
  const leftWrist = getJoint(poseData, JOINT.leftWrist, minConfidence);
  const rightWrist = getJoint(poseData, JOINT.rightWrist, minConfidence);

  const shoulderXValues = [leftShoulder, rightShoulder].filter(Boolean).map(j => j!.x);
  const shoulderYValues = [leftShoulder, rightShoulder].filter(Boolean).map(j => j!.y);
  const hipXValues = [leftHip, rightHip].filter(Boolean).map(j => j!.x);
  const hipYValues = [leftHip, rightHip].filter(Boolean).map(j => j!.y);
  const wristYValues = [leftWrist, rightWrist].filter(Boolean).map(j => j!.y);

  const avgShoulderX = avg(shoulderXValues);
  const avgShoulderY = avg(shoulderYValues);
  const avgHipX = avg(hipXValues);
  const avgHipY = avg(hipYValues);
  const avgWristY = avg(wristYValues);

  // ── Check 1: Wrists near hip level ──
  let wristsLow = true; // default: don't block if we can't check
  let wristReason = 'no wrist/torso data';

  if (avgWristY !== null && avgShoulderY !== null && avgHipY !== null) {
    // Screen coords: Y increases downward. Threshold is 75% of the way from shoulders to hips.
    const torsoHeight = avgHipY - avgShoulderY;
    const wristThresholdY = avgShoulderY + WRIST_HEIGHT_RATIO * torsoHeight;
    wristsLow = avgWristY > wristThresholdY;
    wristReason = wristsLow
      ? `wrists near hips (wristY=${avgWristY.toFixed(3)} threshold=${wristThresholdY.toFixed(3)})`
      : `wrists too high (wristY=${avgWristY.toFixed(3)} threshold=${wristThresholdY.toFixed(3)})`;
  } else if (avgWristY !== null && avgHipY !== null) {
    // No shoulders — check wrists are at or below hip level
    wristsLow = avgWristY >= avgHipY;
    wristReason = wristsLow ? 'wrists at/below hips' : 'wrists above hips';
  }

  // ── Check 2: Forward bend (shoulder-hip X offset) ──
  let hasBend = true; // default: don't block if we can't check
  let bendReason = 'no shoulder/hip X data';

  if (avgShoulderX !== null && avgHipX !== null) {
    const xOffset = Math.abs(avgShoulderX - avgHipX);
    hasBend = xOffset >= MIN_FORWARD_BEND_X;
    bendReason = hasBend
      ? `forward bend detected (xOffset=${xOffset.toFixed(3)})`
      : `too upright (xOffset=${xOffset.toFixed(3)})`;
  }

  // ── Check 3: Shoulders aligned down the line ──
  let shouldersAligned = true; // default: don't block if we can't check
  let alignReason = 'need both shoulders';

  if (leftShoulder !== null && rightShoulder !== null) {
    const shoulderXGap = Math.abs(leftShoulder.x - rightShoulder.x);
    shouldersAligned = shoulderXGap <= MAX_SHOULDER_X_GAP;
    alignReason = shouldersAligned
      ? `shoulders aligned (gap=${shoulderXGap.toFixed(3)})`
      : `shoulders rotated (gap=${shoulderXGap.toFixed(3)})`;
  }

  // ── Check 4: Body in frame (shoulders + hips visible) ──
  // When the golfer is too close to the camera (e.g., walking back to pick
  // it up), the lower body is cut off and hips aren't detected. Require at
  // least one shoulder AND one hip to be tracked — this is a hard gate, not
  // a soft fallback, because we need the torso visible to trust the other checks.
  const hasShoulders = shoulderYValues.length > 0;
  const hasHips = hipYValues.length > 0;
  const bodyInFrame = hasShoulders && hasHips;
  const bodyReason = bodyInFrame
    ? 'body in frame'
    : `body not in frame (shoulders=${hasShoulders} hips=${hasHips})`;

  // All four must pass
  const isAddressPosture = wristsLow && hasBend && shouldersAligned && bodyInFrame;
  const reasons: string[] = [];
  if (!bodyInFrame) reasons.push(bodyReason);
  if (!wristsLow) reasons.push(wristReason);
  if (!hasBend) reasons.push(bendReason);
  if (!shouldersAligned) reasons.push(alignReason);
  const reason = isAddressPosture
    ? [bodyReason, wristReason, bendReason, alignReason].join('; ')
    : reasons.join('; ');

  return { isAddressPosture, reason };
};
