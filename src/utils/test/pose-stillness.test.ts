import { describe, it, expect } from 'vitest';
import { computePoseDisplacement, isPoseStill } from '../pose-stillness';

/** Helper: create a 72-element pose array with all joints at the same position and confidence. */
const makePose = (x: number, y: number, confidence: number): number[] => {
  const pose: number[] = [];
  for (let i = 0; i < 24; i++) {
    pose.push(x, y, confidence);
  }
  return pose;
};

/**
 * Helper: create a pose with specific joints at given positions.
 * Default joints are at (0.5, 0.5) with confidence 0.9.
 */
const makePoseWithJoints = (
  overrides: Array<{ joint: number; x: number; y: number; confidence?: number }>,
): number[] => {
  const pose = makePose(0.5, 0.5, 0.9);
  for (const { joint, x, y, confidence } of overrides) {
    pose[joint * 3] = x;
    pose[joint * 3 + 1] = y;
    pose[joint * 3 + 2] = confidence ?? 0.9;
  }
  return pose;
};

describe('computePoseDisplacement', () => {
  it('returns zero displacement when both frames are identical', () => {
    const pose = makePose(0.5, 0.5, 0.9);
    const result = computePoseDisplacement(pose, pose);

    expect(result.displacement).toBe(0);
    expect(result.jointCount).toBe(24);
  });

  it('computes correct displacement for uniform movement', () => {
    const poseA = makePose(0.5, 0.5, 0.9);
    const poseB = makePose(0.5, 0.6, 0.9); // all joints moved 0.1 in y

    const result = computePoseDisplacement(poseA, poseB);

    expect(result.displacement).toBeCloseTo(0.1, 5);
    expect(result.jointCount).toBe(24);
  });

  it('computes euclidean distance for diagonal movement', () => {
    const poseA = makePose(0.0, 0.0, 0.9);
    const poseB = makePose(0.03, 0.04, 0.9); // 3-4-5 triangle → distance 0.05

    const result = computePoseDisplacement(poseA, poseB);

    expect(result.displacement).toBeCloseTo(0.05, 5);
  });

  it('excludes joints below confidence threshold in current frame', () => {
    const poseA = makePoseWithJoints([
      { joint: 0, x: 0.5, y: 0.5, confidence: 0.1 }, // low confidence
    ]);
    const poseB = makePoseWithJoints([
      { joint: 0, x: 0.9, y: 0.9, confidence: 0.9 }, // high confidence
    ]);

    const result = computePoseDisplacement(poseA, poseB);

    // Joint 0 should be excluded — the remaining 23 are identical
    expect(result.jointCount).toBe(23);
    expect(result.displacement).toBe(0);
  });

  it('excludes joints below confidence threshold in previous frame', () => {
    const poseA = makePoseWithJoints([
      { joint: 0, x: 0.9, y: 0.9, confidence: 0.9 },
    ]);
    const poseB = makePoseWithJoints([
      { joint: 0, x: 0.5, y: 0.5, confidence: 0.1 }, // low confidence in previous
    ]);

    const result = computePoseDisplacement(poseA, poseB);

    expect(result.jointCount).toBe(23);
    expect(result.displacement).toBe(0);
  });

  it('returns zero displacement with zero joint count when all joints are low confidence', () => {
    const poseA = makePose(0.1, 0.1, 0.1);
    const poseB = makePose(0.9, 0.9, 0.1);

    const result = computePoseDisplacement(poseA, poseB);

    expect(result.jointCount).toBe(0);
    expect(result.displacement).toBe(0);
  });

  it('uses custom confidence threshold', () => {
    const poseA = makePose(0.5, 0.5, 0.5);
    const poseB = makePose(0.5, 0.6, 0.5);

    // With threshold 0.6, all joints (at 0.5 confidence) are excluded
    const excluded = computePoseDisplacement(poseA, poseB, 0.6);
    expect(excluded.jointCount).toBe(0);

    // With threshold 0.4, all joints qualify
    const included = computePoseDisplacement(poseA, poseB, 0.4);
    expect(included.jointCount).toBe(24);
    expect(included.displacement).toBeCloseTo(0.1, 5);
  });

  it('averages displacement across only qualifying joints', () => {
    // Joint 0 moves 0.1, joint 1 moves 0.3, rest are identical
    const poseA = makePoseWithJoints([
      { joint: 0, x: 0.5, y: 0.5 },
      { joint: 1, x: 0.5, y: 0.5 },
    ]);
    const poseB = makePoseWithJoints([
      { joint: 0, x: 0.5, y: 0.6 }, // moved 0.1
      { joint: 1, x: 0.5, y: 0.8 }, // moved 0.3
    ]);

    const result = computePoseDisplacement(poseA, poseB);

    // 22 joints at 0.0 displacement + joint 0 at 0.1 + joint 1 at 0.3
    // average = (0.1 + 0.3 + 0*22) / 24
    const expectedAverage = (0.1 + 0.3) / 24;
    expect(result.displacement).toBeCloseTo(expectedAverage, 5);
    expect(result.jointCount).toBe(24);
  });
});

describe('isPoseStill', () => {
  it('returns true when displacement is below threshold with enough joints', () => {
    expect(isPoseStill({ displacement: 0.005, jointCount: 10 })).toBe(true);
  });

  it('returns false when displacement exceeds threshold', () => {
    expect(isPoseStill({ displacement: 0.02, jointCount: 10 })).toBe(false);
  });

  it('returns false when too few joints are tracked', () => {
    expect(isPoseStill({ displacement: 0.001, jointCount: 3 })).toBe(false);
  });

  it('returns false at exactly the threshold', () => {
    // 0.01 is not < 0.01
    expect(isPoseStill({ displacement: 0.01, jointCount: 10 })).toBe(false);
  });

  it('returns true just below threshold', () => {
    expect(isPoseStill({ displacement: 0.0099, jointCount: 10 })).toBe(true);
  });

  it('uses custom threshold', () => {
    expect(isPoseStill({ displacement: 0.015, jointCount: 10 }, 0.02)).toBe(true);
    expect(isPoseStill({ displacement: 0.025, jointCount: 10 }, 0.02)).toBe(false);
  });

  it('returns true with exactly 4 joints (minimum)', () => {
    expect(isPoseStill({ displacement: 0.005, jointCount: 4 })).toBe(true);
  });
});
