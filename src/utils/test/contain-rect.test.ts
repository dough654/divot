import { describe, it, expect } from 'vitest';
import { computeContainRect } from '../contain-rect';

describe('computeContainRect', () => {
  it('returns full container when aspect ratios match', () => {
    const result = computeContainRect(1920, 1080, 384, 216);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
    expect(result.width).toBeCloseTo(384);
    expect(result.height).toBeCloseTo(216);
  });

  it('letterboxes top/bottom when video is wider', () => {
    // 16:9 video in a square container
    const result = computeContainRect(1920, 1080, 400, 400);
    expect(result.width).toBeCloseTo(400);
    expect(result.height).toBeCloseTo(225);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(87.5);
  });

  it('pillarboxes left/right when video is taller', () => {
    // 9:16 video in a square container
    const result = computeContainRect(1080, 1920, 400, 400);
    expect(result.height).toBeCloseTo(400);
    expect(result.width).toBeCloseTo(225);
    expect(result.x).toBeCloseTo(87.5);
    expect(result.y).toBeCloseTo(0);
  });

  it('handles zero dimensions gracefully', () => {
    const result = computeContainRect(0, 0, 400, 300);
    expect(result).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });
});
