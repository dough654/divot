import type {
  PoseFrame,
  SwingDetectionState,
  SwingDetectionConfig,
  SwingEvent,
} from '@/src/types/pose';

/** A 2D point in normalized coordinates. */
type Point2D = { x: number; y: number };

/** Result of body-relative wrist motion computation. */
export type WristMotionResult = {
  /** Euclidean speed in normalized units/sec. */
  velocity: number;
  /** Fraction of motion that is upward (0-1). 1 = purely upward. */
  upwardFraction: number;
};

/** Internal counters for the swing detection state machine. */
export type SwingCounters = {
  /** Recent velocity-above-threshold results (ring buffer, last N polls). */
  recentHits: boolean[];
  /** Consecutive frames where velocity is below threshold. */
  cooldownCount: number;
  /** Timestamp when swing detection started (for min duration check). */
  swingStartTimestamp: number;
};

/** Default swing detection configuration. */
export const DEFAULT_SWING_DETECTION_CONFIG: SwingDetectionConfig = {
  velocityThreshold: 0.12,
  confirmationWindow: 5,
  confirmationHitsRequired: 3,
  cooldownFrames: 5,
  preRollDurationMs: 2000,
  postRollDurationMs: 3000,
  minSwingDurationMs: 500,
  initialTriggerMultiplier: 1.5,
  minUpwardFraction: 0.3,
};

/** Initial counters for the swing detection state machine. */
export const INITIAL_SWING_COUNTERS: SwingCounters = {
  recentHits: [],
  cooldownCount: 0,
  swingStartTimestamp: 0,
};

const MIN_JOINT_CONFIDENCE = 0.3;

/**
 * Computes a stable torso anchor point from shoulder or hip joints.
 * Used to subtract camera motion from wrist displacement.
 *
 * Priority: midpoint of both shoulders > single shoulder > midpoint of both hips > null.
 *
 * @param pose - The pose frame to extract the torso anchor from
 * @returns A 2D point in normalized coordinates, or null if no usable anchor
 */
