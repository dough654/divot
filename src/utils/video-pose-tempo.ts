/**
 * Calculates swing tempo from a sequence of per-frame pose landmarks.
 *
 * Runs the same shoulder rotation state machine used for live detection,
 * but applies EMA smoothing to the shoulder diffs first. High-fps video
 * (120–240fps) has significant frame-to-frame jitter that would trigger
 * the live thresholds prematurely without smoothing.
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
 * Duration (ms) of frames to average for a stable baseline.
 * The golfer should be at address during this window.
 */
const BASELINE_WINDOW_MS = 300;

/**
 * Target EMA smoothing window in milliseconds.
 * Controls how aggressively frame-to-frame jitter is filtered.
 * Higher fps → more frames in the window → stronger smoothing.
 * At 240fps this yields alpha ≈ 0.10 (~80ms lag for step inputs).
 * At 30fps this yields alpha ≈ 0.67 (minimal smoothing).
 */
const SMOOTHING_WINDOW_MS = 80;

/**
 * Computes the EMA alpha coefficient for a given fps.
 * Uses the standard EMA formula: alpha = 2 / (N + 1)
 * where N is the number of frames in the smoothing window.
 */
export const computeEmaAlpha = (fps: number): number => {
  const windowFrames = Math.max(1, Math.round(fps * SMOOTHING_WINDOW_MS / 1000));
  return 2 / (windowFrames + 1);
};

/**
 * Calculates swing tempo from a sequence of video pose frames.
 *
 * 1. Computes raw shoulder diffs for all frames.
 * 2. Averages the first ~300ms of valid diffs for a stable baseline.
 * 3. Applies EMA smoothing (fps-adaptive) to eliminate jitter.
 * 4. Runs the rotation tracking state machine on smoothed data.
 *
 * @param frames - Pose frames from video analysis (sorted by frameIndex)
 * @param fps - Video frame rate (used to scale smoothing)
 * @returns Swing tempo data, or null if no swing detected
 */
export const calculateTempoFromPoseFrames = (
  frames: PoseFrame[],
  fps: number,
): SwingTempo | null => {
  if (frames.length < 10) return null;

  // Step 1: compute raw shoulder diffs
  const rawDiffs: { diff: number; valid: boolean; timestampMs: number }[] = [];
  for (const frame of frames) {
    const sample = computeShoulderDiff(frame.landmarks);
    rawDiffs.push({ diff: sample.diff, valid: sample.valid, timestampMs: frame.timestampMs });
  }

  // Step 2: stable baseline from first BASELINE_WINDOW_MS of valid frames
  const firstTimestamp = rawDiffs[0].timestampMs;
  const baselineValues: number[] = [];

  for (const s of rawDiffs) {
    if (s.timestampMs - firstTimestamp > BASELINE_WINDOW_MS) break;
    if (s.valid) baselineValues.push(s.diff);
  }

  if (baselineValues.length === 0) return null;

  const baselineDiff = baselineValues.reduce((sum, d) => sum + d, 0) / baselineValues.length;

  // Step 3: EMA smoothing (fps-adaptive)
  const alpha = computeEmaAlpha(fps);
  let smoothed = baselineDiff;

  const smoothedSamples: { diff: number; valid: boolean }[] = [];
  for (const s of rawDiffs) {
    if (s.valid) {
      smoothed = alpha * s.diff + (1 - alpha) * smoothed;
    }
    smoothedSamples.push({ diff: smoothed, valid: s.valid });
  }

  // Step 4: run rotation state machine on smoothed data
  let state = startRotationTracking(baselineDiff);

  for (let i = 0; i < smoothedSamples.length; i++) {
    const result = updateRotationTracking(state, smoothedSamples[i], rawDiffs[i].timestampMs);
    state = result.state;

    if (result.swingConfirmed && state.impactTimestamp !== null) {
      break;
    }
  }

  return calculateSwingTempo(state);
};
