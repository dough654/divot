import { JOINT_NAMES, POSE_ARRAY_LENGTH } from './pose-normalization';

/** Maximum number of polls a joint can persist without a high-confidence observation. */
const MAX_STALENESS = 5;

/** Default EMA alpha — weight given to new observation (0 = ignore new, 1 = ignore old). */
const DEFAULT_ALPHA = 0.4;

/** Minimum confidence for a raw joint to be treated as "observed". */
const MIN_CONFIDENCE = 0.3;

/** A smoothed joint with EMA-blended position and staleness tracking. */
export type SmoothedJoint = {
  x: number;
  y: number;
  confidence: number;
  /** Polls since last high-confidence observation. 0 = current frame. */
  staleness: number;
};

/** Map of joint name → smoothed joint data. */
export type SmoothedPose = Map<string, SmoothedJoint>;

/**
 * Applies EMA smoothing to raw pose data, persisting joints that temporarily
 * drop below the confidence threshold with incrementing staleness.
 *
 * Swing detection should continue using raw unsmoothed data — this is purely
 * for visual overlay rendering.
 *
 * @param rawData - 42-element flat pose array from native plugin, or null
 * @param previous - Previous smoothed pose, or null on first frame
 * @param alpha - EMA weight for new data (default 0.4)
 * @returns Smoothed pose map, or null when all joints have expired
 */
export const smoothPoseData = (
  rawData: number[] | null,
  previous: SmoothedPose | null,
  alpha: number = DEFAULT_ALPHA,
): SmoothedPose | null => {
  // No raw data — apply global grace period to previous
  if (!rawData || rawData.length !== POSE_ARRAY_LENGTH) {
    if (!previous) return null;

    const aged = new Map<string, SmoothedJoint>();
    for (const [name, joint] of previous) {
      const newStaleness = joint.staleness + 1;
      if (newStaleness <= MAX_STALENESS) {
        aged.set(name, {
          ...joint,
          staleness: newStaleness,
          confidence: decayConfidence(joint.confidence, newStaleness),
        });
      }
    }
    return aged.size > 0 ? aged : null;
  }

  const result = new Map<string, SmoothedJoint>();

  for (let i = 0; i < JOINT_NAMES.length; i++) {
    const name = JOINT_NAMES[i];
    const offset = i * 3;
    const rawX = rawData[offset];
    const rawY = rawData[offset + 1];
    const rawConfidence = rawData[offset + 2];
    const prev = previous?.get(name);

    if (rawConfidence >= MIN_CONFIDENCE) {
      // Good observation — EMA blend with previous
      if (prev) {
        result.set(name, {
          x: ema(prev.x, rawX, alpha),
          y: ema(prev.y, rawY, alpha),
          confidence: rawConfidence,
          staleness: 0,
        });
      } else {
        // First observation of this joint — use raw directly
        result.set(name, {
          x: rawX,
          y: rawY,
          confidence: rawConfidence,
          staleness: 0,
        });
      }
    } else if (prev && prev.staleness < MAX_STALENESS) {
      // Low-confidence but previous exists — persist with aging
      const newStaleness = prev.staleness + 1;
      result.set(name, {
        x: prev.x,
        y: prev.y,
        confidence: decayConfidence(prev.confidence, newStaleness),
        staleness: newStaleness,
      });
    }
    // Otherwise: drop the joint entirely
  }

  return result.size > 0 ? result : null;
};

/**
 * Computes display opacity for a joint based on its staleness.
 *
 * - staleness 0: 1.0 (fully visible)
 * - staleness 1–5: linear fade from 0.8 → 0.2
 *
 * @param staleness - Number of polls since last high-confidence observation
 * @returns Opacity value between 0.2 and 1.0
 */
export const jointOpacity = (staleness: number): number => {
  if (staleness <= 0) return 1.0;
  if (staleness > MAX_STALENESS) return 0.0;
  // Linear interpolation: staleness 1 → 0.8, staleness 5 → 0.2
  return 0.8 - ((staleness - 1) / (MAX_STALENESS - 1)) * 0.6;
};

/** Exponential moving average blend. */
const ema = (previous: number, current: number, alpha: number): number =>
  previous + alpha * (current - previous);

/** Decay confidence as staleness increases. */
const decayConfidence = (baseConfidence: number, staleness: number): number =>
  baseConfidence * Math.max(0.2, 1 - staleness * 0.15);
