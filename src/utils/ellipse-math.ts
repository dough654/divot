import type { Point } from '@/src/types/annotation';

/** Minimum radius threshold — ellipses smaller than this in both axes are discarded. */
export const ELLIPSE_MIN_RADIUS = 0.01;

/**
 * Computes ellipse center and radii from two diagonally opposite bounding-box corners.
 * All values are in normalized 0-1 coordinate space.
 */
export const computeEllipseFromCorners = (
  cornerA: Point,
  cornerB: Point
): { center: Point; radiusX: number; radiusY: number } => {
  const centerX = (cornerA.x + cornerB.x) / 2;
  const centerY = (cornerA.y + cornerB.y) / 2;
  const radiusX = Math.abs(cornerB.x - cornerA.x) / 2;
  const radiusY = Math.abs(cornerB.y - cornerA.y) / 2;
  return { center: { x: centerX, y: centerY }, radiusX, radiusY };
};

/**
 * Returns true if an ellipse is large enough to be worth committing.
 * Discards accidental taps where both radii are below the threshold.
 */
export const isEllipseNonTrivial = (radiusX: number, radiusY: number): boolean =>
  radiusX >= ELLIPSE_MIN_RADIUS || radiusY >= ELLIPSE_MIN_RADIUS;
