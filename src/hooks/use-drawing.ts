import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  Point,
  Annotation,
  AnnotationLine,
  AngleAnnotation,
  EllipseAnnotation,
  DrawingTool,
} from '@/src/types/annotation';
import {
  saveAnnotations,
  loadAnnotations,
} from '@/src/services/annotation/annotation-storage';
import { computeAngleDegrees } from '@/src/utils/angle-math';
import { computeEllipseFromCorners, isEllipseNonTrivial } from '@/src/utils/ellipse-math';

const DEFAULT_STROKE_WIDTH = 3;
const DEFAULT_COLOR = '#ffffff';

const PRESET_COLORS = ['#ffffff', '#f44336', '#ffeb3b', '#2196f3'] as const;

type AnglePhase = 'idle' | 'first-ray' | 'second-ray';

type UseDrawingOptions = {
  /** Clip ID for persisting annotations. */
  clipId: string;
};

type UseDrawingResult = {
  /** All completed annotations. */
  annotations: Annotation[];
  /** Annotation currently being drawn (null when not drawing). */
  currentAnnotation: Annotation | null;
  /** Currently selected drawing tool. */
  activeTool: DrawingTool;
  /** Current phase of angle drawing. */
  anglePhase: AnglePhase;
  /** Currently selected color. */
  color: string;
  /** Available preset colors. */
  presetColors: readonly string[];
  /** Start a new annotation at the given point. */
  startLine: (point: Point) => void;
  /** Add/update a point on the current annotation. */
  addPoint: (point: Point) => void;
  /** End the current gesture and persist if appropriate. */
  endLine: () => void;
  /** Remove the last completed annotation. */
  undo: () => void;
  /** Re-apply the last undone annotation. */
  redo: () => void;
  /** Whether there are annotations that can be redone. */
  canRedo: boolean;
  /** Remove all annotations. */
  clearAll: () => void;
  /** Change the active drawing color. */
  setColor: (color: string) => void;
  /** Change the active drawing tool. */
  setActiveTool: (tool: DrawingTool) => void;
  /** Cancel an in-progress angle measurement. */
  cancelAngle: () => void;
};

/**
 * Generates a unique annotation ID.
 */
