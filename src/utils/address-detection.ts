import type {
  PoseFrame,
  JointPosition,
  AddressDetectionState,
  AddressDetectionConfig,
  AddressEvent,
  JointName,
} from '@/src/types/pose';
import { JOINT_NAMES } from './pose-normalization';
import { computeTorsoAnchor } from './swing-detection';

/** Default address detection configuration. */
export const DEFAULT_ADDRESS_CONFIG: AddressDetectionConfig = {
  wristProximityThreshold: 0.15,
  stillnessThreshold: 0.04,
  confirmationPolls: 6,
  exitPolls: 12,
  wristHipVerticalThreshold: 0.25,
};

/** Maximum missed polls allowed during confirmation before resetting. */
const MAX_CONFIRMATION_MISSES = 4;

/** Internal counters for the address detection state machine. */
export type AddressCounters = {
  /** Consecutive polls where address criteria are met. */
  confirmationCount: number;
  /** Missed polls during confirmation (resets on good poll, cancels on exceeding max). */
  missCount: number;
  /** Consecutive polls where address criteria are broken. */
  exitCount: number;
};

/** Initial counters for the address detection state machine. */
export const INITIAL_ADDRESS_COUNTERS: AddressCounters = {
  confirmationCount: 0,
  missCount: 0,
  exitCount: 0,
};

/** Result of a single address state machine transition. */
export type AddressStateTransition = {
  state: AddressDetectionState;
  event: AddressEvent | null;
  counters: AddressCounters;
};

/**
 * Minimum joint confidence to consider a joint visible.
 * Matches swing detection's threshold. The pose model reports 0.0 for garbage
 * positions and 0.1-0.2 for noisy ones — 0.3 filters those out while keeping
 * real detections. EMA smoothing bridges brief confidence dips.
 */
const MIN_CONFIDENCE = 0.3;

/**
 * Checks whether the current pose matches golf address geometry.
 *
 * Two signals:
 * 1. Wrist proximity — both wrists close together (gripping the club).
 * 2. Wrist-hip vertical alignment — wrists near hip height (arms extended
 *    down to the club). Only checked when both hips are visible; when hips
 *    are low confidence we degrade to wrist-proximity-only.
 *
 * @param pose - Current pose frame
 * @param config - Address detection config
 * @returns Whether the pose matches address geometry
 */
export const checkAddressGeometry = (
  pose: PoseFrame,
  config: AddressDetectionConfig,
): boolean => {
  const leftWrist = pose.joints.leftWrist;
  const rightWrist = pose.joints.rightWrist;

  // Both wrists must be visible
  if (
    leftWrist.confidence < MIN_CONFIDENCE ||
    rightWrist.confidence < MIN_CONFIDENCE
  ) {
    return false;
  }

  // Wrists must be close together (gripping the club)
  const wristDx = leftWrist.x - rightWrist.x;
  const wristDy = leftWrist.y - rightWrist.y;
  const wristDistance = Math.sqrt(wristDx * wristDx + wristDy * wristDy);

  if (wristDistance > config.wristProximityThreshold) {
    return false;
  }

  // When hips are visible, wrists must be near hip height
  const lh = pose.joints.leftHip;
  const rh = pose.joints.rightHip;
  const hipsVisible = lh.confidence >= MIN_CONFIDENCE && rh.confidence >= MIN_CONFIDENCE;

  if (hipsVisible) {
    const avgWristY = (leftWrist.y + rightWrist.y) / 2;
    const avgHipY = (lh.y + rh.y) / 2;
    if (Math.abs(avgWristY - avgHipY) > config.wristHipVerticalThreshold) {
      return false;
    }
  }

  return true;
};

/** Debug info for understanding why address detection is or isn't triggering. */
export type AddressDebugInfo = {
  wristConfidence: { left: number; right: number };
  hipConfidence: { left: number; right: number };
  wristDistance: number;
  wristHipVerticalOffset: number;
  geometryOk: boolean;
};

/**
 * Returns detailed debug info about why address geometry did or didn't pass.
 * Only used for dev-mode logging.
 */
