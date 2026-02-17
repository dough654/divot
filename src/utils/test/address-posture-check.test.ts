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
 * Helper to build an address pose — all three checks pass:
 * - Shoulders at y=0.30, hips at y=0.60 (torso height 0.30)
 *   75% threshold = 0.30 + 0.75*0.30 = 0.525. Wrists at 0.58 ✓
 * - Shoulders x=0.57, hips x=0.50 → xOffset=0.07 (> 0.05) ✓
 * - Both shoulders at x=0.57 → gap=0.00 (< 0.06) ✓
 */
const makeAddressPose = (overrides: Record<number, { x?: number; y?: number; confidence?: number }> = {}) =>
  makePose({
    [LEFT_SHOULDER]: { x: 0.57, y: 0.30 },
    [RIGHT_SHOULDER]: { x: 0.57, y: 0.30 },
    [LEFT_HIP]: { x: 0.50, y: 0.60 },
    [RIGHT_HIP]: { x: 0.50, y: 0.60 },
    [LEFT_WRIST]: { x: 0.57, y: 0.58 },
    [RIGHT_WRIST]: { x: 0.57, y: 0.58 },
    ...overrides,
  });

/**
 * Helper to build a follow-through pose — all three checks fail:
 * - Wrists at chest level (y=0.40, above 75% threshold of 0.525)
 * - Shoulders at x=0.50, hips at x=0.50 → no X offset (upright)
 * - Shoulders spread: left x=0.42, right x=0.58 → gap=0.16 (> 0.06)
 */
const makeFollowThroughPose = (overrides: Record<number, { x?: number; y?: number; confidence?: number }> = {}) =>
  makePose({
    [LEFT_SHOULDER]: { x: 0.42, y: 0.30 },
    [RIGHT_SHOULDER]: { x: 0.58, y: 0.30 },
    [LEFT_HIP]: { x: 0.50, y: 0.60 },
    [RIGHT_HIP]: { x: 0.50, y: 0.60 },
    [LEFT_WRIST]: { x: 0.50, y: 0.40 },
    [RIGHT_WRIST]: { x: 0.50, y: 0.40 },
    ...overrides,
  });

