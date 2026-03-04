/**
 * Calculates swing tempo from a sequence of per-frame pose landmarks.
 *
 * Runs the same shoulder rotation state machine used for live detection,
 * but against high-fps video pose data for much better accuracy.
 * A 240fps video gives ~60x more frames than 30fps live detection.
 *
 * Pure function: PoseFrame[] → SwingTempo | null
 */

import type { PoseFrame } from '../../modules/video-pose-analysis/src/types';
import type { SwingTempo } from './swing-tempo';
import {
  computeShoulderDiff,
  startRotationTracking,
  updateRotationTracking,
} from './shoulder-rotation';
import { calculateSwingTempo } from './swing-tempo';

/**
 * Calculates swing tempo from a sequence of video pose frames.
 *
 * Iterates through frames, computes shoulder rotation diffs,
 * runs the rotation tracking state machine, and calculates
 * tempo from the resulting timestamps.
 *
 * @param frames - Pose frames from video analysis (sorted by frameIndex)
 * @param _fps - Video frame rate (reserved for future use)
 * @returns Swing tempo data, or null if no swing detected
 */
export const calculateTempoFromPoseFrames = (
  frames: PoseFrame[],
  _fps: number,
): SwingTempo | null => {
  if (frames.length < 10) return null;

  // Find baseline from first frames with valid shoulder data
  let baselineDiff: number | null = null;

  for (const frame of frames) {
    const sample = computeShoulderDiff(frame.landmarks);
    if (sample.valid) {
      baselineDiff = sample.diff;
      break;
    }
  }

  if (baselineDiff === null) return null;

  let state = startRotationTracking(baselineDiff);

  for (const frame of frames) {
    const sample = computeShoulderDiff(frame.landmarks);
    const result = updateRotationTracking(state, sample, frame.timestampMs);
    state = result.state;

    // Once we've confirmed a full swing and have impact, we're done
    if (result.swingConfirmed && state.impactTimestamp !== null) {
      break;
    }
  }

  return calculateSwingTempo(state);
};