export const computeAddressDebugInfo = (
  pose: PoseFrame,
  config: AddressDetectionConfig,
): AddressDebugInfo => {
  const lw = pose.joints.leftWrist;
  const rw = pose.joints.rightWrist;
  const lh = pose.joints.leftHip;
  const rh = pose.joints.rightHip;

  const dx = lw.x - rw.x;
  const dy = lw.y - rw.y;
  const wristDistance = Math.sqrt(dx * dx + dy * dy);
  const avgWristY = (lw.y + rw.y) / 2;
  const avgHipY = (lh.y + rh.y) / 2;
  const verticalOffset = Math.abs(avgWristY - avgHipY);

  return {
    wristConfidence: { left: lw.confidence, right: rw.confidence },
    hipConfidence: { left: lh.confidence, right: rh.confidence },
    wristDistance,
    wristHipVerticalOffset: verticalOffset,
    geometryOk: checkAddressGeometry(pose, config),
  };
};

/** Joints used for computing body stillness. */
const STILLNESS_JOINTS: JointName[] = [
  'nose', 'neck',
  'leftShoulder', 'rightShoulder',
  'leftElbow', 'rightElbow',
  'leftWrist', 'rightWrist',
  'leftHip', 'rightHip',
];

/**
 * Computes average body displacement between two consecutive pose frames.
 * Uses Euclidean distance across all high-confidence joints, relative to a
 * torso anchor so that camera panning is cancelled out.
 *
 * Falls back to raw screen-space displacement when no torso anchor is available
 * in either frame (partial pose — not enough data to worry about camera motion).
 *
 * @param prevPose - Previous pose frame
 * @param currentPose - Current pose frame
 * @returns Average displacement, or null if fewer than 2 joints are visible in both frames
 */
export const computeBodyStillness = (
  prevPose: PoseFrame,
  currentPose: PoseFrame,
): number | null => {
  // Compute torso anchor shift to subtract camera motion
  const prevAnchor = computeTorsoAnchor(prevPose);
  const currAnchor = computeTorsoAnchor(currentPose);
  const hasAnchors = prevAnchor !== null && currAnchor !== null;
  const anchorDx = hasAnchors ? currAnchor.x - prevAnchor.x : 0;
  const anchorDy = hasAnchors ? currAnchor.y - prevAnchor.y : 0;

  let totalDisplacement = 0;
  let count = 0;

  for (const jointName of STILLNESS_JOINTS) {
    const prev = prevPose.joints[jointName];
    const curr = currentPose.joints[jointName];

    if (prev.confidence >= MIN_CONFIDENCE && curr.confidence >= MIN_CONFIDENCE) {
      const dx = (curr.x - prev.x) - anchorDx;
      const dy = (curr.y - prev.y) - anchorDy;
      totalDisplacement += Math.sqrt(dx * dx + dy * dy);
      count++;
    }
  }

  if (count < 2) return null;

  return totalDisplacement / count;
};

/**
 * Pure state machine for address position detection.
 *
 * State flow: watching → confirming → in-address → watching
 *
 * @param state - Current detection state
 * @param geometryOk - Whether the current pose matches address geometry
 * @param isStill - Whether the body is still (null = not enough data)
 * @param counters - Current counters
 * @param config - Detection configuration
 * @returns Next state, optional event, and updated counters
 */
