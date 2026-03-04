import { describe, it, expect } from 'vitest';
import {
  classifyCameraAngle,
  createAngleAccumulator,
  updateAngleAccumulator,
  getDetectedAngle,
  type AngleSignal,
  type AngleAccumulator,
} from '../camera-angle-detection';

// ============================================
// HELPERS
// ============================================

/** Creates a 72-element pose array with all zeros. */
const emptyPose = (): number[] => new Array(72).fill(0);

/**
 * Creates a pose array with specific shoulder values.
 * Joint indices: leftShoulder=2 (offset 6), rightShoulder=3 (offset 9), stride=3.
 */
const poseWithShoulders = (
  leftX: number,
  leftConf: number,
  rightX: number,
  rightConf: number,
): number[] => {
  const pose = emptyPose();
  pose[6] = leftX;
  pose[7] = 0;
  pose[8] = leftConf;
  pose[9] = rightX;
  pose[10] = 0;
  pose[11] = rightConf;
  return pose;
};

/** Feed N identical signals into an accumulator and return the result. */
const feedSignals = (
  count: number,
  signal: AngleSignal,
): AngleAccumulator => {
  let acc = createAngleAccumulator();
  for (let i = 0; i < count; i++) {
    acc = updateAngleAccumulator(acc, signal);
  }
  return acc;
};

// ============================================
// classifyCameraAngle
// ============================================

