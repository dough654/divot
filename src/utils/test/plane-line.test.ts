import { describe, it, expect } from 'vitest';
import { extendLineToBounds } from '../plane-line';

describe('extendLineToBounds', () => {
  it('returns null for degenerate input (same point)', () => {
    expect(extendLineToBounds({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toBeNull();
  });

  it('handles a vertical line', () => {
    const result = extendLineToBounds({ x: 0.3, y: 0.4 }, { x: 0.3, y: 0.6 });
    expect(result).not.toBeNull();
    expect(result!.start.x).toBeCloseTo(0.3);
    expect(result!.start.y).toBeCloseTo(0);
    expect(result!.end.x).toBeCloseTo(0.3);
    expect(result!.end.y).toBeCloseTo(1);
  });

  it('handles a horizontal line', () => {
    const result = extendLineToBounds({ x: 0.2, y: 0.7 }, { x: 0.8, y: 0.7 });
    expect(result).not.toBeNull();
    expect(result!.start.y).toBeCloseTo(0.7);
    expect(result!.end.y).toBeCloseTo(0.7);
    // Endpoints should span the full width
    const xs = [result!.start.x, result!.end.x].sort();
    expect(xs[0]).toBeCloseTo(0);
    expect(xs[1]).toBeCloseTo(1);
  });

  it('extends a diagonal line (slope = 1) through center to frame edges', () => {
    // Line through (0.3, 0.3) and (0.7, 0.7): slope=1, intercept=0
    const result = extendLineToBounds({ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 });
    expect(result).not.toBeNull();
    // y = x, so intersects corners (0,0) and (1,1)
    const points = [result!.start, result!.end].sort((a, b) => a.x - b.x);
    expect(points[0].x).toBeCloseTo(0);
    expect(points[0].y).toBeCloseTo(0);
    expect(points[1].x).toBeCloseTo(1);
    expect(points[1].y).toBeCloseTo(1);
  });

  it('extends a steep line that exits through top and bottom', () => {
    // Line through (0.5, 0.3) and (0.5, 0.7) is vertical — already tested.
    // Near-vertical: through (0.5, 0.2) and (0.51, 0.8) — steep slope
    const result = extendLineToBounds({ x: 0.5, y: 0.2 }, { x: 0.51, y: 0.8 });
    expect(result).not.toBeNull();
    // Should exit through top (y=0) and bottom (y=1)
    const points = [result!.start, result!.end].sort((a, b) => a.y - b.y);
    expect(points[0].y).toBeCloseTo(0);
    expect(points[1].y).toBeCloseTo(1);
  });

  it('extends a shallow line that exits through left and right', () => {
    // Through (0.2, 0.5) and (0.8, 0.51) — very shallow slope
    const result = extendLineToBounds({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.51 });
    expect(result).not.toBeNull();
    const points = [result!.start, result!.end].sort((a, b) => a.x - b.x);
    expect(points[0].x).toBeCloseTo(0);
    expect(points[1].x).toBeCloseTo(1);
  });

  it('handles a line with negative slope', () => {
    // Through (0.2, 0.8) and (0.8, 0.2): slope = -1, intercept = 1
    const result = extendLineToBounds({ x: 0.2, y: 0.8 }, { x: 0.8, y: 0.2 });
    expect(result).not.toBeNull();
    // y = -x + 1, intersects (0, 1) and (1, 0)
    const points = [result!.start, result!.end].sort((a, b) => a.x - b.x);
    expect(points[0].x).toBeCloseTo(0);
    expect(points[0].y).toBeCloseTo(1);
    expect(points[1].x).toBeCloseTo(1);
    expect(points[1].y).toBeCloseTo(0);
  });

  it('handles a line near the edge of the frame', () => {
    // Vertical line at x=0.01
    const result = extendLineToBounds({ x: 0.01, y: 0.3 }, { x: 0.01, y: 0.7 });
    expect(result).not.toBeNull();
    expect(result!.start.x).toBeCloseTo(0.01);
    expect(result!.end.x).toBeCloseTo(0.01);
  });

  it('handles points outside 0-1 range gracefully', () => {
    // Points slightly outside — line should still intersect the frame
    const result = extendLineToBounds({ x: -0.1, y: 0.5 }, { x: 1.1, y: 0.5 });
    expect(result).not.toBeNull();
    expect(result!.start.y).toBeCloseTo(0.5);
    expect(result!.end.y).toBeCloseTo(0.5);
  });

  it('consistent endpoint ordering regardless of input point order', () => {
    const resultAB = extendLineToBounds({ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 });
    const resultBA = extendLineToBounds({ x: 0.7, y: 0.7 }, { x: 0.3, y: 0.3 });
    expect(resultAB).not.toBeNull();
    expect(resultBA).not.toBeNull();

    // Both should produce lines that span the same frame edges
    const pointsAB = [resultAB!.start, resultAB!.end].sort((a, b) => a.x - b.x);
    const pointsBA = [resultBA!.start, resultBA!.end].sort((a, b) => a.x - b.x);
    expect(pointsAB[0].x).toBeCloseTo(pointsBA[0].x);
    expect(pointsAB[0].y).toBeCloseTo(pointsBA[0].y);
    expect(pointsAB[1].x).toBeCloseTo(pointsBA[1].x);
    expect(pointsAB[1].y).toBeCloseTo(pointsBA[1].y);
  });

  it('golf club at address: near-vertical line slightly tilted', () => {
    // Typical club at address: grip near (0.4, 0.4), head near (0.45, 0.85)
    const result = extendLineToBounds({ x: 0.4, y: 0.4 }, { x: 0.45, y: 0.85 });
    expect(result).not.toBeNull();
    // Steep line should exit through top and bottom edges
    const points = [result!.start, result!.end].sort((a, b) => a.y - b.y);
    expect(points[0].y).toBeCloseTo(0);
    expect(points[1].y).toBeCloseTo(1);
  });
});
