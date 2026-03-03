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
  it('creates accumulator with all zeros', () => {
    const acc = createAngleAccumulator();
    expect(acc.dtlCount).toBe(0);
    expect(acc.faceOnCount).toBe(0);
    expect(acc.totalFrames).toBe(0);
  });
});

// ============================================
// updateAngleAccumulator
// ============================================

describe('updateAngleAccumulator', () => {
  it('increments dtlCount for DTL signals', () => {
    const acc = createAngleAccumulator();
    const updated = updateAngleAccumulator(acc, { angle: 'dtl', confidence: 0.9 });
    expect(updated.dtlCount).toBe(1);
    expect(updated.faceOnCount).toBe(0);
    expect(updated.totalFrames).toBe(1);
  });

  it('increments faceOnCount for face-on signals', () => {
    const acc = createAngleAccumulator();
    const updated = updateAngleAccumulator(acc, { angle: 'face-on', confidence: 0.9 });
    expect(updated.dtlCount).toBe(0);
    expect(updated.faceOnCount).toBe(1);
    expect(updated.totalFrames).toBe(1);
  });

  it('ignores null signals (no change)', () => {
    const acc = createAngleAccumulator();
    const updated = updateAngleAccumulator(acc, null);
    expect(updated).toBe(acc); // Same reference
  });

  it('does not mutate the original accumulator', () => {
    const acc = createAngleAccumulator();
    const updated = updateAngleAccumulator(acc, { angle: 'dtl', confidence: 0.9 });
    expect(acc.dtlCount).toBe(0);
    expect(updated.dtlCount).toBe(1);
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

  it('returns null at just below 70% agreement', () => {
    let acc = createAngleAccumulator();
    // 69 DTL + 31 face-on = 69% DTL (below 70%)
    for (let i = 0; i < 69; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'dtl', confidence: 0.9 });
    }
    for (let i = 0; i < 31; i++) {
      acc = updateAngleAccumulator(acc, { angle: 'face-on', confidence: 0.9 });
    }
    expect(getDetectedAngle(acc)).toBeNull();
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
    // Only 8 valid frames counted, all DTL
    expect(acc.totalFrames).toBe(8);
    expect(getDetectedAngle(acc)).toBe('dtl');
  });
});
