import { StyleSheet, View } from 'react-native';
import { useState } from 'react';
import Svg, { Line } from 'react-native-svg';
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

type ClubPlaneLineOverlayProps = {
  /** Club keypoints (grip + head), or null if no club detected. */
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
 * Coordinates are normalized (0-1) and scaled to the container dimensions.
 */
export const ClubPlaneLineOverlay = ({ clubKeypoints, visible }: ClubPlaneLineOverlayProps) => {
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

  // Pick the two best keypoints for the plane line.
  // ShaftMid + head are most reliable (grip is often occluded by hands).
  // Fall back to grip + head if shaftMid confidence is low.
  const pointA = shaftMid.confidence >= MIN_CONFIDENCE ? shaftMid : grip;
  const pointB = head;

  if (pointA.confidence < MIN_CONFIDENCE || pointB.confidence < MIN_CONFIDENCE) {
    return (
      <View
        style={styles.overlay}
        pointerEvents="none"
        onLayout={(event) => {
          const layout = event.nativeEvent.layout;
          setContainerSize({ width: layout.width, height: layout.height });
        }}
      />
    );
  }

  const lineEndpoints = extendLineToBounds(
    { x: pointA.x, y: pointA.y },
    { x: pointB.x, y: pointB.y },
  );

  if (!lineEndpoints) {
    return <View style={styles.overlay} pointerEvents="none" />;
  }

  const { width, height } = containerSize;

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
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
