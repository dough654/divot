import { StyleSheet, View } from 'react-native';
import { useRef, useCallback } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Polyline } from 'react-native-svg';
import type { AnnotationLine, Point } from '@/src/types/annotation';

type DrawingOverlayProps = {
  /** Whether the user can draw (enables touch input). */
  drawingEnabled: boolean;
  /** All completed lines to render. */
  lines: AnnotationLine[];
  /** Line currently being drawn. */
  currentLine: AnnotationLine | null;
  /** Called when a new line starts. */
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
 * Transparent SVG overlay for drawing freehand annotations on video frames.
 * Uses react-native-gesture-handler Pan gesture for touch input.
 * Coordinates are normalized (0-1) so annotations are resolution-independent.
 */
export const DrawingOverlay = ({
  drawingEnabled,
  lines,
  currentLine,
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

  const allLines = currentLine ? [...lines, currentLine] : lines;
  const hasLines = allLines.length > 0;

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={[
          styles.overlay,
          !drawingEnabled && styles.passthrough,
        ]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          containerSize.current = { width, height };
        }}
      >
        {hasLines && (
          <Svg style={StyleSheet.absoluteFill}>
            {allLines.map((line) => (
              <Polyline
                key={line.id}
                points={toSvgPointsString(
                  line.points,
                  containerSize.current.width,
                  containerSize.current.height
                )}
                fill="none"
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
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
