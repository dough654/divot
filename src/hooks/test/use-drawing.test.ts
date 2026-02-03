import { describe, it, expect } from 'vitest';
import {
  computeEllipseFromCorners,
  isEllipseNonTrivial,
  ELLIPSE_MIN_RADIUS,
} from '@/src/utils/ellipse-math';
import type { Point, Annotation } from '@/src/types/annotation';

describe('computeEllipseFromCorners', () => {
  it('computes center and radii from opposite corners', () => {
    const cornerA: Point = { x: 0.2, y: 0.3 };
    const cornerB: Point = { x: 0.8, y: 0.7 };
    const result = computeEllipseFromCorners(cornerA, cornerB);

    expect(result.center.x).toBeCloseTo(0.5);
    expect(result.center.y).toBeCloseTo(0.5);
    expect(result.radiusX).toBeCloseTo(0.3);
    expect(result.radiusY).toBeCloseTo(0.2);
  });

  it('handles reversed corners (bottom-right to top-left)', () => {
    const cornerA: Point = { x: 0.8, y: 0.7 };
    const cornerB: Point = { x: 0.2, y: 0.3 };
    const result = computeEllipseFromCorners(cornerA, cornerB);

    expect(result.center.x).toBeCloseTo(0.5);
    expect(result.center.y).toBeCloseTo(0.5);
    expect(result.radiusX).toBeCloseTo(0.3);
    expect(result.radiusY).toBeCloseTo(0.2);
  });

  it('returns zero radii when corners are the same point', () => {
    const point: Point = { x: 0.5, y: 0.5 };
    const result = computeEllipseFromCorners(point, point);

    expect(result.center.x).toBeCloseTo(0.5);
    expect(result.center.y).toBeCloseTo(0.5);
    expect(result.radiusX).toBe(0);
    expect(result.radiusY).toBe(0);
  });

  it('produces a circle when corners form a square bounding box', () => {
    const cornerA: Point = { x: 0.3, y: 0.3 };
    const cornerB: Point = { x: 0.7, y: 0.7 };
    const result = computeEllipseFromCorners(cornerA, cornerB);

    expect(result.radiusX).toBeCloseTo(result.radiusY);
  });

  it('handles corners at edges of normalized space', () => {
    const cornerA: Point = { x: 0, y: 0 };
    const cornerB: Point = { x: 1, y: 1 };
    const result = computeEllipseFromCorners(cornerA, cornerB);

    expect(result.center.x).toBeCloseTo(0.5);
    expect(result.center.y).toBeCloseTo(0.5);
    expect(result.radiusX).toBeCloseTo(0.5);
    expect(result.radiusY).toBeCloseTo(0.5);
  });

  it('handles a horizontal drag (tall, narrow ellipse)', () => {
    const cornerA: Point = { x: 0.4, y: 0.1 };
    const cornerB: Point = { x: 0.6, y: 0.9 };
    const result = computeEllipseFromCorners(cornerA, cornerB);

    expect(result.radiusX).toBeCloseTo(0.1);
    expect(result.radiusY).toBeCloseTo(0.4);
    expect(result.radiusY).toBeGreaterThan(result.radiusX);
  });
});

describe('isEllipseNonTrivial', () => {
  it('returns true when both radii exceed threshold', () => {
    expect(isEllipseNonTrivial(0.05, 0.05)).toBe(true);
  });

  it('returns true when only radiusX exceeds threshold', () => {
    expect(isEllipseNonTrivial(0.02, 0.005)).toBe(true);
  });

  it('returns true when only radiusY exceeds threshold', () => {
    expect(isEllipseNonTrivial(0.005, 0.02)).toBe(true);
  });

  it('returns false when both radii are below threshold', () => {
    expect(isEllipseNonTrivial(0.005, 0.005)).toBe(false);
  });

  it('returns false when both radii are zero', () => {
    expect(isEllipseNonTrivial(0, 0)).toBe(false);
  });

  it('returns true when radiusX is exactly at threshold', () => {
    expect(isEllipseNonTrivial(ELLIPSE_MIN_RADIUS, 0)).toBe(true);
  });

  it('returns false when both radii are just below threshold', () => {
    expect(isEllipseNonTrivial(ELLIPSE_MIN_RADIUS - 0.001, ELLIPSE_MIN_RADIUS - 0.001)).toBe(false);
  });
});

