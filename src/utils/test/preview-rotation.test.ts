import { describe, it, expect } from 'vitest';
import { getPreviewTransform } from '../preview-rotation';

describe('getPreviewTransform', () => {
  const containerWidth = 390;
  const containerHeight = 844;

  it('returns null for 0° (portrait — no correction needed)', () => {
    expect(getPreviewTransform(0, containerWidth, containerHeight)).toBeNull();
  });

  it('returns -90deg rotation with aspect scale for 90° (landscape right)', () => {
    const result = getPreviewTransform(90, containerWidth, containerHeight);
    expect(result).not.toBeNull();
    expect(result!.rotate).toBe('-90deg');
    expect(result!.scale).toBeCloseTo(containerHeight / containerWidth);
  });

  it('returns 180deg rotation with scale 1 for 180° (upside down)', () => {
    const result = getPreviewTransform(180, containerWidth, containerHeight);
    expect(result).not.toBeNull();
    expect(result!.rotate).toBe('180deg');
    expect(result!.scale).toBe(1);
  });

  it('returns 90deg rotation with aspect scale for 270° (landscape left)', () => {
    const result = getPreviewTransform(270, containerWidth, containerHeight);
    expect(result).not.toBeNull();
    expect(result!.rotate).toBe('90deg');
    expect(result!.scale).toBeCloseTo(containerHeight / containerWidth);
  });

  it('returns null for unexpected rotation values', () => {
    expect(getPreviewTransform(45, containerWidth, containerHeight)).toBeNull();
    expect(getPreviewTransform(-90, containerWidth, containerHeight)).toBeNull();
    expect(getPreviewTransform(360, containerWidth, containerHeight)).toBeNull();
  });

  it('computes correct scale for square containers', () => {
    const result = getPreviewTransform(90, 400, 400);
    expect(result).not.toBeNull();
    expect(result!.scale).toBe(1);
  });

  it('computes correct scale for wide containers', () => {
    const result = getPreviewTransform(90, 844, 390);
    expect(result).not.toBeNull();
    expect(result!.scale).toBeCloseTo(390 / 844);
  });
});
