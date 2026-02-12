import { describe, it, expect } from 'vitest';
import { smoothPoseData, jointOpacity, SmoothedPose } from '../skeleton-smoothing';
import { JOINT_NAMES } from '../pose-normalization';

/** Creates a 42-element pose array with all joints at the given x/y/confidence. */
const makePoseArray = (x: number, y: number, confidence: number): number[] => {
  const data: number[] = [];
  for (let i = 0; i < JOINT_NAMES.length; i++) {
    data.push(x, y, confidence);
  }
  return data;
};

/** Creates a pose array with specific joints overridden. */
const makePoseWithOverrides = (
  baseX: number,
  baseY: number,
  baseConfidence: number,
  overrides: Record<string, { x?: number; y?: number; confidence?: number }>,
): number[] => {
  const data = makePoseArray(baseX, baseY, baseConfidence);
  for (const [name, values] of Object.entries(overrides)) {
    const idx = JOINT_NAMES.indexOf(name as (typeof JOINT_NAMES)[number]);
    if (idx === -1) continue;
    const offset = idx * 3;
    if (values.x !== undefined) data[offset] = values.x;
    if (values.y !== undefined) data[offset + 1] = values.y;
    if (values.confidence !== undefined) data[offset + 2] = values.confidence;
  }
  return data;
};

describe('smoothPoseData', () => {
  it('returns raw positions directly on first frame (no previous)', () => {
    const raw = makePoseArray(0.5, 0.6, 0.8);
    const result = smoothPoseData(raw, null);

    expect(result).not.toBeNull();
    const nose = result!.get('nose');
    expect(nose).toBeDefined();
    expect(nose!.x).toBe(0.5);
    expect(nose!.y).toBe(0.6);
    expect(nose!.confidence).toBe(0.8);
    expect(nose!.staleness).toBe(0);
  });

  it('EMA-blends positions with previous frame', () => {
    const raw1 = makePoseArray(0.5, 0.5, 0.8);
    const prev = smoothPoseData(raw1, null)!;

    const raw2 = makePoseArray(0.7, 0.7, 0.9);
    const result = smoothPoseData(raw2, prev, 0.4);

    const nose = result!.get('nose')!;
    // EMA: prev + alpha * (current - prev) = 0.5 + 0.4 * (0.7 - 0.5) = 0.58
    expect(nose.x).toBeCloseTo(0.58, 5);
    expect(nose.y).toBeCloseTo(0.58, 5);
    expect(nose.staleness).toBe(0);
  });

  it('persists joints that drop below confidence threshold', () => {
    const raw1 = makePoseArray(0.5, 0.5, 0.8);
    const prev = smoothPoseData(raw1, null)!;

    // All joints now low confidence
    const raw2 = makePoseArray(0.5, 0.5, 0.1);
    const result = smoothPoseData(raw2, prev);

    expect(result).not.toBeNull();
    const nose = result!.get('nose')!;
    expect(nose.x).toBe(0.5); // Persisted from previous
    expect(nose.y).toBe(0.5);
    expect(nose.staleness).toBe(1);
  });

  it('drops joints that exceed MAX_STALENESS', () => {
    let current: SmoothedPose | null = null;

    // First frame: good confidence
    const raw1 = makePoseArray(0.5, 0.5, 0.8);
    current = smoothPoseData(raw1, null);

    // Then 6 frames of low confidence (staleness 1 through 6)
    const lowRaw = makePoseArray(0.5, 0.5, 0.1);
    for (let i = 0; i < 6; i++) {
      current = smoothPoseData(lowRaw, current);
    }

    // After 6 frames of low confidence, all joints should be expired (MAX_STALENESS = 5)
    // Staleness goes 1, 2, 3, 4, 5 (last visible), 6 (dropped)
    expect(current).toBeNull();
  });

  it('resets staleness when joint regains good confidence', () => {
    const raw1 = makePoseArray(0.5, 0.5, 0.8);
    let current = smoothPoseData(raw1, null)!;

    // Two frames of low confidence
    const lowRaw = makePoseArray(0.5, 0.5, 0.1);
    current = smoothPoseData(lowRaw, current)!;
    current = smoothPoseData(lowRaw, current)!;
    expect(current.get('nose')!.staleness).toBe(2);

    // Good confidence again
    const raw3 = makePoseArray(0.6, 0.6, 0.9);
    current = smoothPoseData(raw3, current)!;
    expect(current.get('nose')!.staleness).toBe(0);
  });

  it('handles null rawData with global grace period', () => {
    const raw1 = makePoseArray(0.5, 0.5, 0.8);
    const prev = smoothPoseData(raw1, null)!;

    const result = smoothPoseData(null, prev);
    expect(result).not.toBeNull();

    const nose = result!.get('nose')!;
    expect(nose.x).toBe(0.5);
    expect(nose.staleness).toBe(1);
  });

  it('returns null when null rawData and no previous', () => {
    expect(smoothPoseData(null, null)).toBeNull();
  });

  it('returns null when rawData is wrong length', () => {
    expect(smoothPoseData([1, 2, 3], null)).toBeNull();
  });

  it('only includes joints with sufficient confidence or valid previous', () => {
    const raw = makePoseWithOverrides(0.5, 0.5, 0.8, {
      nose: { confidence: 0.1 },
      neck: { confidence: 0.1 },
    });
    const result = smoothPoseData(raw, null);

    expect(result).not.toBeNull();
    expect(result!.has('nose')).toBe(false);
    expect(result!.has('neck')).toBe(false);
    expect(result!.has('leftShoulder')).toBe(true);
  });

  it('uses alpha=1.0 to take raw values entirely', () => {
    const raw1 = makePoseArray(0.5, 0.5, 0.8);
    const prev = smoothPoseData(raw1, null)!;

    const raw2 = makePoseArray(0.9, 0.9, 0.8);
    const result = smoothPoseData(raw2, prev, 1.0);

    expect(result!.get('nose')!.x).toBeCloseTo(0.9, 5);
  });

  it('uses alpha=0.0 to keep previous values entirely', () => {
    const raw1 = makePoseArray(0.5, 0.5, 0.8);
    const prev = smoothPoseData(raw1, null)!;

    const raw2 = makePoseArray(0.9, 0.9, 0.8);
    const result = smoothPoseData(raw2, prev, 0.0);

    expect(result!.get('nose')!.x).toBeCloseTo(0.5, 5);
  });
});

