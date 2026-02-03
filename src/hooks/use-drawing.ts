import { useState, useCallback, useEffect, useRef } from 'react';
import type { Point, AnnotationLine } from '@/src/types/annotation';
import {
  saveAnnotations,
  loadAnnotations,
} from '@/src/services/annotation/annotation-storage';

const DEFAULT_STROKE_WIDTH = 3;
const DEFAULT_COLOR = '#ffffff';

const PRESET_COLORS = ['#ffffff', '#f44336', '#ffeb3b', '#2196f3'] as const;

type UseDrawingOptions = {
  /** Clip ID for persisting annotations. */
  clipId: string;
};

type UseDrawingResult = {
  /** All completed lines. */
  lines: AnnotationLine[];
  /** Line currently being drawn (null when not drawing). */
  currentLine: AnnotationLine | null;
  /** Currently selected color. */
  color: string;
  /** Available preset colors. */
  presetColors: readonly string[];
  /** Start a new line at the given point. */
  startLine: (point: Point) => void;
  /** Add a point to the current line. */
  addPoint: (point: Point) => void;
  /** End the current line and persist. */
  endLine: () => void;
  /** Remove the last completed line. */
  undo: () => void;
  /** Remove all lines. */
  clearAll: () => void;
  /** Change the active drawing color. */
  setColor: (color: string) => void;
};

/**
 * Generates a unique line ID.
 */
const generateLineId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${random}`;
};

/**
 * Manages freehand drawing state with auto-persistence per clip.
 * Loads saved annotations on mount and saves after each completed line, undo, or clear.
 */
export const useDrawing = ({ clipId }: UseDrawingOptions): UseDrawingResult => {
  const [lines, setLines] = useState<AnnotationLine[]>([]);
  const [currentLine, setCurrentLine] = useState<AnnotationLine | null>(null);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const hasLoaded = useRef(false);

  // Load saved annotations on mount
  useEffect(() => {
    const load = async () => {
      const savedLines = await loadAnnotations(clipId);
      setLines(savedLines);
      hasLoaded.current = true;
    };
    load();
  }, [clipId]);

  const persistLines = useCallback(
    (updatedLines: AnnotationLine[]) => {
      saveAnnotations(clipId, updatedLines);
    },
    [clipId]
  );

  const startLine = useCallback(
    (point: Point) => {
      const newLine: AnnotationLine = {
        id: generateLineId(),
        points: [point],
        color,
        strokeWidth: DEFAULT_STROKE_WIDTH,
      };
      setCurrentLine(newLine);
    },
    [color]
  );

  const addPoint = useCallback((point: Point) => {
    setCurrentLine((prev) => {
      if (!prev) return prev;
      return { ...prev, points: [...prev.points, point] };
    });
  }, []);

  const endLine = useCallback(() => {
    setCurrentLine((prev) => {
      if (!prev || prev.points.length < 2) {
        return null;
      }
      setLines((prevLines) => {
        const updatedLines = [...prevLines, prev];
        persistLines(updatedLines);
        return updatedLines;
      });
      return null;
    });
  }, [persistLines]);

  const undo = useCallback(() => {
    setLines((prev) => {
      if (prev.length === 0) return prev;
      const updatedLines = prev.slice(0, -1);
      persistLines(updatedLines);
      return updatedLines;
    });
  }, [persistLines]);

  const clearAll = useCallback(() => {
    setLines([]);
    persistLines([]);
  }, [persistLines]);

  return {
    lines,
    currentLine,
    color,
    presetColors: PRESET_COLORS,
    startLine,
    addPoint,
    endLine,
    undo,
    clearAll,
    setColor,
  };
};
