import { describe, it, expect } from 'vitest';
import { computeAngleDegrees, computeAngleLabelPosition } from '../angle-math';
import type { Point } from '@/src/types/annotation';

describe('computeAngleDegrees', () => {
  const vertex: Point = { x: 0.5, y: 0.5 };

  it('computes a 90 degree angle', () => {
    const rayA: Point = { x: 1, y: 0.5 }; // right
    const rayB: Point = { x: 0.5, y: 0 };  // up
    expect(computeAngleDegrees(vertex, rayA, rayB)).toBe(90);
  });

  it('computes a 180 degree angle (straight line)', () => {
    const rayA: Point = { x: 1, y: 0.5 };   // right
    const rayB: Point = { x: 0, y: 0.5 };   // left
    expect(computeAngleDegrees(vertex, rayA, rayB)).toBe(180);
  });

  it('computes a 45 degree angle', () => {
    const rayA: Point = { x: 1, y: 0.5 };           // right
    const rayB: Point = { x: 1, y: 0 };              // up-right (45deg from right)
    expect(computeAngleDegrees(vertex, rayA, rayB)).toBe(45);
  });

  it('computes an obtuse angle (135 degrees)', () => {
    const rayA: Point = { x: 1, y: 0.5 };           // right
    const rayB: Point = { x: 0, y: 0 };              // up-left (135deg from right)
    expect(computeAngleDegrees(vertex, rayA, rayB)).toBe(135);
  });

  it('computes 0 degrees for coincident rays', () => {
    const rayA: Point = { x: 1, y: 0.5 };
    const rayB: Point = { x: 1, y: 0.5 };
    expect(computeAngleDegrees(vertex, rayA, rayB)).toBe(0);
  });

  it('is commutative (order of rays does not matter)', () => {
    const rayA: Point = { x: 1, y: 0.5 };
    const rayB: Point = { x: 0.5, y: 0 };
    expect(computeAngleDegrees(vertex, rayA, rayB)).toBe(
      computeAngleDegrees(vertex, rayB, rayA)
    );
  });

  it('handles rays in different quadrants', () => {
    // down-right and up-left from center vertex
    const rayA: Point = { x: 1, y: 1 };
    const rayB: Point = { x: 0, y: 0 };
    expect(computeAngleDegrees(vertex, rayA, rayB)).toBe(180);
  });

  it('handles a small acute angle', () => {
    const rayA: Point = { x: 1, y: 0.5 };            // right
    const rayB: Point = { x: 1, y: 0.5 - 0.00873 };  // ~1 degree above right (tan(1°)≈0.01746, half-len)
    const angle = computeAngleDegrees(vertex, rayA, rayB);
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThan(5);
  });
});

describe('computeAngleLabelPosition', () => {
  const vertex: Point = { x: 0.5, y: 0.5 };

  it('returns a point offset from the vertex', () => {
    const rayA: Point = { x: 1, y: 0.5 };
    const rayB: Point = { x: 0.5, y: 0 };
    const label = computeAngleLabelPosition(vertex, rayA, rayB);

    const distance = Math.sqrt(
      (label.x - vertex.x) ** 2 + (label.y - vertex.y) ** 2
    );
    expect(distance).toBeCloseTo(0.08, 2);
  });

  it('respects custom offset', () => {
    const rayA: Point = { x: 1, y: 0.5 };
    const rayB: Point = { x: 0.5, y: 0 };
    const label = computeAngleLabelPosition(vertex, rayA, rayB, 0.12);

    const distance = Math.sqrt(
      (label.x - vertex.x) ** 2 + (label.y - vertex.y) ** 2
    );
    expect(distance).toBeCloseTo(0.12, 2);
  });

  it('places the label between the two rays (bisector)', () => {
    const rayA: Point = { x: 1, y: 0.5 };  // right (0°)
    const rayB: Point = { x: 0.5, y: 0 };  // up (−90° or 270°)
    const label = computeAngleLabelPosition(vertex, rayA, rayB);

    // Bisector of right and up should be upper-right
    expect(label.x).toBeGreaterThan(vertex.x);
    expect(label.y).toBeLessThan(vertex.y);
  });
});
