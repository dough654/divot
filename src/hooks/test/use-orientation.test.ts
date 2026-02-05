import { describe, it, expect } from 'vitest';
import { getOrientationType } from '@/src/utils/orientation-mapping';

describe('getOrientationType', () => {
  it('returns portrait when height > width', () => {
    expect(getOrientationType(390, 844)).toBe('portrait');
  });

  it('returns landscape when width > height', () => {
    expect(getOrientationType(844, 390)).toBe('landscape');
  });

  it('returns portrait when width equals height (square)', () => {
    expect(getOrientationType(500, 500)).toBe('portrait');
  });

  it('handles tablet portrait dimensions', () => {
    expect(getOrientationType(768, 1024)).toBe('portrait');
  });

  it('handles tablet landscape dimensions', () => {
    expect(getOrientationType(1024, 768)).toBe('landscape');
  });

  it('handles very small differences', () => {
    expect(getOrientationType(400, 401)).toBe('portrait');
    expect(getOrientationType(401, 400)).toBe('landscape');
  });
});
