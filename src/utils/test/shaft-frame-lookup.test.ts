import { describe, it, expect } from 'vitest';
import { findNearestShaftFrame } from '../shaft-frame-lookup';
import type { ShaftFrameResult } from '../../../modules/swing-analysis/src/types';

const makeFrame = (timestampMs: number, frameIndex: number = 0): ShaftFrameResult => ({
  frameIndex,
  timestampMs,
  angleDegrees: 45,
  startPoint: { x: 0.3, y: 0.2 },
  endPoint: { x: 0.7, y: 0.8 },
  confidence: 0.85,
});

describe('findNearestShaftFrame', () => {
  it('returns null for empty frames array', () => {
    expect(findNearestShaftFrame([], 1000)).toBeNull();
  });

  it('returns exact match', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestShaftFrame(frames, 200);
    expect(result).not.toBeNull();
    expect(result!.timestampMs).toBe(200);
  });

  it('returns nearest frame within tolerance', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestShaftFrame(frames, 215);
    expect(result).not.toBeNull();
    expect(result!.timestampMs).toBe(200);
  });

  it('returns null when outside tolerance', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestShaftFrame(frames, 160, 30);
    expect(result).toBeNull();
  });

  it('returns first frame when timestamp is before all frames', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestShaftFrame(frames, 80);
    expect(result).not.toBeNull();
    expect(result!.timestampMs).toBe(100);
  });

  it('returns last frame when timestamp is after all frames', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestShaftFrame(frames, 320);
    expect(result).not.toBeNull();
    expect(result!.timestampMs).toBe(300);
  });

  it('returns null when timestamp is far beyond last frame', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestShaftFrame(frames, 500);
    expect(result).toBeNull();
  });

  it('handles single-element array', () => {
    const frames = [makeFrame(500)];
    expect(findNearestShaftFrame(frames, 490)?.timestampMs).toBe(500);
    expect(findNearestShaftFrame(frames, 510)?.timestampMs).toBe(500);
    expect(findNearestShaftFrame(frames, 600)).toBeNull();
  });

  it('picks closer frame when between two frames', () => {
    const frames = [makeFrame(100), makeFrame(200)];
    // 140 is closer to 100 than 200
    expect(findNearestShaftFrame(frames, 140)?.timestampMs).toBe(100);
    // 160 is closer to 200 than 100
    expect(findNearestShaftFrame(frames, 160)?.timestampMs).toBe(200);
  });

  it('respects custom tolerance', () => {
    const frames = [makeFrame(100), makeFrame(200)];
    expect(findNearestShaftFrame(frames, 130, 40)).not.toBeNull();
    expect(findNearestShaftFrame(frames, 130, 20)).toBeNull();
  });
});
