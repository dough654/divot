import { describe, it, expect } from 'vitest';
import {
  orientationToRotationDegrees,
  rotationDegreesToOrientation,
  isValidRotation,
} from '../orientation-mapping';
import type { DeviceOrientation } from '../orientation-mapping';

describe('orientationToRotationDegrees', () => {
  it('maps portrait to 0 degrees', () => {
    expect(orientationToRotationDegrees('portrait')).toBe(0);
  });

  it('maps landscape-right to 90 degrees', () => {
    expect(orientationToRotationDegrees('landscape-right')).toBe(90);
  });

  it('maps portrait-upside-down to 180 degrees', () => {
    expect(orientationToRotationDegrees('portrait-upside-down')).toBe(180);
  });

  it('maps landscape-left to 270 degrees', () => {
    expect(orientationToRotationDegrees('landscape-left')).toBe(270);
  });

  it('covers all four orientations with distinct values', () => {
    const orientations: DeviceOrientation[] = [
      'portrait',
      'landscape-right',
      'portrait-upside-down',
      'landscape-left',
    ];
    const degrees = orientations.map(orientationToRotationDegrees);
    const unique = new Set(degrees);
    expect(unique.size).toBe(4);
  });

  it('only produces values that are multiples of 90', () => {
    const orientations: DeviceOrientation[] = [
      'portrait',
      'landscape-right',
      'portrait-upside-down',
      'landscape-left',
    ];
    for (const orientation of orientations) {
      const deg = orientationToRotationDegrees(orientation);
      expect(deg % 90).toBe(0);
      expect(deg).toBeGreaterThanOrEqual(0);
      expect(deg).toBeLessThan(360);
    }
  });
});

describe('rotationDegreesToOrientation', () => {
  it('maps 0 degrees to portrait', () => {
    expect(rotationDegreesToOrientation(0)).toBe('portrait');
  });

  it('maps 90 degrees to landscape-right', () => {
    expect(rotationDegreesToOrientation(90)).toBe('landscape-right');
  });

  it('maps 180 degrees to portrait-upside-down', () => {
    expect(rotationDegreesToOrientation(180)).toBe('portrait-upside-down');
  });

  it('maps 270 degrees to landscape-left', () => {
    expect(rotationDegreesToOrientation(270)).toBe('landscape-left');
  });

  it('normalizes negative degrees', () => {
    expect(rotationDegreesToOrientation(-90)).toBe('landscape-left');
    expect(rotationDegreesToOrientation(-180)).toBe('portrait-upside-down');
    expect(rotationDegreesToOrientation(-270)).toBe('landscape-right');
  });

  it('normalizes degrees >= 360', () => {
    expect(rotationDegreesToOrientation(360)).toBe('portrait');
    expect(rotationDegreesToOrientation(450)).toBe('landscape-right');
    expect(rotationDegreesToOrientation(630)).toBe('landscape-left');
  });

  it('defaults to portrait for non-standard values', () => {
    expect(rotationDegreesToOrientation(45)).toBe('portrait');
    expect(rotationDegreesToOrientation(123)).toBe('portrait');
  });
});

describe('round-trip: orientation → degrees → orientation', () => {
  const orientations: DeviceOrientation[] = [
    'portrait',
    'landscape-right',
    'portrait-upside-down',
    'landscape-left',
  ];

  for (const orientation of orientations) {
    it(`round-trips ${orientation}`, () => {
      const degrees = orientationToRotationDegrees(orientation);
      const result = rotationDegreesToOrientation(degrees);
      expect(result).toBe(orientation);
    });
  }
});

describe('isValidRotation', () => {
  it('returns true for valid WebRTC rotations', () => {
    expect(isValidRotation(0)).toBe(true);
    expect(isValidRotation(90)).toBe(true);
    expect(isValidRotation(180)).toBe(true);
    expect(isValidRotation(270)).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isValidRotation(45)).toBe(false);
    expect(isValidRotation(360)).toBe(false);
    expect(isValidRotation(-90)).toBe(false);
    expect(isValidRotation(1)).toBe(false);
  });
});