export const nextAddressState = (
  state: AddressDetectionState,
  geometryOk: boolean,
  isStill: boolean | null,
  counters: AddressCounters,
  config: AddressDetectionConfig,
): AddressStateTransition => {
  const criteriaMetThisPoll = geometryOk && isStill === true;

  switch (state) {
    case 'watching': {
      if (criteriaMetThisPoll) {
        const newCount = counters.confirmationCount + 1;
        if (newCount >= config.confirmationPolls) {
          return {
            state: 'in-address',
            event: { type: 'addressEntered' },
            counters: INITIAL_ADDRESS_COUNTERS,
          };
        }
        return {
          state: 'confirming',
          event: null,
          counters: { ...counters, confirmationCount: newCount, missCount: 0, exitCount: 0 },
        };
      }
      // Criteria not met — reset confirmation
      return {
        state: 'watching',
        event: null,
        counters: { ...counters, confirmationCount: 0, missCount: 0 },
      };
    }

    case 'confirming': {
      if (criteriaMetThisPoll) {
        const newCount = counters.confirmationCount + 1;
        if (newCount >= config.confirmationPolls) {
          return {
            state: 'in-address',
            event: { type: 'addressEntered' },
            counters: INITIAL_ADDRESS_COUNTERS,
          };
        }
        return {
          state: 'confirming',
          event: null,
          counters: { ...counters, confirmationCount: newCount, missCount: 0 },
        };
      }
      // Criteria missed — allow a few misses before resetting
      const newMissCount = counters.missCount + 1;
      if (newMissCount > MAX_CONFIRMATION_MISSES) {
        return {
          state: 'watching',
          event: null,
          counters: INITIAL_ADDRESS_COUNTERS,
        };
      }
      return {
        state: 'confirming',
        event: null,
        counters: { ...counters, missCount: newMissCount },
      };
    }

    case 'in-address': {
      if (!criteriaMetThisPoll) {
        const newExitCount = counters.exitCount + 1;
        if (newExitCount >= config.exitPolls) {
          return {
            state: 'watching',
            event: { type: 'addressExited' },
            counters: INITIAL_ADDRESS_COUNTERS,
          };
        }
        return {
          state: 'in-address',
          event: null,
          counters: { ...counters, exitCount: newExitCount },
        };
      }
      // Still in address — reset exit counter
      return {
        state: 'in-address',
        event: null,
        counters: { ...counters, exitCount: 0 },
      };
    }

    default:
      return { state: 'watching', event: null, counters };
  }
};

/**
 * Confidence below this threshold indicates garbage position data.
 * Values of 0.0 always have garbage positions (wrist distance jumps to 0.65+).
 * Values of 0.05+ may still be noisy but are at least spatially plausible.
 */
const SMOOTH_CARRY_THRESHOLD = 0.05;

/** Per-frame confidence decay multiplier when carrying forward a stale joint. */
const CONFIDENCE_DECAY = 0.85;

/** Default EMA alpha for detection pipeline smoothing. */
const DETECTION_SMOOTH_ALPHA = 0.4;

/**
 * Applies EMA smoothing to a PoseFrame for more stable address detection input.
 *
 * Handles two problematic patterns from Apple Vision / ML Kit:
 * 1. Confidence bouncing 0.0→0.6→0.0: garbage frames are replaced with
 *    carried-forward positions at decaying confidence.
 * 2. Position jitter between frames: EMA-blended for stability.
 *
 * @param current - Current raw pose frame
 * @param previous - Previous smoothed pose frame, or null on first frame
 * @param alpha - EMA weight for new data (default 0.4)
 * @returns New smoothed PoseFrame
 */
export const smoothPoseFrame = (
  current: PoseFrame,
  previous: PoseFrame | null,
  alpha: number = DETECTION_SMOOTH_ALPHA,
): PoseFrame => {
  const joints = {} as Record<JointName, JointPosition>;

  for (const name of JOINT_NAMES) {
    const curr = current.joints[name];
    const prev = previous?.joints[name];

    if (!prev || prev.confidence < SMOOTH_CARRY_THRESHOLD) {
      // No usable previous — use current raw (even if bad, it's all we have)
      joints[name] = { x: curr.x, y: curr.y, confidence: curr.confidence };
    } else if (curr.confidence < SMOOTH_CARRY_THRESHOLD) {
      // Current is garbage — carry forward previous with decayed confidence
      joints[name] = {
        x: prev.x,
        y: prev.y,
        confidence: prev.confidence * CONFIDENCE_DECAY,
      };
    } else {
      // Both usable — EMA blend position and confidence
      joints[name] = {
        x: prev.x + alpha * (curr.x - prev.x),
        y: prev.y + alpha * (curr.y - prev.y),
        confidence: prev.confidence + alpha * (curr.confidence - prev.confidence),
      };
    }
  }

  return { timestamp: current.timestamp, joints };
};
