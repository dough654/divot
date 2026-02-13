import type {
  PoseFrame,
  AddressDetectionState,
  AddressDetectionConfig,
  AddressEvent,
  JointName,
} from '@/src/types/pose';

/** Default address detection configuration. */
export const DEFAULT_ADDRESS_CONFIG: AddressDetectionConfig = {
  wristProximityThreshold: 0.25,
  stillnessThreshold: 0.04,
  confirmationPolls: 6,
  exitPolls: 12,
  wristHipVerticalThreshold: 0.50,
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
 * Set low (0.1) because the pose model frequently reports valid positions
 * at confidence 0.11-0.19. The 0.0 cases genuinely have garbage positions
 * (distance jumps to 0.65+) so they naturally fail the distance check.
 */
const MIN_CONFIDENCE = 0.1;

/**
 * Checks whether the current pose matches golf address geometry.
 *
 * The only hard signal is wrist proximity — both wrists close together,
 * meaning the golfer is gripping the club. Hip-relative checks have been
 * removed because hip Y coordinates are too noisy frame-to-frame on the
 * current pose model to be useful.
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

  // Both wrists must be minimally visible
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

  return wristDistance <= config.wristProximityThreshold;
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
 * Uses Euclidean distance across all high-confidence joints.
 *
 * Returns the average displacement in normalized units (not velocity —
 * callers compare directly to the stillness threshold which is tuned per-poll).
 *
 * @param prevPose - Previous pose frame
 * @param currentPose - Current pose frame
 * @returns Average displacement, or null if fewer than 4 joints are visible in both frames
 */
export const computeBodyStillness = (
  prevPose: PoseFrame,
  currentPose: PoseFrame,
): number | null => {
  let totalDisplacement = 0;
  let count = 0;

  for (const jointName of STILLNESS_JOINTS) {
    const prev = prevPose.joints[jointName];
    const curr = currentPose.joints[jointName];

    if (prev.confidence >= MIN_CONFIDENCE && curr.confidence >= MIN_CONFIDENCE) {
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
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
