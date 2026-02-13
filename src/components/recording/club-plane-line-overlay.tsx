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
  /** Camera frame aspect ratio (width/height). Used to correct for the preview's
   *  cover-mode crop. If null, no correction is applied (assumes frame fills preview). */
  cameraAspectRatio: number | null;
};

/**
 * Maps a normalized coordinate from full-frame space (0-1) to the preview's
 * visible area, accounting for the cover-mode crop.
 *
 * VisionCamera's preview uses "cover" (resizeAspectFill): it scales the camera
 * feed to fill the container, cropping the excess dimension. The model's
 * coordinates are in full-frame space, so off-center points need adjustment.
 */
const fullFrameToPreview = (
  normalizedX: number,
  normalizedY: number,
  cameraAspect: number,
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number } => {
  const containerAspect = containerWidth / containerHeight;

  if (cameraAspect > containerAspect) {
    // Camera is wider than container — sides are cropped
    const visibleFraction = containerAspect / cameraAspect;
    const offset = (1 - visibleFraction) / 2;
    return {
      x: (normalizedX - offset) / visibleFraction,
      y: normalizedY,
    };
  } else {
    // Camera is taller than container — top/bottom are cropped
    const visibleFraction = cameraAspect / containerAspect;
    const offset = (1 - visibleFraction) / 2;
    return {
      x: normalizedX,
      y: (normalizedY - offset) / visibleFraction,
    };
  }
};

/**
 * SVG overlay that draws a club plane line through the grip and clubhead
 * keypoints, extended to the edges of the camera preview frame.
 *
 * The line helps golfers check their takeaway is "on plane" by providing
 * a visual reference through the club shaft at address.
 *
 * Coordinates are normalized (0-1) in full-frame space and corrected for
 * the preview's cover-mode crop before rendering.
 */
export const ClubPlaneLineOverlay = ({
  clubKeypoints,
  visible,
  cameraAspectRatio,
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

  // Apply cover-crop correction to map from full-frame coords to preview coords
  const toPreview = (x: number, y: number) =>
    cameraAspectRatio
      ? fullFrameToPreview(x, y, cameraAspectRatio, width, height)
      : { x, y };


  const gripPreview = toPreview(grip.x, grip.y);
  const shaftMidPreview = toPreview(shaftMid.x, shaftMid.y);
  const headPreview = toPreview(head.x, head.y);

  // Pick the two best keypoints for the plane line.
  // ShaftMid + head are most reliable (grip is often occluded by hands).
  // Fall back to grip + head if shaftMid confidence is low.
  const pointA = shaftMid.confidence >= MIN_CONFIDENCE ? shaftMidPreview : gripPreview;
  const pointAConf = shaftMid.confidence >= MIN_CONFIDENCE ? shaftMid.confidence : grip.confidence;
  const pointB = headPreview;
  const pointBConf = head.confidence;

  const hasConfidentPair = pointAConf >= MIN_CONFIDENCE && pointBConf >= MIN_CONFIDENCE;
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
          { pt: gripPreview, conf: grip.confidence, color: DOT_COLORS.grip },
          { pt: shaftMidPreview, conf: shaftMid.confidence, color: DOT_COLORS.shaftMid },
          { pt: headPreview, conf: head.confidence, color: DOT_COLORS.head },
        ] as const).map(({ pt, conf, color }) => (
          <Circle
            key={color}
            cx={pt.x * width}
            cy={pt.y * height}
            r={DOT_RADIUS}
            fill={color}
            fillOpacity={Math.max(0.15, conf)}
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
