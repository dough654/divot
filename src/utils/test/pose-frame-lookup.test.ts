import { describe, it, expect } from 'vitest';
import { findNearestPoseFrame } from '../pose-frame-lookup';
import type { PoseFrame } from '../../../modules/video-pose-analysis/src/types';

const makeFrame = (timestampMs: number, frameIndex: number = 0): PoseFrame => ({
  frameIndex,
  timestampMs,
  landmarks: Array(72).fill(0),
});

describe('findNearestPoseFrame', () => {
  it('returns null for empty frames array', () => {
    expect(findNearestPoseFrame([], 1000)).toBeNull();
  });

  it('returns exact match', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestPoseFrame(frames, 200);
    expect(result).not.toBeNull();
    expect(result!.timestampMs).toBe(200);
  });

  it('returns nearest frame within tolerance', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestPoseFrame(frames, 215);
    expect(result).not.toBeNull();
    expect(result!.timestampMs).toBe(200);
  });

  it('returns null when outside default 100ms tolerance', () => {
    const frames = [makeFrame(100), makeFrame(400)];
    const result = findNearestPoseFrame(frames, 250);
    expect(result).toBeNull();
  });

  it('returns first frame when timestamp is before all frames', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestPoseFrame(frames, 50);
    expect(result).not.toBeNull();
    expect(result!.timestampMs).toBe(100);
  });

  it('returns null when timestamp is far before first frame', () => {
    const frames = [makeFrame(200), makeFrame(300)];
    const result = findNearestPoseFrame(frames, 50);
    expect(result).toBeNull();
  });

  it('returns last frame when timestamp is after all frames', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestPoseFrame(frames, 350);
    expect(result).not.toBeNull();
    expect(result!.timestampMs).toBe(300);
  });

  it('returns null when timestamp is far beyond last frame', () => {
    const frames = [makeFrame(100), makeFrame(200), makeFrame(300)];
    const result = findNearestPoseFrame(frames, 500);
    expect(result).toBeNull();
  });

  it('handles single-element array', () => {
    const frames = [makeFrame(500)];
    expect(findNearestPoseFrame(frames, 450)?.timestampMs).toBe(500);
    expect(findNearestPoseFrame(frames, 550)?.timestampMs).toBe(500);
    expect(findNearestPoseFrame(frames, 700)).toBeNull();
  });

  it('picks closer frame when between two frames', () => {
    const frames = [makeFrame(100), makeFrame(200)];
    // 130 is closer to 100
    expect(findNearestPoseFrame(frames, 130)?.timestampMs).toBe(100);
    // 170 is closer to 200
    expect(findNearestPoseFrame(frames, 170)?.timestampMs).toBe(200);
  });

  it('respects custom tolerance', () => {
    const frames = [makeFrame(100), makeFrame(200)];
    expect(findNearestPoseFrame(frames, 130, 40)).not.toBeNull();
    expect(findNearestPoseFrame(frames, 130, 20)).toBeNull();
  });
});