describe('redo stack semantics (pure data)', () => {
  /** Simulates the redo stack logic from useDrawing as pure functions. */
  const simulateUndo = (
    annotations: Annotation[],
    redoStack: Annotation[]
  ): { annotations: Annotation[]; redoStack: Annotation[] } => {
    if (annotations.length === 0) return { annotations, redoStack };
    const removed = annotations[annotations.length - 1];
    return {
      annotations: annotations.slice(0, -1),
      redoStack: [...redoStack, removed],
    };
  };

  const simulateRedo = (
    annotations: Annotation[],
    redoStack: Annotation[]
  ): { annotations: Annotation[]; redoStack: Annotation[] } => {
    if (redoStack.length === 0) return { annotations, redoStack };
    const restored = redoStack[redoStack.length - 1];
    return {
      annotations: [...annotations, restored],
      redoStack: redoStack.slice(0, -1),
    };
  };

  const simulateCommit = (
    annotations: Annotation[],
    annotation: Annotation
  ): { annotations: Annotation[]; redoStack: Annotation[] } => ({
    annotations: [...annotations, annotation],
    redoStack: [],
  });

  const makeLine = (id: string): Annotation => ({
    type: 'freehand',
    id,
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    color: '#fff',
    strokeWidth: 3,
  });

  it('undo moves last annotation to redo stack', () => {
    const a = makeLine('a');
    const b = makeLine('b');
    const result = simulateUndo([a, b], []);

    expect(result.annotations).toEqual([a]);
    expect(result.redoStack).toEqual([b]);
  });

  it('redo restores last undone annotation', () => {
    const a = makeLine('a');
    const b = makeLine('b');

    let state = simulateUndo([a, b], []);
    state = simulateRedo(state.annotations, state.redoStack);

    expect(state.annotations).toEqual([a, b]);
    expect(state.redoStack).toEqual([]);
  });

  it('multiple undo/redo cycles are reversible', () => {
    const a = makeLine('a');
    const b = makeLine('b');
    const c = makeLine('c');

    let state = { annotations: [a, b, c], redoStack: [] as Annotation[] };

    // Undo twice
    state = simulateUndo(state.annotations, state.redoStack);
    state = simulateUndo(state.annotations, state.redoStack);

    expect(state.annotations).toEqual([a]);
    expect(state.redoStack).toEqual([c, b]);

    // Redo twice
    state = simulateRedo(state.annotations, state.redoStack);
    state = simulateRedo(state.annotations, state.redoStack);

    expect(state.annotations).toEqual([a, b, c]);
    expect(state.redoStack).toEqual([]);
  });

  it('new commit clears redo stack', () => {
    const a = makeLine('a');
    const b = makeLine('b');
    const d = makeLine('d');

    let state = { annotations: [a, b], redoStack: [] as Annotation[] };
    state = simulateUndo(state.annotations, state.redoStack);
    // b is on redo stack, a is in annotations
    const committed = simulateCommit(state.annotations, d);

    expect(committed.annotations).toEqual([a, d]);
    expect(committed.redoStack).toEqual([]);
  });

  it('undo on empty annotations is a no-op', () => {
    const result = simulateUndo([], []);
    expect(result.annotations).toEqual([]);
    expect(result.redoStack).toEqual([]);
  });

  it('redo on empty stack is a no-op', () => {
    const a = makeLine('a');
    const result = simulateRedo([a], []);
    expect(result.annotations).toEqual([a]);
    expect(result.redoStack).toEqual([]);
  });
});