describe('checkAddressPosture', () => {
  // ── Happy path ──

  it('returns true for a proper address pose (wrists low + bend + aligned)', () => {
    const result = checkAddressPosture(makeAddressPose());

    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toContain('wrists near hips');
    expect(result.reason).toContain('forward bend');
    expect(result.reason).toContain('shoulders aligned');
  });

  // ── Follow-through rejection ──

  it('returns false for follow-through (wrists high + upright + rotated)', () => {
    const result = checkAddressPosture(makeFollowThroughPose());

    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('wrists too high');
  });

  it('returns false when wrists are at stomach level (above 75% threshold)', () => {
    const pose = makeAddressPose({
      [LEFT_WRIST]: { x: 0.55, y: 0.50 },
      [RIGHT_WRIST]: { x: 0.55, y: 0.50 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('wrists too high');
  });

  // ── Each check independently ──

  it('returns false when wrists low + bend, but shoulders rotated', () => {
    // Everything passes except shoulders are spread apart (rotated toward target)
    // avg shoulder X = 0.55, hip X = 0.50 → bend offset = 0.05 ✓
    // gap = 0.20 >> 0.06 ✗
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { x: 0.45, y: 0.30 },
      [RIGHT_SHOULDER]: { x: 0.65, y: 0.30 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('shoulders rotated');
  });

  it('returns false when wrists low + aligned, but no forward bend', () => {
    // Shoulders directly above hips (x=0.50)
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { x: 0.50, y: 0.30 },
      [RIGHT_SHOULDER]: { x: 0.50, y: 0.30 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('too upright');
  });

  it('returns false when bend + aligned, but wrists high', () => {
    const pose = makeAddressPose({
      [LEFT_WRIST]: { x: 0.55, y: 0.30 },
      [RIGHT_WRIST]: { x: 0.55, y: 0.30 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('wrists too high');
  });

  // ── Shoulder alignment thresholds ──

  it('passes shoulder alignment at exactly the threshold (0.06)', () => {
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { x: 0.52, y: 0.30 },   // gap = 0.06, avg = 0.55
      [RIGHT_SHOULDER]: { x: 0.58, y: 0.30 },
      [LEFT_HIP]: { x: 0.50, y: 0.60 },        // offset = 0.05 ✓
      [RIGHT_HIP]: { x: 0.50, y: 0.60 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toContain('shoulders aligned');
  });

  it('fails shoulder alignment just above threshold', () => {
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { x: 0.515, y: 0.30 },  // gap = 0.07, avg = 0.55
      [RIGHT_SHOULDER]: { x: 0.585, y: 0.30 },
      [LEFT_HIP]: { x: 0.50, y: 0.60 },        // offset = 0.05 ✓
      [RIGHT_HIP]: { x: 0.50, y: 0.60 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('shoulders rotated');
  });

  // ── Forward bend thresholds ──

  it('passes forward bend at exactly the threshold (0.05)', () => {
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { x: 0.55, y: 0.30 },
      [RIGHT_SHOULDER]: { x: 0.55, y: 0.30 },
      [LEFT_HIP]: { x: 0.50, y: 0.60 },
      [RIGHT_HIP]: { x: 0.50, y: 0.60 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });

  it('fails forward bend just below threshold', () => {
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { x: 0.54, y: 0.30 },
      [RIGHT_SHOULDER]: { x: 0.54, y: 0.30 },
      [LEFT_HIP]: { x: 0.50, y: 0.60 },
      [RIGHT_HIP]: { x: 0.50, y: 0.60 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('too upright');
  });

  // ── Graceful fallbacks ──

  it('skips wrist check when no wrists tracked', () => {
    const pose = makeAddressPose({
      [LEFT_WRIST]: { confidence: 0.1 },
      [RIGHT_WRIST]: { confidence: 0.1 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });

  it('skips all checks when shoulders + hips missing', () => {
    const pose = makeAddressPose({
      [LEFT_SHOULDER]: { confidence: 0.1 },
      [RIGHT_SHOULDER]: { confidence: 0.1 },
      [LEFT_HIP]: { confidence: 0.1 },
      [RIGHT_HIP]: { confidence: 0.1 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });

  it('skips shoulder alignment when only one shoulder tracked', () => {
    const pose = makeAddressPose({
      [RIGHT_SHOULDER]: { confidence: 0.1 },
    });

    // Wrist check uses one shoulder + hips → still works
    // Forward bend uses one shoulder X + hip X → still works
    // Shoulder alignment skipped (need both) → passes by default
    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });

  it('uses hip fallback for wrist check when shoulders missing', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { confidence: 0.1 },
      [RIGHT_SHOULDER]: { confidence: 0.1 },
      [LEFT_HIP]: { x: 0.50, y: 0.60 },
      [RIGHT_HIP]: { x: 0.50, y: 0.60 },
      [LEFT_WRIST]: { y: 0.40 },
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

    // Threshold 0.6 excludes all joints → all checks skipped → true
    const strict = checkAddressPosture(pose, 0.6);
    expect(strict.isAddressPosture).toBe(true);

    // Threshold 0.4 includes all → proper checks → true
    const lenient = checkAddressPosture(pose, 0.4);
    expect(lenient.isAddressPosture).toBe(true);
    expect(lenient.reason).toContain('wrists near hips');
  });

  // ── Multiple failing reasons ──

  it('reports all failing reasons when multiple checks fail', () => {
    const result = checkAddressPosture(makeFollowThroughPose());

    expect(result.isAddressPosture).toBe(false);
    // Follow-through should fail wrist height, forward bend, and shoulder alignment
    expect(result.reason).toContain('wrists too high');
    expect(result.reason).toContain('too upright');
    expect(result.reason).toContain('shoulders rotated');
  });
});
