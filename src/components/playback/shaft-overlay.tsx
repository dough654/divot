import { StyleSheet, View } from 'react-native';
import { useMemo } from 'react';
import Svg, { Line, Circle, Polyline } from 'react-native-svg';
import type { ShaftFrameResult } from '../../../modules/swing-analysis/src/types';
import { computeContainRect } from '@/src/utils/contain-rect';

type ShaftOverlayProps = {
  /** Current shaft detection result to render. */
  currentShaft: ShaftFrameResult | null;
  /** All shaft results for rendering the trace path. */
  allShaftResults?: ShaftFrameResult[];
  /** Whether to show the cumulative trace path. */
  showTracePath?: boolean;
  /** Container width in points. */
  containerWidth: number;
  /** Container height in points. */
  containerHeight: number;
  /** Natural video width in pixels. */
  videoWidth: number;
  /** Natural video height in pixels. */
  videoHeight: number;
};

/** Shaft line color. */
const SHAFT_COLOR = '#00FF88';
/** Trace path color. */
const TRACE_COLOR = 'rgba(0, 255, 136, 0.4)';
/** Grip end marker color. */
const GRIP_COLOR = '#FFFFFF';
/** Club head marker color. */
const HEAD_COLOR = '#FF4444';

/**
 * SVG overlay that renders the detected club shaft line and optional
 * cumulative trace path during playback.
 *
 * Coordinates from the analysis are normalized 0-1 to the video frame.
 * This component maps them to the actual rendered video area within the
 * container, accounting for CONTAIN mode letterboxing.
 */
export const ShaftOverlay = ({
  currentShaft,
  allShaftResults = [],
  showTracePath = false,
  containerWidth,
  containerHeight,
  videoWidth,
  videoHeight,
}: ShaftOverlayProps) => {
  // Compute the video's rendered rect within the container
  const videoRect = useMemo(
    () => computeContainRect(videoWidth, videoHeight, containerWidth, containerHeight),
    [videoWidth, videoHeight, containerWidth, containerHeight],
  );

  // Build trace path points string
  const tracePoints = useMemo(() => {
    if (!showTracePath || allShaftResults.length === 0) return '';
    return allShaftResults
      .map((frame) => {
        const px = videoRect.x + frame.endPoint.x * videoRect.width;
        const py = videoRect.y + frame.endPoint.y * videoRect.height;
        return `${px},${py}`;
      })
      .join(' ');
  }, [showTracePath, allShaftResults, videoRect]);

  if (!currentShaft && !showTracePath) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Svg width={containerWidth} height={containerHeight}>
        {/* Cumulative trace path through all club head positions */}
        {showTracePath && tracePoints.length > 0 && (
          <Polyline
            points={tracePoints}
            fill="none"
            stroke={TRACE_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Current shaft line */}
        {currentShaft && (
          <>
            <Line
              x1={videoRect.x + currentShaft.startPoint.x * videoRect.width}
              y1={videoRect.y + currentShaft.startPoint.y * videoRect.height}
              x2={videoRect.x + currentShaft.endPoint.x * videoRect.width}
              y2={videoRect.y + currentShaft.endPoint.y * videoRect.height}
              stroke={SHAFT_COLOR}
              strokeWidth={2.5}
              strokeLinecap="round"
            />

            {/* Grip end marker */}
            <Circle
              cx={videoRect.x + currentShaft.startPoint.x * videoRect.width}
              cy={videoRect.y + currentShaft.startPoint.y * videoRect.height}
              r={4}
              fill={GRIP_COLOR}
              opacity={0.9}
            />

            {/* Club head marker */}
            <Circle
              cx={videoRect.x + currentShaft.endPoint.x * videoRect.width}
              cy={videoRect.y + currentShaft.endPoint.y * videoRect.height}
              r={5}
              fill={HEAD_COLOR}
              opacity={0.9}
            />
          </>
        )}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
