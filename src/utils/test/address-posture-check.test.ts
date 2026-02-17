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

describe('checkAddressPosture', () => {
  it('returns true when wrists are at hip level (address position)', () => {
    // Shoulders at 0.3, hips at 0.6, midpoint = 0.45
    // Wrists at 0.6 (hip level) — well below midpoint
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3 },
      [RIGHT_SHOULDER]: { y: 0.3 },
      [LEFT_HIP]: { y: 0.6 },
      [RIGHT_HIP]: { y: 0.6 },
      [LEFT_WRIST]: { y: 0.6 },
      [RIGHT_WRIST]: { y: 0.6 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toContain('wrists below torso midpoint');
  });

  it('returns false when wrists are at shoulder level (follow-through)', () => {
    // Shoulders at 0.3, hips at 0.6, midpoint = 0.45
    // Wrists at 0.3 (shoulder level) — above midpoint
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3 },
      [RIGHT_SHOULDER]: { y: 0.3 },
      [LEFT_HIP]: { y: 0.6 },
      [RIGHT_HIP]: { y: 0.6 },
      [LEFT_WRIST]: { y: 0.3 },
      [RIGHT_WRIST]: { y: 0.3 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(false);
    expect(result.reason).toContain('wrists above torso midpoint');
  });

  it('returns false when wrists are between shoulders and midpoint (raised arms)', () => {
    // Shoulders at 0.3, hips at 0.6, midpoint = 0.45
    // Wrists at 0.4 — below shoulders but above midpoint
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3 },
      [RIGHT_SHOULDER]: { y: 0.3 },
      [LEFT_HIP]: { y: 0.6 },
      [RIGHT_HIP]: { y: 0.6 },
      [LEFT_WRIST]: { y: 0.4 },
      [RIGHT_WRIST]: { y: 0.4 },
    });

    const result = checkAddressPosture(pose);

    // This is the key difference from the old check — wrists are below shoulders
    // but above the torso midpoint, so NOT address
    expect(result.isAddressPosture).toBe(false);
  });

  it('returns false when wrists are clearly above the midpoint', () => {
    // Shoulders at 0.2, hips at 0.6, midpoint = 0.4
    // Wrists at 0.35 — above midpoint
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.2 },
      [RIGHT_SHOULDER]: { y: 0.2 },
      [LEFT_HIP]: { y: 0.6 },
      [RIGHT_HIP]: { y: 0.6 },
      [LEFT_WRIST]: { y: 0.35 },
      [RIGHT_WRIST]: { y: 0.35 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
  });

  it('returns true when wrists are just below midpoint', () => {
    // Shoulders at 0.3, hips at 0.6, midpoint = 0.45
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3 },
      [RIGHT_SHOULDER]: { y: 0.3 },
      [LEFT_HIP]: { y: 0.6 },
      [RIGHT_HIP]: { y: 0.6 },
      [LEFT_WRIST]: { y: 0.46 },
      [RIGHT_WRIST]: { y: 0.46 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });

  it('falls back to shoulders-only when hips are not tracked', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3 },
      [RIGHT_SHOULDER]: { y: 0.3 },
      [LEFT_HIP]: { confidence: 0.1 },
      [RIGHT_HIP]: { confidence: 0.1 },
      [LEFT_WRIST]: { y: 0.6 },
      [RIGHT_WRIST]: { y: 0.6 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toContain('wrists below shoulders');
  });

  it('falls back to hips-only when shoulders are not tracked', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { confidence: 0.1 },
      [RIGHT_SHOULDER]: { confidence: 0.1 },
      [LEFT_HIP]: { y: 0.6 },
      [RIGHT_HIP]: { y: 0.6 },
      [LEFT_WRIST]: { y: 0.7 },
      [RIGHT_WRIST]: { y: 0.7 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toContain('wrists below hips');
  });

  it('returns true (fallback) when no wrists are tracked', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3 },
      [RIGHT_SHOULDER]: { y: 0.3 },
      [LEFT_HIP]: { y: 0.6 },
      [RIGHT_HIP]: { y: 0.6 },
      [LEFT_WRIST]: { confidence: 0.1 },
      [RIGHT_WRIST]: { confidence: 0.1 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toContain('no wrists');
  });

  it('returns true (fallback) when no torso joints are tracked', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { confidence: 0.1 },
      [RIGHT_SHOULDER]: { confidence: 0.1 },
      [LEFT_HIP]: { confidence: 0.1 },
      [RIGHT_HIP]: { confidence: 0.1 },
      [LEFT_WRIST]: { y: 0.2 },
      [RIGHT_WRIST]: { y: 0.2 },
    });

    const result = checkAddressPosture(pose);

    expect(result.isAddressPosture).toBe(true);
    expect(result.reason).toContain('no torso');
  });

  it('uses custom confidence threshold', () => {
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3, confidence: 0.5 },
      [RIGHT_SHOULDER]: { y: 0.3, confidence: 0.5 },
      [LEFT_HIP]: { y: 0.6, confidence: 0.5 },
      [RIGHT_HIP]: { y: 0.6, confidence: 0.5 },
      [LEFT_WRIST]: { y: 0.55, confidence: 0.5 },
      [RIGHT_WRIST]: { y: 0.55, confidence: 0.5 },
    });

    // With threshold 0.6, all joints excluded → insufficient
    const strict = checkAddressPosture(pose, 0.6);
    expect(strict.isAddressPosture).toBe(true);
    expect(strict.reason).toContain('insufficient');

    // With threshold 0.4, all joints included → wrists below midpoint (0.55 > 0.45)
    const lenient = checkAddressPosture(pose, 0.4);
    expect(lenient.isAddressPosture).toBe(true);
    expect(lenient.reason).toContain('wrists below torso midpoint');
  });

  it('correctly averages asymmetric joint values', () => {
    // Left shoulder at 0.25, right at 0.35 → avg = 0.30
    // Left hip at 0.55, right at 0.65 → avg = 0.60
    // Midpoint = (0.30 + 0.60) / 2 = 0.45
    // Left wrist at 0.40, right at 0.44 → avg = 0.42 — ABOVE midpoint
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.25 },
      [RIGHT_SHOULDER]: { y: 0.35 },
      [LEFT_HIP]: { y: 0.55 },
      [RIGHT_HIP]: { y: 0.65 },
      [LEFT_WRIST]: { y: 0.40 },
      [RIGHT_WRIST]: { y: 0.44 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(false);
  });

  it('works with one shoulder and one hip', () => {
    // One shoulder at 0.3, one hip at 0.6, midpoint = 0.45
    // Wrists at 0.5 — below midpoint ✓
    const pose = makePose({
      [LEFT_SHOULDER]: { y: 0.3 },
      [RIGHT_SHOULDER]: { confidence: 0.1 },
      [LEFT_HIP]: { confidence: 0.1 },
      [RIGHT_HIP]: { y: 0.6 },
      [LEFT_WRIST]: { y: 0.5 },
      [RIGHT_WRIST]: { y: 0.5 },
    });

    const result = checkAddressPosture(pose);
    expect(result.isAddressPosture).toBe(true);
  });
});
