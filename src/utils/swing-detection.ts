import type {
  PoseFrame,
  SwingDetectionState,
  SwingDetectionConfig,
  SwingEvent,
} from '@/src/types/pose';

/** Internal counters for the swing detection state machine. */
export type SwingCounters = {
  /** Consecutive frames where velocity exceeds threshold. */
  confirmationCount: number;
  /** Consecutive frames where velocity is below threshold. */
  cooldownCount: number;
  /** Timestamp when swing detection started (for min duration check). */
  swingStartTimestamp: number;
};

/** Default swing detection configuration. */
export const DEFAULT_SWING_DETECTION_CONFIG: SwingDetectionConfig = {
  velocityThreshold: 0.15,
  confirmationFrames: 3,
  cooldownFrames: 5,
  preRollDurationMs: 2000,
  postRollDurationMs: 3000,
  minSwingDurationMs: 500,
};

/** Initial counters for the swing detection state machine. */
export const INITIAL_SWING_COUNTERS: SwingCounters = {
  confirmationCount: 0,
  cooldownCount: 0,
  swingStartTimestamp: 0,
};

/**
 * Computes the average wrist velocity between two consecutive pose frames.
 * Uses Euclidean distance of the average wrist position divided by time delta.
 *
 * @param prevPose - The previous pose frame
 * @param currentPose - The current pose frame
 * @returns Velocity in normalized units per second, or 0 if wrists not detected
 */
export const computeWristVelocity = (
  prevPose: PoseFrame,
  currentPose: PoseFrame,
): number => {
  const timeDeltaMs = currentPose.timestamp - prevPose.timestamp;
  if (timeDeltaMs <= 0) return 0;

  const minConfidence = 0.3;

  const prevLeft = prevPose.joints.leftWrist;
  const prevRight = prevPose.joints.rightWrist;
  const currLeft = currentPose.joints.leftWrist;
  const currRight = currentPose.joints.rightWrist;

  // Require at least one wrist visible in both frames
  const prevLeftValid = prevLeft.confidence >= minConfidence;
  const prevRightValid = prevRight.confidence >= minConfidence;
  const currLeftValid = currLeft.confidence >= minConfidence;
  const currRightValid = currRight.confidence >= minConfidence;

  let totalVelocity = 0;
  let count = 0;

  if (prevLeftValid && currLeftValid) {
    const dx = currLeft.x - prevLeft.x;
    const dy = currLeft.y - prevLeft.y;
    totalVelocity += Math.sqrt(dx * dx + dy * dy);
    count++;
  }

  if (prevRightValid && currRightValid) {
    const dx = currRight.x - prevRight.x;
    const dy = currRight.y - prevRight.y;
    totalVelocity += Math.sqrt(dx * dx + dy * dy);
    count++;
  }

  if (count === 0) return 0;

  const averageDisplacement = totalVelocity / count;
  const timeDeltaSec = timeDeltaMs / 1000;
  return averageDisplacement / timeDeltaSec;
};

/** Result of a single state machine transition. */
export type SwingStateTransition = {
  state: SwingDetectionState;
  event: SwingEvent | null;
  counters: SwingCounters;
};

/**
 * Pure state machine for swing auto-detection.
 * Given the current state, wrist velocity, and config, returns the next state,
 * any event to emit, and updated counters.
 *
 * State flow: idle → armed → detecting → recording → cooldown → armed
 *
 * @param state - Current detection state
 * @param velocity - Current wrist velocity in normalized units/sec
 * @param timestamp - Current frame timestamp in ms
 * @param config - Detection configuration
 * @param counters - Current frame counters
 * @returns Next state, optional event, and updated counters
 */
export const nextSwingState = (
  state: SwingDetectionState,
  velocity: number,
  timestamp: number,
  config: SwingDetectionConfig,
  counters: SwingCounters,
): SwingStateTransition => {
  const aboveThreshold = velocity >= config.velocityThreshold;

  switch (state) {
    case 'idle':
      // Idle does nothing — external caller must arm
      return { state: 'idle', event: null, counters };

    case 'armed': {
      if (aboveThreshold) {
        return {
          state: 'detecting',
          event: null,
          counters: {
            ...counters,
            confirmationCount: 1,
            cooldownCount: 0,
          },
        };
      }
      return { state: 'armed', event: null, counters };
    }

    case 'detecting': {
      if (aboveThreshold) {
        const newConfirmation = counters.confirmationCount + 1;
        if (newConfirmation >= config.confirmationFrames) {
          return {
            state: 'recording',
            event: { type: 'swingStarted', timestamp },
            counters: {
              confirmationCount: 0,
              cooldownCount: 0,
              swingStartTimestamp: timestamp,
            },
          };
        }
        return {
          state: 'detecting',
          event: null,
          counters: { ...counters, confirmationCount: newConfirmation },
        };
      }
      // Velocity dropped — cancel detection
      return {
        state: 'armed',
        event: null,
        counters: { ...counters, confirmationCount: 0 },
      };
    }

    case 'recording': {
      if (!aboveThreshold) {
        const newCooldown = counters.cooldownCount + 1;
        if (newCooldown >= config.cooldownFrames) {
          const durationMs = timestamp - counters.swingStartTimestamp;
          if (durationMs < config.minSwingDurationMs) {
            return {
              state: 'armed',
              event: { type: 'swingCancelled', reason: 'too_short' },
              counters: INITIAL_SWING_COUNTERS,
            };
          }
          return {
            state: 'cooldown',
            event: { type: 'swingEnded', timestamp, durationMs },
            counters: INITIAL_SWING_COUNTERS,
          };
        }
        return {
          state: 'recording',
          event: null,
          counters: { ...counters, cooldownCount: newCooldown },
        };
      }
      // Still swinging — reset cooldown
      return {
        state: 'recording',
        event: null,
        counters: { ...counters, cooldownCount: 0 },
      };
    }

    case 'cooldown': {
      // Brief pause before re-arming to avoid immediately re-triggering
      return {
        state: 'armed',
        event: null,
        counters: INITIAL_SWING_COUNTERS,
      };
    }

    default:
      return { state: 'idle', event: null, counters };
  }
};

/**
 * Maps a 0-1 sensitivity value to a velocity threshold.
 * Higher sensitivity = lower threshold = easier to trigger.
 *
 * @param sensitivity - 0 (least sensitive) to 1 (most sensitive)
 * @returns Velocity threshold in normalized units/sec
 */
export const sensitivityToThreshold = (sensitivity: number): number => {
  const clamped = Math.max(0, Math.min(1, sensitivity));
  // Linear interpolation: sensitivity 0 → threshold 0.30, sensitivity 1 → threshold 0.05
  return 0.30 - clamped * 0.25;
};