export const computeTorsoAnchor = (pose: PoseFrame): Point2D | null => {
  const ls = pose.joints.leftShoulder;
  const rs = pose.joints.rightShoulder;
  const leftShoulderValid = ls.confidence >= MIN_JOINT_CONFIDENCE;
  const rightShoulderValid = rs.confidence >= MIN_JOINT_CONFIDENCE;

  if (leftShoulderValid && rightShoulderValid) {
    return { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  }
  if (leftShoulderValid) return { x: ls.x, y: ls.y };
  if (rightShoulderValid) return { x: rs.x, y: rs.y };

  const lh = pose.joints.leftHip;
  const rh = pose.joints.rightHip;
  const leftHipValid = lh.confidence >= MIN_JOINT_CONFIDENCE;
  const rightHipValid = rh.confidence >= MIN_JOINT_CONFIDENCE;

  if (leftHipValid && rightHipValid) {
    return { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  }

  return null;
};

/**
 * Computes body-relative wrist velocity and upward motion fraction between two
 * consecutive pose frames. Wrist positions are measured relative to a torso
 * anchor (shoulder midpoint), so camera panning cancels out.
 *
 * Returns `null` when wrist or anchor data is unavailable (confidence too low).
 * Callers should treat null as "skip this frame" rather than "below threshold".
 *
 * @param prevPose - The previous pose frame
 * @param currentPose - The current pose frame
 * @returns Wrist motion result, or null if wrists/anchor not trackable
 */
export const computeBodyRelativeWristVelocity = (
  prevPose: PoseFrame,
  currentPose: PoseFrame,
): WristMotionResult | null => {
  const timeDeltaMs = currentPose.timestamp - prevPose.timestamp;
  if (timeDeltaMs <= 0) return null;

  const prevAnchor = computeTorsoAnchor(prevPose);
  const currAnchor = computeTorsoAnchor(currentPose);
  if (!prevAnchor || !currAnchor) return null;

  const prevLeft = prevPose.joints.leftWrist;
  const prevRight = prevPose.joints.rightWrist;
  const currLeft = currentPose.joints.leftWrist;
  const currRight = currentPose.joints.rightWrist;

  const prevLeftValid = prevLeft.confidence >= MIN_JOINT_CONFIDENCE;
  const prevRightValid = prevRight.confidence >= MIN_JOINT_CONFIDENCE;
  const currLeftValid = currLeft.confidence >= MIN_JOINT_CONFIDENCE;
  const currRightValid = currRight.confidence >= MIN_JOINT_CONFIDENCE;

  let totalDx = 0;
  let totalDy = 0;
  let totalMagnitude = 0;
  let count = 0;

  if (prevLeftValid && currLeftValid) {
    const relPrevX = prevLeft.x - prevAnchor.x;
    const relPrevY = prevLeft.y - prevAnchor.y;
    const relCurrX = currLeft.x - currAnchor.x;
    const relCurrY = currLeft.y - currAnchor.y;
    const dx = relCurrX - relPrevX;
    const dy = relCurrY - relPrevY;
    totalDx += dx;
    totalDy += dy;
    totalMagnitude += Math.sqrt(dx * dx + dy * dy);
    count++;
  }

  if (prevRightValid && currRightValid) {
    const relPrevX = prevRight.x - prevAnchor.x;
    const relPrevY = prevRight.y - prevAnchor.y;
    const relCurrX = currRight.x - currAnchor.x;
    const relCurrY = currRight.y - currAnchor.y;
    const dx = relCurrX - relPrevX;
    const dy = relCurrY - relPrevY;
    totalDx += dx;
    totalDy += dy;
    totalMagnitude += Math.sqrt(dx * dx + dy * dy);
    count++;
  }

  if (count === 0) return null;

  const avgDy = totalDy / count;
  const avgMagnitude = totalMagnitude / count;
  const timeDeltaSec = timeDeltaMs / 1000;
  const velocity = avgMagnitude / timeDeltaSec;

  // Upward fraction: how much of the displacement is upward (negative Y).
  // When avgDy is negative (upward), fraction is positive. Otherwise 0.
  const upwardFraction = avgMagnitude > 0
    ? Math.max(0, -avgDy) / avgMagnitude
    : 0;

  return { velocity, upwardFraction };
};

/** Result of a single state machine transition. */
export type SwingStateTransition = {
  state: SwingDetectionState;
  event: SwingEvent | null;
  counters: SwingCounters;
};

/**
 * Pure state machine for swing auto-detection.
 * Given the current state, wrist motion result, and config, returns the next
 * state, any event to emit, and updated counters.
 *
 * State flow: idle → armed → detecting → recording → cooldown → armed
 *
 * @param state - Current detection state
 * @param motion - Current wrist motion result, or null if wrists not trackable
 * @param timestamp - Current frame timestamp in ms
 * @param config - Detection configuration
 * @param counters - Current frame counters
 * @returns Next state, optional event, and updated counters
 */
export const nextSwingState = (
  state: SwingDetectionState,
  motion: WristMotionResult | null,
  timestamp: number,
  config: SwingDetectionConfig,
  counters: SwingCounters,
): SwingStateTransition => {
  // Null motion = wrists not trackable. Preserve current state and counters.
  if (motion === null) {
    return { state, event: null, counters };
  }

  switch (state) {
    case 'idle':
      return { state: 'idle', event: null, counters };

    case 'armed': {
      const initialThreshold = config.velocityThreshold * config.initialTriggerMultiplier;
      const meetsVelocity = motion.velocity >= initialThreshold;
      const meetsDirection = motion.upwardFraction >= config.minUpwardFraction;

      if (meetsVelocity && meetsDirection) {
        return {
          state: 'detecting',
          event: null,
          counters: {
            ...counters,
            recentHits: [true],
            cooldownCount: 0,
          },
        };
      }
      return { state: 'armed', event: null, counters };
    }

    case 'detecting': {
      const meetsVelocity = motion.velocity >= config.velocityThreshold;
      const meetsDirection = motion.upwardFraction >= config.minUpwardFraction;
      const isHit = meetsVelocity && meetsDirection;

      // Sliding window: keep last N results
      const newHits = [...counters.recentHits, isHit].slice(-config.confirmationWindow);
      const hitCount = newHits.filter(Boolean).length;

      if (hitCount >= config.confirmationHitsRequired) {
        return {
          state: 'recording',
          event: { type: 'swingStarted', timestamp },
          counters: {
            recentHits: [],
            cooldownCount: 0,
            swingStartTimestamp: timestamp,
          },
        };
      }

      // If window is full and too few hits, cancel back to armed
      if (newHits.length >= config.confirmationWindow && hitCount < 2) {
        return {
          state: 'armed',
          event: null,
          counters: { ...INITIAL_SWING_COUNTERS },
        };
      }

      return {
        state: 'detecting',
        event: null,
        counters: { ...counters, recentHits: newHits },
      };
    }

    case 'recording': {
      // During recording, only check velocity (no direction gate)
      const aboveThreshold = motion.velocity >= config.velocityThreshold;

      if (!aboveThreshold) {
        const newCooldown = counters.cooldownCount + 1;
        if (newCooldown >= config.cooldownFrames) {
          const durationMs = timestamp - counters.swingStartTimestamp;
          if (durationMs < config.minSwingDurationMs) {
            return {
              state: 'armed',
              event: { type: 'swingCancelled', reason: 'too_short' },
              counters: { ...INITIAL_SWING_COUNTERS },
            };
          }
          return {
            state: 'cooldown',
            event: { type: 'swingEnded', timestamp, durationMs },
            counters: { ...INITIAL_SWING_COUNTERS },
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
      return {
        state: 'armed',
        event: null,
        counters: { ...INITIAL_SWING_COUNTERS },
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
