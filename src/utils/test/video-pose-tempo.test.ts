import { describe, it, expect } from 'vitest';
import { calculateTempoFromPoseFrames } from '../video-pose-tempo';
import type { PoseFrame } from '../../../modules/video-pose-analysis/src/types';

// ============================================
// HELPERS
// ============================================

/** Joint indices matching shoulder-rotation.ts */
const LEFT_SHOULDER_INDEX = 2;
const RIGHT_SHOULDER_INDEX = 3;
const STRIDE = 3;

/**
 * Creates a pose frame with specified shoulder X positions.
 * All other joints get default values with high confidence.
 */
const makePoseFrame = (
  frameIndex: number,
  timestampMs: number,
  leftShoulderX: number,
  rightShoulderX: number,
): PoseFrame => {
  const landmarks = new Array(72).fill(0);
  // Set all confidences to 0.9
  for (let i = 0; i < 24; i++) {
    landmarks[i * STRIDE + 2] = 0.9;
  }
  // Set shoulder X positions
  landmarks[LEFT_SHOULDER_INDEX * STRIDE] = leftShoulderX;
  landmarks[RIGHT_SHOULDER_INDEX * STRIDE] = rightShoulderX;
  return { frameIndex, timestampMs, landmarks };
};

/**
 * Generates a synthetic swing sequence at given fps.
 *
 * Timeline:
 * - Address (baseline): leftX=0.55, rightX=0.45, diff=0.10
 * - Takeaway starts at takeawayMs (diff grows slightly)
 * - Backswing peaks at peakMs (diff reaches peak value)
 * - Impact at impactMs (diff returns near baseline)
 * - Follow-through at followMs (diff crosses to opposite side)
 */
const generateSwingSequence = ({
  fps = 240,
  addressMs = 0,
  takeawayMs = 200,
  peakMs = 1000,
  impactMs = 1300,
  followMs = 1500,
  endMs = 2000,
}: {
  fps?: number;
  addressMs?: number;
  takeawayMs?: number;
  peakMs?: number;
  impactMs?: number;
  followMs?: number;
  endMs?: number;
} = {}): PoseFrame[] => {
  const frames: PoseFrame[] = [];
  const frameDuration = 1000 / fps;

  // Baseline shoulder diff
  const baselineLeft = 0.55;
  const baselineRight = 0.45;
  for (let t = addressMs; t <= endMs; t += frameDuration) {
    const frameIndex = Math.round(t / frameDuration);
    let leftX = baselineLeft;
    let rightX = baselineRight;

    if (t < takeawayMs) {
      // Address phase - baseline
    } else if (t < peakMs) {
      // Backswing - shoulders rotate, diff increases
      const progress = (t - takeawayMs) / (peakMs - takeawayMs);
      const extraDiff = 0.12 * progress; // Peak extra diff of 0.12
      leftX = baselineLeft + extraDiff * 0.5;
      rightX = baselineRight - extraDiff * 0.5;
    } else if (t < impactMs) {
      // Downswing - diff returns toward baseline
      const progress = (t - peakMs) / (impactMs - peakMs);
      const extraDiff = 0.12 * (1 - progress);
      leftX = baselineLeft + extraDiff * 0.5;
      rightX = baselineRight - extraDiff * 0.5;
    } else if (t < followMs) {
      // Impact to follow-through - diff crosses baseline to opposite
      const progress = (t - impactMs) / (followMs - impactMs);
      const oppositeDiff = -0.10 * progress; // Goes negative
      leftX = baselineLeft + (oppositeDiff * 0.5);
      rightX = baselineRight - (oppositeDiff * 0.5);
    } else {
      // Follow-through hold
      leftX = baselineLeft - 0.05;
      rightX = baselineRight + 0.05;
    }

    frames.push(makePoseFrame(frameIndex, t, leftX, rightX));
  }

  return frames;
};

// ============================================
// TESTS
// ============================================

describe('calculateTempoFromPoseFrames', () => {
  it('returns null for fewer than 10 frames', () => {
    const frames = Array.from({ length: 5 }, (_, i) =>
      makePoseFrame(i, i * 33, 0.55, 0.45),
    );
    expect(calculateTempoFromPoseFrames(frames, 30)).toBeNull();
  });

  it('returns null when no shoulders are detected (all zero confidence)', () => {
    const frames = Array.from({ length: 50 }, (_, i) => ({
      frameIndex: i,
      timestampMs: i * 33,
      landmarks: new Array(72).fill(0), // All zeros = no confidence
    }));
    expect(calculateTempoFromPoseFrames(frames, 30)).toBeNull();
  });

  it('returns null for static pose (no rotation)', () => {
    // Same shoulder position for all frames — no swing
    const frames = Array.from({ length: 100 }, (_, i) =>
      makePoseFrame(i, i * 4.17, 0.55, 0.45),
    );
    expect(calculateTempoFromPoseFrames(frames, 240)).toBeNull();
  });

  it('calculates tempo from a synthetic 3:1 swing at 240fps', () => {
    const frames = generateSwingSequence({
      fps: 240,
      addressMs: 0,
      takeawayMs: 200,
      peakMs: 1100,  // 900ms backswing
      impactMs: 1400, // 300ms downswing → 3:1
      followMs: 1600,
      endMs: 2000,
    });

    const result = calculateTempoFromPoseFrames(frames, 240);
    expect(result).not.toBeNull();
    // Tempo should be approximately 3:1
    expect(result!.tempoRatio).toBeGreaterThan(2.0);
    expect(result!.tempoRatio).toBeLessThan(4.5);
    expect(result!.backswingDurationMs).toBeGreaterThan(0);
    expect(result!.downswingDurationMs).toBeGreaterThan(0);
  });

  it('calculates tempo from a synthetic 2:1 swing at 240fps', () => {
    const frames = generateSwingSequence({
      fps: 240,
      addressMs: 0,
      takeawayMs: 200,
      peakMs: 800,   // 600ms backswing
      impactMs: 1100, // 300ms downswing → 2:1
      followMs: 1300,
      endMs: 1800,
    });

    const result = calculateTempoFromPoseFrames(frames, 240);
    expect(result).not.toBeNull();
    expect(result!.tempoRatio).toBeGreaterThan(1.5);
    expect(result!.tempoRatio).toBeLessThan(3.0);
  });

  it('works at 30fps (lower resolution)', () => {
    const frames = generateSwingSequence({
      fps: 30,
      addressMs: 0,
      takeawayMs: 200,
      peakMs: 1100,
      impactMs: 1400,
      followMs: 1600,
      endMs: 2000,
    });

    const result = calculateTempoFromPoseFrames(frames, 30);
    // At 30fps there are fewer frames but should still detect
    expect(result).not.toBeNull();
    expect(result!.tempoRatio).toBeGreaterThan(1.0);
  });

  it('uses first valid frame as baseline', () => {
    // First 5 frames have zero confidence, then valid frames
    const invalidFrames = Array.from({ length: 5 }, (_, i) => ({
      frameIndex: i,
      timestampMs: i * 4.17,
      landmarks: new Array(72).fill(0),
    }));

    const validFrames = generateSwingSequence({
      fps: 240,
      addressMs: 20,
      takeawayMs: 200,
      peakMs: 1100,
      impactMs: 1400,
      followMs: 1600,
      endMs: 2000,
    });

    const frames = [...invalidFrames, ...validFrames];
    const result = calculateTempoFromPoseFrames(frames, 240);
    // Should still work — skips invalid frames for baseline
    expect(result).not.toBeNull();
  });
});
