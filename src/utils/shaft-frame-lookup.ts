import type { ShaftFrameResult } from '../../modules/swing-analysis/src/types';

/** Maximum time distance (ms) to consider a shaft frame a valid match. */
const DEFAULT_TOLERANCE_MS = 50;

/**
 * Finds the nearest shaft frame result for a given playback timestamp
 * using binary search. Returns null if no frame is within tolerance.
 *
 * @param frames - Shaft detection results sorted by timestampMs (ascending).
 * @param timestampMs - Current playback position in milliseconds.
 * @param toleranceMs - Maximum distance in ms to consider a match.
 */
export const findNearestShaftFrame = (
  frames: ShaftFrameResult[],
  timestampMs: number,
  toleranceMs: number = DEFAULT_TOLERANCE_MS,
): ShaftFrameResult | null => {
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