describe('jointOpacity', () => {
  it('returns 1.0 for staleness 0', () => {
    expect(jointOpacity(0)).toBe(1.0);
  });

  it('returns 0.8 for staleness 1', () => {
    expect(jointOpacity(1)).toBeCloseTo(0.8, 5);
  });

  it('returns 0.2 for staleness 5 (MAX_STALENESS)', () => {
    expect(jointOpacity(5)).toBeCloseTo(0.2, 5);
  });

  it('returns 0.0 for staleness > MAX_STALENESS', () => {
    expect(jointOpacity(6)).toBe(0.0);
    expect(jointOpacity(10)).toBe(0.0);
  });

  it('decreases linearly between staleness 1 and 5', () => {
    const o1 = jointOpacity(1);
    const o2 = jointOpacity(2);
    const o3 = jointOpacity(3);
    const o4 = jointOpacity(4);
    const o5 = jointOpacity(5);

    // Each step should decrease by 0.15 (0.6 / 4 steps)
    expect(o1 - o2).toBeCloseTo(0.15, 5);
    expect(o2 - o3).toBeCloseTo(0.15, 5);
    expect(o3 - o4).toBeCloseTo(0.15, 5);
    expect(o4 - o5).toBeCloseTo(0.15, 5);
  });

  it('returns 1.0 for negative staleness', () => {
    expect(jointOpacity(-1)).toBe(1.0);
  });
});
