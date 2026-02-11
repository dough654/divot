import { describe, it, expect } from 'vitest';
import { computeCoverScale, computeMaxTranslation, clampTranslation } from '../zoom-math';
import type { ZoomDimensions } from '../zoom-math';

describe('computeCoverScale', () => {
  it('returns correct scale for pillarboxed video (narrow video in wide container)', () => {
    // 9:16 video in 16:9 container → pillarboxed
    const dims: ZoomDimensions = {
      containerWidth: 1600,
      containerHeight: 900,
      videoWidth: 1080,
      videoHeight: 1920,
    };
    const videoAspect = 1080 / 1920;
    const containerAspect = 1600 / 900;
    // containerAspect > videoAspect, so: containerAspect / videoAspect
    const expected = containerAspect / videoAspect;
    expect(computeCoverScale(dims)).toBeCloseTo(expected);
  });

  it('returns correct scale for letterboxed video (wide video in tall container)', () => {
    // 16:9 video in 9:16 container → letterboxed
    const dims: ZoomDimensions = {
      containerWidth: 900,
      containerHeight: 1600,
      videoWidth: 1920,
      videoHeight: 1080,
    };
    const videoAspect = 1920 / 1080;
    const containerAspect = 900 / 1600;
    // videoAspect > containerAspect, so: videoAspect / containerAspect
    const expected = videoAspect / containerAspect;
    expect(computeCoverScale(dims)).toBeCloseTo(expected);
  });

  it('returns 1.0 when aspect ratios match', () => {
    const dims: ZoomDimensions = {
      containerWidth: 1920,
      containerHeight: 1080,
      videoWidth: 1280,
      videoHeight: 720,
    };
    expect(computeCoverScale(dims)).toBeCloseTo(1.0);
  });

  it('returns 1.0 for zero container dimensions', () => {
    expect(computeCoverScale({
      containerWidth: 0, containerHeight: 100, videoWidth: 100, videoHeight: 100,
    })).toBe(1);
    expect(computeCoverScale({
      containerWidth: 100, containerHeight: 0, videoWidth: 100, videoHeight: 100,
    })).toBe(1);
  });

  it('returns 1.0 for zero video dimensions', () => {
    expect(computeCoverScale({
      containerWidth: 100, containerHeight: 100, videoWidth: 0, videoHeight: 100,
    })).toBe(1);
    expect(computeCoverScale({
      containerWidth: 100, containerHeight: 100, videoWidth: 100, videoHeight: 0,
    })).toBe(1);
  });

  it('handles square video in landscape container', () => {
    const dims: ZoomDimensions = {
      containerWidth: 800,
      containerHeight: 400,
      videoWidth: 500,
      videoHeight: 500,
    };
    // videoAspect = 1, containerAspect = 2 → container is wider
    // containerAspect / videoAspect = 2
    expect(computeCoverScale(dims)).toBeCloseTo(2.0);
  });
});

describe('computeMaxTranslation', () => {
  it('returns zero translation at scale 1.0 (contain mode)', () => {
    const dims: ZoomDimensions = {
      containerWidth: 400,
      containerHeight: 800,
      videoWidth: 1920,
      videoHeight: 1080,
    };
    const result = computeMaxTranslation(dims, 1.0);
    expect(result.maxTranslateX).toBe(0);
    expect(result.maxTranslateY).toBeCloseTo(0);
  });

  it('returns positive X translation when zoomed on letterboxed video', () => {
    // 16:9 video in a square container → letterboxed (bars on top/bottom)
    const dims: ZoomDimensions = {
      containerWidth: 400,
      containerHeight: 400,
      videoWidth: 1920,
      videoHeight: 1080,
    };
    // renderedWidth = min(400, 400 * (16/9)) = 400
    // renderedHeight = min(400, 400 / (16/9)) = 225
    // At scale 2: maxTranslateX = (400*2 - 400)/2 = 200
    //             maxTranslateY = (225*2 - 400)/2 = 25
    const result = computeMaxTranslation(dims, 2.0);
    expect(result.maxTranslateX).toBeCloseTo(200);
    expect(result.maxTranslateY).toBeCloseTo(25);
  });

  it('returns positive Y translation when zoomed on pillarboxed video', () => {
    // 9:16 video in a square container → pillarboxed (bars on left/right)
    const dims: ZoomDimensions = {
      containerWidth: 400,
      containerHeight: 400,
      videoWidth: 1080,
      videoHeight: 1920,
    };
    // renderedWidth = min(400, 400 * (9/16)) = 225
    // renderedHeight = min(400, 400 / (9/16)) = 400
    // At scale 2: maxTranslateX = (225*2 - 400)/2 = 25
    //             maxTranslateY = (400*2 - 400)/2 = 200
    const result = computeMaxTranslation(dims, 2.0);
    expect(result.maxTranslateX).toBeCloseTo(25);
    expect(result.maxTranslateY).toBeCloseTo(200);
  });

  it('returns zero for zero dimensions', () => {
    const result = computeMaxTranslation({
      containerWidth: 0, containerHeight: 0, videoWidth: 0, videoHeight: 0,
    }, 2.0);
    expect(result.maxTranslateX).toBe(0);
    expect(result.maxTranslateY).toBe(0);
  });
});

describe('clampTranslation', () => {
  it('returns 0 when limit is 0', () => {
    expect(clampTranslation(100, 0)).toBe(0);
  });

  it('clamps positive values to limit', () => {
    expect(clampTranslation(150, 100)).toBe(100);
  });

  it('clamps negative values to -limit', () => {
    expect(clampTranslation(-150, 100)).toBe(-100);
  });

  it('passes through values within range', () => {
    expect(clampTranslation(50, 100)).toBe(50);
    expect(clampTranslation(-50, 100)).toBe(-50);
    expect(clampTranslation(0, 100)).toBe(0);
  });

  it('returns 0 for negative limit', () => {
    expect(clampTranslation(50, -10)).toBe(0);
  });
});
