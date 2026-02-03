/** A 2D point with coordinates normalized to 0-1 range (resolution-independent). */
export type Point = {
  x: number;
  y: number;
};

/** Available drawing tools. */
export type DrawingTool = 'freehand' | 'straight-line' | 'angle' | 'ellipse';

/** A drawn line (freehand polyline or straight 2-point line). */
export type AnnotationLine = {
  type: 'freehand' | 'straight-line';
  id: string;
  points: Point[];
  color: string;
  strokeWidth: number;
};

/** An angle measurement annotation defined by a vertex and two ray endpoints. */
export type AngleAnnotation = {
  type: 'angle';
  id: string;
  vertex: Point;
  rayEndpointA: Point;
  rayEndpointB: Point;
  /** Computed angle in degrees, 0-180. */
  angleDegrees: number;
  color: string;
  strokeWidth: number;
};

/** An ellipse annotation defined by center and radii. */
export type EllipseAnnotation = {
  type: 'ellipse';
  id: string;
  center: Point;
  /** Half-width, normalized 0-1. */
  radiusX: number;
  /** Half-height, normalized 0-1. */
  radiusY: number;
  color: string;
  strokeWidth: number;
};

/** Any annotation that can be drawn on a video frame. */
export type Annotation = AnnotationLine | AngleAnnotation | EllipseAnnotation;
