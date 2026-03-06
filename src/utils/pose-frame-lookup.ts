import type { PoseFrame } from '../../modules/video-pose-analysis/src/types';

/** Maximum time distance (ms) to consider a pose frame a valid match. */
const DEFAULT_TOLERANCE_MS = 100;

/**
 * Finds the nearest pose frame for a given playback timestamp
 * using binary search. Returns null if no frame is within tolerance.
 *
 * @param frames - Pose frames sorted by timestampMs (ascending).
 * @param timestampMs - Current playback position in milliseconds.
 * @param toleranceMs - Maximum distance in ms to consider a match.
 */
export const findNearestPoseFrame = (
  frames: PoseFrame[],
  timestampMs: number,
  toleranceMs: number = DEFAULT_TOLERANCE_MS,
): PoseFrame | null => {
  if (frames.length === 0) return null;

  let low = 0;
  let high = frames.length - 1;

  // Binary search for the closest timestamp
  while (low < high) {
    const mid = (low + high) >> 1;
    if (frames[mid].timestampMs < timestampMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  // Check the candidate and its neighbor for the closest match
  let bestIndex = low;
  if (low > 0) {
    const distCurrent = Math.abs(frames[low].timestampMs - timestampMs);
    const distPrev = Math.abs(frames[low - 1].timestampMs - timestampMs);
    if (distPrev < distCurrent) {
      bestIndex = low - 1;
    }
  }

  const distance = Math.abs(frames[bestIndex].timestampMs - timestampMs);
  if (distance > toleranceMs) return null;

  return frames[bestIndex];
};
