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
const LEFT_HIP = 8;
const RIGHT_HIP = 9;

/**
 * Helper to build an address pose (wrists at hip level, forward bend).
 * Shoulders at y=0.30, hips at y=0.60 (torso height 0.30).
 * 75% threshold = 0.30 + 0.75 * 0.30 = 0.525.
 * Shoulders x=0.55, hips x=0.50 → xOffset=0.05 (> 0.03 threshold).
 */
const makeAddressPose = (overrides: Record<number, { x?: number; y?: number; confidence?: number }> = {}) =>
  makePose({
    [LEFT_SHOULDER]: { x: 0.55, y: 0.30 },
    [RIGHT_SHOULDER]: { x: 0.55, y: 0.30 },
    [LEFT_HIP]: { x: 0.50, y: 0.60 },
    [RIGHT_HIP]: { x: 0.50, y: 0.60 },
    [LEFT_WRIST]: { x: 0.55, y: 0.58 },
    [RIGHT_WRIST]: { x: 0.55, y: 0.58 },
    ...overrides,
  });

/**
 * Helper to build a follow-through pose (wrists high, upright torso).
 * Same shoulder/hip Y, but wrists at chest level and no X offset.
 */
const makeFollowThroughPose = (overrides: Record<number, { x?: number; y?: number; confidence?: number }> = {}) =>
  makePose({
    [LEFT_SHOULDER]: { x: 0.50, y: 0.30 },
    [RIGHT_SHOULDER]: { x: 0.50, y: 0.30 },
    [LEFT_HIP]: { x: 0.50, y: 0.60 },
    [RIGHT_HIP]: { x: 0.50, y: 0.60 },
    [LEFT_WRIST]: { x: 0.50, y: 0.40 },   // chest level — above 75% threshold
    [RIGHT_WRIST]: { x: 0.50, y: 0.40 },
    ...overrides,
  });