describe('classifyCameraAngle', () => {
  it('returns DTL with high confidence when shoulders overlap (gap ~0.02)', () => {
    const pose = poseWithShoulders(0.50, 0.9, 0.52, 0.9);
    const result = classifyCameraAngle(pose);
    expect(result).not.toBeNull();
    expect(result!.angle).toBe('dtl');
    expect(result!.confidence).toBeGreaterThan(0.7);
  });

  it('returns DTL with max confidence when gap is 0', () => {
    const pose = poseWithShoulders(0.50, 0.9, 0.50, 0.9);
    const result = classifyCameraAngle(pose);
    expect(result).not.toBeNull();
    expect(result!.angle).toBe('dtl');
    expect(result!.confidence).toBe(1);
  });

  it('returns face-on with high confidence when shoulders are spread wide (gap ~0.25)', () => {
    const pose = poseWithShoulders(0.35, 0.9, 0.60, 0.9);
    const result = classifyCameraAngle(pose);
    expect(result).not.toBeNull();
    expect(result!.angle).toBe('face-on');
    expect(result!.confidence).toBeGreaterThan(0.3);
  });

  it('returns face-on with high confidence for very large gap (0.30)', () => {
    const pose = poseWithShoulders(0.30, 0.9, 0.60, 0.9);
    const result = classifyCameraAngle(pose);
    expect(result).not.toBeNull();
    expect(result!.angle).toBe('face-on');
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('returns DTL with low confidence in ambiguous zone below midpoint (gap ~0.10)', () => {
    const pose = poseWithShoulders(0.45, 0.9, 0.55, 0.9);
    const result = classifyCameraAngle(pose);
    expect(result).not.toBeNull();
    expect(result!.angle).toBe('dtl');
    expect(result!.confidence).toBe(0.3);
  });

  it('returns face-on with low confidence in ambiguous zone above midpoint (gap ~0.15)', () => {
    const pose = poseWithShoulders(0.40, 0.9, 0.55, 0.9);
    const result = classifyCameraAngle(pose);
    expect(result).not.toBeNull();
    expect(result!.angle).toBe('face-on');
    expect(result!.confidence).toBe(0.3);
  });

  it('returns null when left shoulder confidence is below threshold', () => {
    const pose = poseWithShoulders(0.50, 0.1, 0.52, 0.9);
    expect(classifyCameraAngle(pose)).toBeNull();
  });

  it('returns null when right shoulder confidence is below threshold', () => {
    const pose = poseWithShoulders(0.50, 0.9, 0.52, 0.1);
    expect(classifyCameraAngle(pose)).toBeNull();
  });

  it('returns null when both shoulders have low confidence', () => {
    const pose = poseWithShoulders(0.50, 0.0, 0.52, 0.0);
    expect(classifyCameraAngle(pose)).toBeNull();
  });

  it('respects custom minConfidence threshold', () => {
    const pose = poseWithShoulders(0.50, 0.5, 0.52, 0.5);
    // Below custom threshold of 0.6
    expect(classifyCameraAngle(pose, 0.6)).toBeNull();
    // Above default threshold of 0.3
    expect(classifyCameraAngle(pose)).not.toBeNull();
  });

  it('classifies gap just below DTL threshold as DTL with low confidence', () => {
    // gap = 0.079 — just inside DTL zone
    const pose = poseWithShoulders(0.50, 0.9, 0.579, 0.9);
    const result = classifyCameraAngle(pose);
    expect(result).not.toBeNull();
    expect(result!.angle).toBe('dtl');
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThan(0.1);
  });

  it('classifies gap just above face-on threshold as face-on with low confidence', () => {
    // gap = 0.19 — just inside face-on zone
    const pose = poseWithShoulders(0.50, 0.9, 0.69, 0.9);
    const result = classifyCameraAngle(pose);
    expect(result).not.toBeNull();
    expect(result!.angle).toBe('face-on');
    expect(result!.confidence).toBeGreaterThan(0);
  });

  it('works regardless of which shoulder has larger X', () => {
    const poseLeftBigger = poseWithShoulders(0.60, 0.9, 0.35, 0.9);
    const poseRightBigger = poseWithShoulders(0.35, 0.9, 0.60, 0.9);
    const resultLeft = classifyCameraAngle(poseLeftBigger);
    const resultRight = classifyCameraAngle(poseRightBigger);
    expect(resultLeft!.angle).toBe(resultRight!.angle);
    expect(resultLeft!.confidence).toBeCloseTo(resultRight!.confidence);
  });
});

// ============================================
// createAngleAccumulator
// ============================================

describe('createAngleAccumulator', () => {
  it('creates accumulator with empty sliding window', () => {
    const acc = createAngleAccumulator();
    expect(acc.recentAngles).toEqual([]);
  });
});

// ============================================
// updateAngleAccumulator
// ============================================

describe('updateAngleAccumulator', () => {
  it('adds DTL signal to the window', () => {
    const acc = createAngleAccumulator();
    const updated = updateAngleAccumulator(acc, { angle: 'dtl', confidence: 0.9 });
    expect(updated.recentAngles).toEqual(['dtl']);
  });

  it('adds face-on signal to the window', () => {
    const acc = createAngleAccumulator();
    const updated = updateAngleAccumulator(acc, { angle: 'face-on', confidence: 0.9 });
    expect(updated.recentAngles).toEqual(['face-on']);
  });

  it('ignores null signals (no change)', () => {
    const acc = createAngleAccumulator();
    const updated = updateAngleAccumulator(acc, null);
    expect(updated).toBe(acc); // Same reference
  });

  it('does not mutate the original accumulator', () => {
    const acc = createAngleAccumulator();
    const updated = updateAngleAccumulator(acc, { angle: 'dtl', confidence: 0.9 });
    expect(acc.recentAngles).toEqual([]);
    expect(updated.recentAngles).toEqual(['dtl']);
  });

  it('caps window at 12 entries, sliding out oldest', () => {
    // Fill with 12 DTL, then add 1 face-on — oldest DTL should drop
    let acc = feedSignals(12, { angle: 'dtl', confidence: 0.9 });
    expect(acc.recentAngles).toHaveLength(12);

    acc = updateAngleAccumulator(acc, { angle: 'face-on', confidence: 0.9 });
    expect(acc.recentAngles).toHaveLength(12);
    expect(acc.recentAngles[0]).toBe('dtl'); // second-oldest DTL is now first
    expect(acc.recentAngles[11]).toBe('face-on'); // new entry at end
  });
});

// ============================================
// getDetectedAngle
// ============================================

describe('getDetectedAngle', () => {
  it('returns null when not enough frames accumulated', () => {
    const acc = feedSignals(5, { angle: 'dtl', confidence: 0.9 });
    expect(getDetectedAngle(acc)).toBeNull(); // default minFrames=8
  });

  it('returns DTL when majority of frames agree on DTL', () => {
    const acc = feedSignals(10, { angle: 'dtl', confidence: 0.9 });
    expect(getDetectedAngle(acc)).toBe('dtl');
  });

  it('returns face-on when majority of frames agree on face-on', () => {
    const acc = feedSignals(10, { angle: 'face-on', confidence: 0.9 });
    expect(getDetectedAngle(acc)).toBe('face-on');
  });

  it('returns null when frames are split and no angle meets agreement threshold', () => {
    let acc = createAngleAccumulator();
    for (let i = 0; i < 5; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'dtl', confidence: 0.9 });
    }
    for (let i = 0; i < 5; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'face-on', confidence: 0.9 });
    }
    expect(getDetectedAngle(acc)).toBeNull();
  });

  it('detects DTL at exactly 70% agreement (default threshold)', () => {
    let acc = createAngleAccumulator();
    // 7 DTL + 3 face-on = 70% DTL
    for (let i = 0; i < 7; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'dtl', confidence: 0.9 });
    }
    for (let i = 0; i < 3; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'face-on', confidence: 0.9 });
    }
    expect(getDetectedAngle(acc)).toBe('dtl');
  });

  it('respects custom minFrames', () => {
    const acc = feedSignals(3, { angle: 'dtl', confidence: 0.9 });
    expect(getDetectedAngle(acc, 5)).toBeNull();
    expect(getDetectedAngle(acc, 3)).toBe('dtl');
  });

  it('respects custom minAgreement', () => {
    let acc = createAngleAccumulator();
    // 6 DTL + 4 face-on = 60% DTL
    for (let i = 0; i < 6; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'dtl', confidence: 0.9 });
    }
    for (let i = 0; i < 4; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'face-on', confidence: 0.9 });
    }
    // 60% doesn't meet default 70%
    expect(getDetectedAngle(acc)).toBeNull();
    // But does meet custom 50%
    expect(getDetectedAngle(acc, 8, 0.5)).toBe('dtl');
  });
});

