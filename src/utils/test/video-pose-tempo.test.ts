import { describe, it, expect } from 'vitest';
import { calculateTempoFromPoseFrames, computeEmaAlpha } from '../video-pose-tempo';
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

  it('skips invalid frames and averages baseline from valid ones', () => {
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

  it('rejects noise during address that would false-trigger takeaway', () => {
    // Simulate 240fps with ±0.02 noise during a 700ms address period,
    // then a real swing. Without smoothing, the 0.015 takeaway threshold
    // would trigger almost immediately on noise.
    const fps = 240;
    const frameDuration = 1000 / fps;
    const frames: PoseFrame[] = [];
    const baselineLeft = 0.55;
    const baselineRight = 0.45;

    // 700ms of noisy address
    for (let t = 0; t < 700; t += frameDuration) {
      const noise = (Math.sin(t * 0.1) * 0.02); // Oscillating noise ±0.02
      frames.push(makePoseFrame(
        Math.round(t / frameDuration),
        t,
        baselineLeft + noise * 0.5,
        baselineRight - noise * 0.5,
      ));
    }

    // Then a real swing: 700ms backswing, 250ms downswing
    const takeawayMs = 700;
    const peakMs = 1400;
    const impactMs = 1650;
    const followMs = 1800;
    const endMs = 2200;

    for (let t = takeawayMs; t <= endMs; t += frameDuration) {
      let leftX = baselineLeft;
      let rightX = baselineRight;

      if (t < peakMs) {
        const progress = (t - takeawayMs) / (peakMs - takeawayMs);
        const extraDiff = 0.12 * progress;
        leftX = baselineLeft + extraDiff * 0.5;
        rightX = baselineRight - extraDiff * 0.5;
      } else if (t < impactMs) {
        const progress = (t - peakMs) / (impactMs - peakMs);
        const extraDiff = 0.12 * (1 - progress);
        leftX = baselineLeft + extraDiff * 0.5;
        rightX = baselineRight - extraDiff * 0.5;
      } else if (t < followMs) {
        const progress = (t - impactMs) / (followMs - impactMs);
        leftX = baselineLeft - 0.05 * progress;
        rightX = baselineRight + 0.05 * progress;
      } else {
        leftX = baselineLeft - 0.05;
        rightX = baselineRight + 0.05;
      }

      frames.push(makePoseFrame(Math.round(t / frameDuration), t, leftX, rightX));
    }

    const result = calculateTempoFromPoseFrames(frames, fps);
    expect(result).not.toBeNull();
    // Takeaway should NOT be at 0ms — noise should be smoothed out.
    // It should be detected near the actual takeaway (~700ms), allowing
    // some lag from EMA smoothing.
    expect(result!.takeawayTimestampMs).toBeGreaterThan(500);
    // Backswing duration should be roughly 700ms, not 1400ms
    expect(result!.backswingDurationMs).toBeGreaterThan(400);
    expect(result!.backswingDurationMs).toBeLessThan(1000);
  });
});

describe('computeEmaAlpha', () => {
  it('returns higher alpha (less smoothing) for low fps', () => {
    const alpha30 = computeEmaAlpha(30);
    const alpha240 = computeEmaAlpha(240);
    expect(alpha30).toBeGreaterThan(alpha240);
    // At 30fps, alpha should be relatively high (minimal smoothing)
    expect(alpha30).toBeGreaterThan(0.5);
    // At 240fps, alpha should be low (significant smoothing)
    expect(alpha240).toBeLessThan(0.15);
  });

  it('never returns alpha greater than 1', () => {
    expect(computeEmaAlpha(1)).toBeLessThanOrEqual(1);
    expect(computeEmaAlpha(10)).toBeLessThanOrEqual(1);
  });
});