describe('checkAddressPosture', () => {
  // ── Happy path: address position ──

  it('returns true for a proper address pose (wrists low + forward bend)', () => {
    const result = checkAddressPosture(makeAddressPose());

    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toContain('wrists near hips');
    expect(result.reason).toContain('forward bend');
  });

  // ── Follow-through rejection ──

  it('returns false for follow-through (wrists high + upright)', () => {
    const result = checkAddressPosture(makeFollowThroughPose());

    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('wrists too high');
    expect(result.reason).toContain('too upright');
  });

  it('returns false when wrists are at stomach level (above 75% threshold)', () => {
    // Shoulders at 0.30, hips at 0.60, threshold = 0.525
    // Wrists at 0.50 (stomach) — below midpoint but above 75% threshold
    const pose = makeAddressPose({
      [LEFT_WRIST]: { x: 0.55, y: 0.50 },
      [RIGHT_WRIST]: { x: 0.55, y: 0.50 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('wrists too high');
  });

  // ── Each check independently ──

  it('returns false when wrists are low but torso is upright (no bend)', () => {
    // Wrists at hip level but shoulders directly above hips (x=0.50)
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { x: 0.50, y: 0.30 },
      [RIGHT_SHOULDER]: { x: 0.50, y: 0.30 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('too upright');
  });

  it('returns false when there is forward bend but wrists are high', () => {
    // Good X offset but wrists at shoulder level
    const pose = makeAddressPose({
      [LEFT_WRIST]: { x: 0.55, y: 0.30 },
      [RIGHT_WRIST]: { x: 0.55, y: 0.30 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('wrists too high');
  });

  // ── Forward bend threshold ──

  it('passes forward bend at exactly the threshold (0.03)', () => {
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { x: 0.53, y: 0.30 },
      [RIGHT_SHOULDER]: { x: 0.53, y: 0.30 },
      [LEFT_HIP]: { x: 0.50, y: 0.60 },
      [RIGHT_HIP]: { x: 0.50, y: 0.60 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });

  it('fails forward bend just below threshold', () => {
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { x: 0.52, y: 0.30 },
      [RIGHT_SHOULDER]: { x: 0.52, y: 0.30 },
      [LEFT_HIP]: { x: 0.50, y: 0.60 },
      [RIGHT_HIP]: { x: 0.50, y: 0.60 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('too upright');
  });

  // ── Graceful fallbacks ──

  it('skips wrist check when no wrists are tracked (passes by default)', () => {
    const pose = makeAddressPose({
      [LEFT_WRIST]: { confidence: 0.1 },
      [RIGHT_WRIST]: { confidence: 0.1 },
    });

    const result = checkAddressPosture(pose);
    // Forward bend still passes, wrist check skipped → true
    expect(result.isAddressPosture).toBe(true);
  });

  it('skips forward bend check when shoulders missing (passes by default)', () => {
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { confidence: 0.1 },
      [RIGHT_SHOULDER]: { confidence: 0.1 },
      [LEFT_WRIST]: { x: 0.55, y: 0.62 },   // at/below hip level (0.60)
      [RIGHT_WRIST]: { x: 0.55, y: 0.62 },
    });

    // Wrists at 0.62 >= hips at 0.60 → fallback wrist check passes
    // Forward bend skipped (no shoulders for X) → passes by default
    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });

  it('skips forward bend check when hips missing (passes by default)', () => {
    const pose = makeAddressPose({
      [LEFT_HIP]: { confidence: 0.1 },
      [RIGHT_HIP]: { confidence: 0.1 },
    });

    // Wrist check: no hips + no shoulders→hip range → skipped (default true)
    // Forward bend: no hips → skipped (default true)
    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });

  it('skips wrist check when shoulders missing but uses hip fallback', () => {
    // No shoulders → wrist check falls back to wrists-at/below-hips
    const pose = makePose({
      [LEFT_SHOULDER]: { confidence: 0.1 },
      [RIGHT_SHOULDER]: { confidence: 0.1 },
      [LEFT_HIP]: { x: 0.50, y: 0.60 },
      [RIGHT_HIP]: { x: 0.50, y: 0.60 },
      [LEFT_WRIST]: { y: 0.40 },   // above hips
      [RIGHT_WRIST]: { y: 0.40 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('wrists above hips');
  });

  // ── Custom confidence threshold ──

  it('uses custom confidence threshold', () => {
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { x: 0.55, y: 0.30, confidence: 0.5 },
      [RIGHT_SHOULDER]: { x: 0.55, y: 0.30, confidence: 0.5 },
      [LEFT_HIP]: { x: 0.50, y: 0.60, confidence: 0.5 },
      [RIGHT_HIP]: { x: 0.50, y: 0.60, confidence: 0.5 },
      [LEFT_WRIST]: { x: 0.55, y: 0.58, confidence: 0.5 },
      [RIGHT_WRIST]: { x: 0.55, y: 0.58, confidence: 0.5 },
    });

    // Threshold 0.6 excludes all joints → both checks skipped → true
    const strict = checkAddressPosture(pose, 0.6);
    expect(strict.isAddressPosture).toBe(true);

    // Threshold 0.4 includes all → proper address check → true
    const lenient = checkAddressPosture(pose, 0.4);
    expect(lenient.isAddressPosture).toBe(true);
    expect(lenient.reason).toContain('wrists near hips');
  });

  // ── Asymmetric / partial joints ──

  it('works with one shoulder and one hip', () => {
    const pose = makeAddressPose({
      [RIGHT_SHOULDER]: { confidence: 0.1 },
      [LEFT_HIP]: { confidence: 0.1 },
    });

    // Uses left shoulder (x=0.55) and right hip (x=0.50) → xOffset=0.05 ✓
    // Uses left shoulder (y=0.30) and right hip (y=0.60) → threshold=0.525, wrists at 0.58 ✓
    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });
});