// ============================================
// Sliding window behavior
// ============================================

describe('sliding window transitions', () => {
  it('switches from face-on to DTL as new frames slide in', () => {
    // Start with face-on consensus
    let acc = feedSignals(10, { angle: 'face-on', confidence: 0.9 });
    expect(getDetectedAngle(acc)).toBe('face-on');

    // Feed DTL frames — once enough face-on frames slide out, should switch
    for (let i = 0; i < 12; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'dtl', confidence: 0.9 });
    }
    expect(getDetectedAngle(acc)).toBe('dtl');
  });

  it('switches from DTL to face-on as new frames slide in', () => {
    let acc = feedSignals(10, { angle: 'dtl', confidence: 0.9 });
    expect(getDetectedAngle(acc)).toBe('dtl');

    for (let i = 0; i < 12; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'face-on', confidence: 0.9 });
    }
    expect(getDetectedAngle(acc)).toBe('face-on');
  });

  it('returns null during transition when window is mixed', () => {
    let acc = feedSignals(12, { angle: 'face-on', confidence: 0.9 });
    expect(getDetectedAngle(acc)).toBe('face-on');

    // Add 5 DTL frames — window is now 7 FO + 5 DTL = 58% FO (below 70%)
    for (let i = 0; i < 5; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'dtl', confidence: 0.9 });
    }
    expect(getDetectedAngle(acc)).toBeNull();
  });
});

// ============================================
// End-to-end: classifyCameraAngle → accumulator → getDetectedAngle
// ============================================

describe('end-to-end detection flow', () => {
  it('detects DTL from a sequence of side-view poses', () => {
    let acc = createAngleAccumulator();
    // Simulate 10 frames from DTL angle — shoulders nearly overlapping
    const dtlGaps = [0.02, 0.03, 0.01, 0.04, 0.02, 0.03, 0.05, 0.01, 0.03, 0.02];
    for (const gap of dtlGaps) {
      const pose = poseWithShoulders(0.50, 0.9, 0.50 + gap, 0.9);
      const signal = classifyCameraAngle(pose);
      acc = updateAngleAccumulator(acc, signal);
    }
    expect(getDetectedAngle(acc)).toBe('dtl');
  });

  it('detects face-on from a sequence of front-view poses', () => {
    let acc = createAngleAccumulator();
    // Simulate 10 frames from face-on angle — shoulders spread wide
    const faceOnGaps = [0.22, 0.25, 0.20, 0.23, 0.24, 0.21, 0.26, 0.22, 0.25, 0.23];
    for (const gap of faceOnGaps) {
      const pose = poseWithShoulders(0.50 - gap / 2, 0.9, 0.50 + gap / 2, 0.9);
      const signal = classifyCameraAngle(pose);
      acc = updateAngleAccumulator(acc, signal);
    }
    expect(getDetectedAngle(acc)).toBe('face-on');
  });

  it('handles mixed frames with low-confidence nulls', () => {
    let acc = createAngleAccumulator();
    // 8 good DTL frames + 4 null frames (low confidence) = should still detect DTL
    for (let i = 0; i < 8; i++) {
      const pose = poseWithShoulders(0.50, 0.9, 0.52, 0.9);
      acc = updateAngleAccumulator(acc, classifyCameraAngle(pose));
    }
    for (let i = 0; i < 4; i++) {
      const pose = poseWithShoulders(0.50, 0.1, 0.52, 0.1); // low conf → null
      acc = updateAngleAccumulator(acc, classifyCameraAngle(pose));
    }
    // Only 8 valid frames in window (nulls ignored)
    expect(acc.recentAngles).toHaveLength(8);
    expect(getDetectedAngle(acc)).toBe('dtl');
  });

  it('detects face-on then switches to DTL as user repositions', () => {
    let acc = createAngleAccumulator();

    // User faces camera (face-on) for 10 frames
    for (let i = 0; i < 10; i++) {
      const pose = poseWithShoulders(0.35, 0.9, 0.60, 0.9);
      acc = updateAngleAccumulator(acc, classifyCameraAngle(pose));
    }
    expect(getDetectedAngle(acc)).toBe('face-on');

    // User walks to DTL position — 12 frames of side view
    for (let i = 0; i < 12; i++) {
      const pose = poseWithShoulders(0.50, 0.9, 0.52, 0.9);
      acc = updateAngleAccumulator(acc, classifyCameraAngle(pose));
    }
    expect(getDetectedAngle(acc)).toBe('dtl');
  });
});
