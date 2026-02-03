import type { Point } from '@/src/types/annotation';

/**
 * Computes the angle in degrees (0-180) at the vertex between two rays.
 * Uses atan2 to find the angle of each ray relative to the vertex,
 * then returns the absolute difference clamped to 0-180.
 */
export const computeAngleDegrees = (
  vertex: Point,
  rayEndA: Point,
  rayEndB: Point
): number => {
  const angleA = Math.atan2(rayEndA.y - vertex.y, rayEndA.x - vertex.x);
  const angleB = Math.atan2(rayEndB.y - vertex.y, rayEndB.x - vertex.x);

  let diff = Math.abs(angleA - angleB) * (180 / Math.PI);
  if (diff > 180) {
    diff = 360 - diff;
  }

  return Math.round(diff * 10) / 10;
};

/**
 * Computes a position along the angle bisector, offset from the vertex,
 * suitable for placing an angle label.
 */
export const computeAngleLabelPosition = (
  vertex: Point,
  rayEndA: Point,
  rayEndB: Point,
  offset = 0.08
): Point => {
  const angleA = Math.atan2(rayEndA.y - vertex.y, rayEndA.x - vertex.x);
  const angleB = Math.atan2(rayEndB.y - vertex.y, rayEndB.x - vertex.x);

  // Compute the bisector angle, handling the wrap-around correctly
  let bisector = (angleA + angleB) / 2;

  // If the angles are more than PI apart, flip the bisector
  if (Math.abs(angleA - angleB) > Math.PI) {
    bisector += Math.PI;
  }

  return {
    x: vertex.x + offset * Math.cos(bisector),
    y: vertex.y + offset * Math.sin(bisector),
  };
};
