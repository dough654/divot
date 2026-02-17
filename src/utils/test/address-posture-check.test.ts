import { describe, it, expect } from 'vitest';
import { checkAddressPosture } from '../address-posture-check';

/**
 * Create a 72-element pose array with specific joint positions.
 * Joints not specified default to (0.5, 0.5) with confidence 0.9.
 */
const makePose = (
  overrides: Record<number, { x?: number; y?: number; confidence?: number }> = {},
): number[] => {
  const pose: number[] = [];
  for (let i = 0; i < 24; i++) {
    const override = overrides[i];
    pose.push(
      override?.x ?? 0.5,
      override?.y ?? 0.5,
      override?.confidence ?? 0.9,
    );
  }
  return pose;
};

// Joint indices
const LEFT_SHOULDER = 2;
const RIGHT_SHOULDER = 3;
const LEFT_WRIST = 6;
const RIGHT_WRIST = 7;

describe('checkAddressPosture', () => {
  it('returns true when wrists are below shoulders (address position)', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3 },    // shoulders up high
      [RIGHT_SHOULDER]: { y: 0.3 },
      [LEFT_WRIST]: { y: 0.6 },       // wrists down at hip level
      [RIGHT_WRIST]: { y: 0.6 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toBe('wrists below shoulders');
  });

  it('returns false when wrists are above shoulders (follow-through)', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.4 },
      [RIGHT_SHOULDER]: { y: 0.4 },
      [LEFT_WRIST]: { y: 0.2 },       // wrists up high (follow-through)
      [RIGHT_WRIST]: { y: 0.25 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('wrists above shoulders');
  });

  it('returns false when wrists are at same level as shoulders', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.4 },
      [RIGHT_SHOULDER]: { y: 0.4 },
      [LEFT_WRIST]: { y: 0.4 },       // same height
      [RIGHT_WRIST]: { y: 0.4 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(false);
  });

  it('returns true when only one wrist is tracked and it is below shoulders', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3 },
      [RIGHT_SHOULDER]: { y: 0.3 },
      [LEFT_WRIST]: { y: 0.6 },
      [RIGHT_WRIST]: { confidence: 0.1 },  // low confidence, excluded
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(true);
  });

  it('returns true (fallback) when no wrists are tracked', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3 },
      [RIGHT_SHOULDER]: { y: 0.3 },
      [LEFT_WRIST]: { confidence: 0.1 },
      [RIGHT_WRIST]: { confidence: 0.1 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toBe('insufficient joints');
  });

  it('returns true (fallback) when no shoulders are tracked', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { confidence: 0.1 },
      [RIGHT_SHOULDER]: { confidence: 0.1 },
      [LEFT_WRIST]: { y: 0.2 },   // wrists above where shoulders would be
      [RIGHT_WRIST]: { y: 0.2 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toBe('insufficient joints');
  });

  it('uses custom confidence threshold', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3, confidence: 0.5 },
      [RIGHT_SHOULDER]: { y: 0.3, confidence: 0.5 },
      [LEFT_WRIST]: { y: 0.6, confidence: 0.5 },
      [RIGHT_WRIST]: { y: 0.6, confidence: 0.5 },
    });

    // With threshold 0.6, all joints excluded → insufficient
    const strict = checkAddressPosture(pose, 0.6);
    expect(strict.isAddressPosture).toBe(true);
    expect(strict.reason).toBe('insufficient joints');

    // With threshold 0.4, all joints included → wrists below shoulders
    const lenient = checkAddressPosture(pose, 0.4);
    expect(lenient.isAddressPosture).toBe(true);
    expect(lenient.reason).toBe('wrists below shoulders');
  });

  it('averages multiple shoulder and wrist values', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.30 },
      [RIGHT_SHOULDER]: { y: 0.35 },   // avg = 0.325
      [LEFT_WRIST]: { y: 0.31 },
      [RIGHT_WRIST]: { y: 0.33 },      // avg = 0.32 — ABOVE avg shoulder
    });

    const result = checkAddressPosture(pose);

    // Wrist avg (0.32) < Shoulder avg (0.325) → wrists above shoulders
    expect(result.isAddressPosture).toBe(false);
  });

  it('handles one shoulder with asymmetric wrists', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.35 },
      [RIGHT_SHOULDER]: { confidence: 0.1 },  // excluded
      [LEFT_WRIST]: { y: 0.2 },               // above
      [RIGHT_WRIST]: { y: 0.6 },              // below
    });

    // Avg wrist Y = 0.4, shoulder Y = 0.35 → wrists below on average ✓
    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });
});