const generateId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${random}`;
};

/**
 * Manages drawing state for freehand, straight-line, and angle tools
 * with auto-persistence per clip.
 */
export const useDrawing = ({ clipId }: UseDrawingOptions): UseDrawingResult => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [activeTool, setActiveTool] = useState<DrawingTool>('freehand');
  const [anglePhase, setAnglePhase] = useState<AnglePhase>('idle');
  const hasLoaded = useRef(false);

  const [redoStack, setRedoStack] = useState<Annotation[]>([]);

  // Pending angle state stored in refs to avoid stale closures in gesture callbacks
  const pendingAngleVertex = useRef<Point | null>(null);
  const pendingAngleRayA = useRef<Point | null>(null);

  // Pending ellipse corner stored in ref to avoid stale closures
  const pendingEllipseCorner = useRef<Point | null>(null);

  // Load saved annotations on mount
  useEffect(() => {
    const load = async () => {
      const saved = await loadAnnotations(clipId);
      setAnnotations(saved);
      hasLoaded.current = true;
    };
    load();
  }, [clipId]);

  const persist = useCallback(
    (updated: Annotation[]) => {
      saveAnnotations(clipId, updated);
    },
    [clipId]
  );

  const commitAnnotation = useCallback(
    (annotation: Annotation) => {
      setAnnotations((prev) => {
        const updated = [...prev, annotation];
        persist(updated);
        return updated;
      });
      setRedoStack([]);
    },
    [persist]
  );

  const startLine = useCallback(
    (point: Point) => {
      if (activeTool === 'freehand') {
        const newLine: AnnotationLine = {
          type: 'freehand',
          id: generateId(),
          points: [point],
          color,
          strokeWidth: DEFAULT_STROKE_WIDTH,
        };
        setCurrentAnnotation(newLine);
      } else if (activeTool === 'straight-line') {
        const newLine: AnnotationLine = {
          type: 'straight-line',
          id: generateId(),
          points: [point, point],
          color,
          strokeWidth: DEFAULT_STROKE_WIDTH,
        };
        setCurrentAnnotation(newLine);
      } else if (activeTool === 'ellipse') {
        pendingEllipseCorner.current = point;
        const newEllipse: EllipseAnnotation = {
          type: 'ellipse',
          id: generateId(),
          center: point,
          radiusX: 0,
          radiusY: 0,
          color,
          strokeWidth: DEFAULT_STROKE_WIDTH,
        };
        setCurrentAnnotation(newEllipse);
      } else if (activeTool === 'angle') {
        if (anglePhase === 'idle') {
          // First drag: start the first ray
          setAnglePhase('first-ray');
          pendingAngleVertex.current = point;
          const previewLine: AnnotationLine = {
            type: 'straight-line',
            id: generateId(),
            points: [point, point],
            color,
            strokeWidth: DEFAULT_STROKE_WIDTH,
          };
          setCurrentAnnotation(previewLine);
        } else if (anglePhase === 'second-ray') {
          // Second drag: build the angle annotation from the stored vertex
          const vertex = pendingAngleVertex.current!;
          const rayEndpointA = pendingAngleRayA.current!;
          const angleAnnotation: AngleAnnotation = {
            type: 'angle',
            id: generateId(),
            vertex,
            rayEndpointA,
            rayEndpointB: point,
            angleDegrees: computeAngleDegrees(vertex, rayEndpointA, point),
            color,
            strokeWidth: DEFAULT_STROKE_WIDTH,
          };
          setCurrentAnnotation(angleAnnotation);
        }
      }
    },
    [activeTool, color, anglePhase]
  );

  const addPoint = useCallback(
    (point: Point) => {
      setCurrentAnnotation((prev) => {
        if (!prev) return prev;

        if (prev.type === 'freehand') {
          return { ...prev, points: [...prev.points, point] };
        }

        if (prev.type === 'straight-line') {
          // Rubber-band: replace the second point
          return { ...prev, points: [prev.points[0], point] };
        }

        if (prev.type === 'ellipse') {
          const startCorner = pendingEllipseCorner.current;
          if (!startCorner) return prev;
          const { center, radiusX, radiusY } = computeEllipseFromCorners(startCorner, point);
          return { ...prev, center, radiusX, radiusY };
        }

        if (prev.type === 'angle') {
          // Update the second ray endpoint and recompute angle
          const angleDegrees = computeAngleDegrees(
            prev.vertex,
            prev.rayEndpointA,
            point
          );
          return { ...prev, rayEndpointB: point, angleDegrees };
        }

        return prev;
      });
    },
    []
  );

  const endLine = useCallback(() => {
    setCurrentAnnotation((prev) => {
      if (!prev) return null;

      if (prev.type === 'freehand') {
        if (prev.points.length >= 2) {
          commitAnnotation(prev);
        }
        return null;
      }

      if (prev.type === 'ellipse') {
        if (isEllipseNonTrivial(prev.radiusX, prev.radiusY)) {
          commitAnnotation(prev);
        }
        pendingEllipseCorner.current = null;
        return null;
      }

      if (prev.type === 'straight-line') {
        // If we're in angle first-ray phase, store the ray and wait for second drag
        if (activeTool === 'angle' && anglePhase === 'first-ray') {
          pendingAngleRayA.current = prev.points[1];
          setAnglePhase('second-ray');
          return prev; // Keep first ray visible while waiting for second drag
        }
        // Regular straight line commit
        commitAnnotation(prev);
        return null;
      }

      if (prev.type === 'angle') {
        commitAnnotation(prev);
        // Reset angle state
        pendingAngleVertex.current = null;
        pendingAngleRayA.current = null;
        setAnglePhase('idle');
        return null;
      }

      return null;
    });
  }, [commitAnnotation, activeTool, anglePhase]);

  const cancelAngle = useCallback(() => {
    pendingAngleVertex.current = null;
    pendingAngleRayA.current = null;
    setAnglePhase('idle');
    setCurrentAnnotation(null);
  }, []);

  const handleSetActiveTool = useCallback(
    (tool: DrawingTool) => {
      // Cancel any in-progress angle when switching tools
      if (anglePhase !== 'idle') {
        cancelAngle();
      }
      // Cancel any in-progress ellipse when switching tools
      if (pendingEllipseCorner.current) {
        pendingEllipseCorner.current = null;
        setCurrentAnnotation(null);
      }
      setActiveTool(tool);
    },
    [anglePhase, cancelAngle]
  );

  const undo = useCallback(() => {
    // If mid-angle, cancel it instead of undoing
    if (anglePhase !== 'idle') {
      cancelAngle();
      return;
    }

    setAnnotations((prev) => {
      if (prev.length === 0) return prev;
      const removed = prev[prev.length - 1];
      setRedoStack((stack) => [...stack, removed]);
      const updated = prev.slice(0, -1);
      persist(updated);
      return updated;
    });
  }, [persist, anglePhase, cancelAngle]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const restored = stack[stack.length - 1];
      setAnnotations((prev) => {
        const updated = [...prev, restored];
        persist(updated);
        return updated;
      });
      return stack.slice(0, -1);
    });
  }, [persist]);

  const canRedo = redoStack.length > 0 && currentAnnotation === null;

  const clearAll = useCallback(() => {
    if (anglePhase !== 'idle') {
      cancelAngle();
    }
    setAnnotations([]);
    setRedoStack([]);
    persist([]);
  }, [persist, anglePhase, cancelAngle]);

  return {
    annotations,
    currentAnnotation,
    activeTool,
    anglePhase,
    color,
    presetColors: PRESET_COLORS,
    startLine,
    addPoint,
    endLine,
    undo,
    redo,
    canRedo,
    clearAll,
    setColor,
    setActiveTool: handleSetActiveTool,
    cancelAngle,
  };
};
