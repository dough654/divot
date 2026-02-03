import { StyleSheet, View } from 'react-native';
import { useRef, useCallback } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Polyline, Line } from 'react-native-svg';
import type { Annotation, AnnotationLine, Point } from '@/src/types/annotation';
import { AngleAnnotationRenderer } from './angle-annotation-renderer';

type DrawingOverlayProps = {
  /** Whether the user can draw (enables touch input). */
  drawingEnabled: boolean;
  /** All completed annotations to render. */
  annotations: Annotation[];
  /** Annotation currently being drawn. */
  currentAnnotation: Annotation | null;
  /** Called when a new annotation starts. */
  onLineStart: (point: Point) => void;
  /** Called as the user drags. */
  onLineMove: (point: Point) => void;
  /** Called when the touch ends. */
  onLineEnd: () => void;
};

/**
 * Converts an AnnotationLine's normalized points to an SVG points string.
 * Scales normalized (0-1) coordinates to the given width/height.
 */
const toSvgPointsString = (
  points: Point[],
  width: number,
  height: number
): string => {
  return points.map((p) => `${p.x * width},${p.y * height}`).join(' ');
};

/**
 * Renders a single line annotation (freehand or straight-line).
 */
const LineAnnotationRenderer = ({
  annotation,
  width,
  height,
}: {
  annotation: AnnotationLine;
  width: number;
  height: number;
}) => {
  if (annotation.type === 'straight-line' && annotation.points.length === 2) {
    const [start, end] = annotation.points;
    return (
      <Line
        x1={start.x * width}
        y1={start.y * height}
        x2={end.x * width}
        y2={end.y * height}
        stroke={annotation.color}
        strokeWidth={annotation.strokeWidth}
        strokeLinecap="round"
      />
    );
  }

  return (
    <Polyline
      points={toSvgPointsString(annotation.points, width, height)}
      fill="none"
      stroke={annotation.color}
      strokeWidth={annotation.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
};

/**
 * Transparent SVG overlay for drawing annotations on video frames.
 * Uses react-native-gesture-handler Pan gesture for touch input.
 * Coordinates are normalized (0-1) so annotations are resolution-independent.
 */
export const DrawingOverlay = ({
  drawingEnabled,
  annotations,
  currentAnnotation,
  onLineStart,
  onLineMove,
  onLineEnd,
}: DrawingOverlayProps) => {
  const containerSize = useRef({ width: 0, height: 0 });

  const normalizePoint = useCallback((absoluteX: number, absoluteY: number): Point => {
    const { width, height } = containerSize.current;
    if (width === 0 || height === 0) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, absoluteX / width)),
      y: Math.max(0, Math.min(1, absoluteY / height)),
    };
  }, []);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onStart((event) => {
      const point = normalizePoint(event.x, event.y);
      onLineStart(point);
    })
    .onUpdate((event) => {
      const point = normalizePoint(event.x, event.y);
      onLineMove(point);
    })
    .onEnd(() => {
      onLineEnd();
    })
    .minDistance(0)
    .enabled(drawingEnabled);

  const allAnnotations = currentAnnotation
    ? [...annotations, currentAnnotation]
    : annotations;
  const hasAnnotations = allAnnotations.length > 0;

  const { width, height } = containerSize.current;

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={[
          styles.overlay,
          !drawingEnabled && styles.passthrough,
        ]}
        onLayout={(event) => {
          const layout = event.nativeEvent.layout;
          containerSize.current = { width: layout.width, height: layout.height };
        }}
      >
        {hasAnnotations && (
          <Svg style={StyleSheet.absoluteFill}>
            {allAnnotations.map((annotation) => {
              if (annotation.type === 'angle') {
                return (
                  <AngleAnnotationRenderer
                    key={annotation.id}
                    annotation={annotation}
                    width={width}
                    height={height}
                  />
                );
              }
              return (
                <LineAnnotationRenderer
                  key={annotation.id}
                  annotation={annotation}
                  width={width}
                  height={height}
                />
              );
            })}
          </Svg>
        )}
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  passthrough: {
    pointerEvents: 'none',
  },
});
