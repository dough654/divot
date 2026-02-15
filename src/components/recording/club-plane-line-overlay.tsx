import { StyleSheet, View } from 'react-native';
import { useState } from 'react';
import Svg, { Circle, Line } from 'react-native-svg';
import type { ClubKeypoints } from '@/src/hooks/use-club-detection';
import { extendLineToBounds } from '@/src/utils/plane-line';

/** Minimum keypoint confidence to draw the plane line. */
const MIN_CONFIDENCE = 0.3;

/** Plane line color — cyan to stand out from the green skeleton overlay. */
const LINE_COLOR = '#00E5FF';

/** Line width in SVG units. */
const LINE_WIDTH = 2.5;

/** Line opacity. */
const LINE_OPACITY = 0.8;

/** Debug dot radius in SVG units. */
const DOT_RADIUS = 6;

/** Debug dot colors: grip = red, shaftMid = yellow, head = magenta. */
const DOT_COLORS = {
  grip: '#FF0000',
  shaftMid: '#FFFF00',
  head: '#FF00FF',
} as const;

type ClubPlaneLineOverlayProps = {
  /** Club keypoints from the model, in full-frame normalized coords (0-1). */
  clubKeypoints: ClubKeypoints | null;
  /** Whether the overlay should be rendered. */
  visible: boolean;
};

/**
 * SVG overlay that draws a club plane line through the grip and clubhead
 * keypoints, extended to the edges of the camera preview frame.
 *
 * The line helps golfers check their takeaway is "on plane" by providing
 * a visual reference through the club shaft at address.
 *
 * Coordinates are normalized (0-1) in full-frame space, matching how the
 * pose overlay renders (direct multiply by container dimensions).
 */
export const ClubPlaneLineOverlay = ({
  clubKeypoints,
  visible,
}: ClubPlaneLineOverlayProps) => {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  if (!visible || !clubKeypoints || containerSize.width === 0 || containerSize.height === 0) {
    return (
      <View
        style={styles.overlay}
        pointerEvents="none"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setContainerSize({ width, height });
        }}
      />
    );
  }

  const { grip, shaftMid, head } = clubKeypoints;
  const { width, height } = containerSize;

  // Pick the two best keypoints for the plane line.
  // ShaftMid + head are most reliable (grip is often occluded by hands).
  // Fall back to grip + head if shaftMid confidence is low.
  const pointA = shaftMid.confidence >= MIN_CONFIDENCE ? shaftMid : grip;
  const pointB = head;

  const hasConfidentPair = pointA.confidence >= MIN_CONFIDENCE && pointB.confidence >= MIN_CONFIDENCE;
  const lineEndpoints = hasConfidentPair
    ? extendLineToBounds({ x: pointA.x, y: pointA.y }, { x: pointB.x, y: pointB.y })
    : null;

  return (
    <View
      style={styles.overlay}
      pointerEvents="none"
      onLayout={(event) => {
        const layout = event.nativeEvent.layout;
        setContainerSize({ width: layout.width, height: layout.height });
      }}
    >
      <Svg style={StyleSheet.absoluteFill}>
        {lineEndpoints && (
          <Line
            x1={lineEndpoints.start.x * width}
            y1={lineEndpoints.start.y * height}
            x2={lineEndpoints.end.x * width}
            y2={lineEndpoints.end.y * height}
            stroke={LINE_COLOR}
            strokeWidth={LINE_WIDTH}
            strokeOpacity={LINE_OPACITY}
            strokeLinecap="round"
          />
        )}
        {/* Debug dots — grip (red), shaftMid (yellow), head (magenta).
            Opacity reflects confidence so low-conf points appear faded.
            Always rendered when we have data, even if line is suppressed. */}
        {([
          { pt: grip, color: DOT_COLORS.grip },
          { pt: shaftMid, color: DOT_COLORS.shaftMid },
          { pt: head, color: DOT_COLORS.head },
        ] as const).map(({ pt, color }) => (
          <Circle
            key={color}
            cx={pt.x * width}
            cy={pt.y * height}
            r={DOT_RADIUS}
            fill={color}
            fillOpacity={Math.max(0.15, pt.confidence)}
          />
        ))}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
