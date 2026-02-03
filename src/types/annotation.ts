/** A 2D point with coordinates normalized to 0-1 range (resolution-independent). */
export type Point = {
  x: number;
  y: number;
};

/** A single drawn line consisting of a series of points. */
export type AnnotationLine = {
  id: string;
  points: Point[];
  color: string;
  strokeWidth: number;
};
