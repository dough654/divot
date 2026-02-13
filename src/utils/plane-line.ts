type Point2D = { x: number; y: number };

type LineEndpoints = { start: Point2D; end: Point2D };

/**
 * Extends a line through two points to the edges of a 0-1 normalized frame.
 * Returns the two intersection points with the frame boundary.
 *
 * Handles vertical, horizontal, and diagonal lines. The returned points
 * are clamped to the [0, 1] frame bounds.
 */
export const extendLineToBounds = (p1: Point2D, p2: Point2D): LineEndpoints | null => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  // Degenerate case: both points are the same
  if (Math.abs(dx) < 1e-10 && Math.abs(dy) < 1e-10) {
    return null;
  }

  // Near-vertical line (|dx| < epsilon)
  if (Math.abs(dx) < 1e-10) {
    return {
      start: { x: p1.x, y: 0 },
      end: { x: p1.x, y: 1 },
    };
  }

  // Near-horizontal line (|dy| < epsilon)
  if (Math.abs(dy) < 1e-10) {
    return {
      start: { x: 0, y: p1.y },
      end: { x: 1, y: p1.y },
    };
  }

  // General case: line y = mx + b
  const slope = dy / dx;
  const intercept = p1.y - slope * p1.x;

  // Find intersections with all 4 frame edges
  const intersections: Point2D[] = [];

  // Left edge (x=0): y = b
  const yAtLeft = intercept;
  if (yAtLeft >= 0 && yAtLeft <= 1) {
    intersections.push({ x: 0, y: yAtLeft });
  }

  // Right edge (x=1): y = m + b
  const yAtRight = slope + intercept;
  if (yAtRight >= 0 && yAtRight <= 1) {
    intersections.push({ x: 1, y: yAtRight });
  }

  // Top edge (y=0): x = -b/m
  const xAtTop = -intercept / slope;
  if (xAtTop > 0 && xAtTop < 1) {
    intersections.push({ x: xAtTop, y: 0 });
  }

  // Bottom edge (y=1): x = (1-b)/m
  const xAtBottom = (1 - intercept) / slope;
  if (xAtBottom > 0 && xAtBottom < 1) {
    intersections.push({ x: xAtBottom, y: 1 });
  }

  if (intersections.length < 2) {
    return null;
  }

  // Sort by distance from p1 to get consistent start/end ordering
  intersections.sort((a, b) => {
    const distA = (a.x - p1.x) ** 2 + (a.y - p1.y) ** 2;
    const distB = (b.x - p1.x) ** 2 + (b.y - p1.y) ** 2;
    return distA - distB;
  });

  return {
    start: intersections[0],
    end: intersections[intersections.length - 1],
  };
};
