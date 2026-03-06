import { StyleSheet, View } from 'react-native';
import { useMemo } from 'react';
import Svg, { Line, Circle } from 'react-native-svg';
import { computeContainRect } from '@/src/utils/contain-rect';
import { JOINT_NAMES, SKELETON_CONNECTIONS } from '@/src/utils/pose-normalization';

type PlaybackPoseOverlayProps = {
  /** Flat 72-element landmarks array: [x, y, confidence] × 24 joints. Normalized 0-1. */
  landmarks: number[] | null;
  /** Container width in points. */
  containerWidth: number;
  /** Container height in points. */
  containerHeight: number;
  /** Video width the landmarks were analyzed at. */
  videoWidth: number;
  /** Video height the landmarks were analyzed at. */
  videoHeight: number;
};

/** Minimum confidence to render a joint. */
const CONFIDENCE_THRESHOLD = 0.3;
/** Joint dot color. */
const JOINT_COLOR = '#00FF88';
/** Skeleton line color. */
const LINE_COLOR = 'rgba(0, 255, 136, 0.6)';

/**
 * SVG overlay that renders a pose skeleton on playback.
 *
 * Landmarks are normalized 0-1 coordinates from video-pose-analysis.
 * This component maps them to the rendered video area within the
 * container, accounting for CONTAIN mode letterboxing.
 */
export const PlaybackPoseOverlay = ({
  landmarks,
  containerWidth,
  containerHeight,
  videoWidth,
  videoHeight,
}: PlaybackPoseOverlayProps) => {
  const videoRect = useMemo(
    () => computeContainRect(videoWidth, videoHeight, containerWidth, containerHeight),
    [videoWidth, videoHeight, containerWidth, containerHeight],
  );

  // Parse flat array into per-joint screen positions
  const joints = useMemo(() => {
    if (!landmarks || landmarks.length !== JOINT_NAMES.length * 3) return null;

    const result: Record<string, { x: number; y: number; confidence: number }> = {};
    for (let i = 0; i < JOINT_NAMES.length; i++) {
      const offset = i * 3;
      result[JOINT_NAMES[i]] = {
        x: videoRect.x + landmarks[offset] * videoRect.width,
        y: videoRect.y + landmarks[offset + 1] * videoRect.height,
        confidence: landmarks[offset + 2],
      };
    }
    return result;
  }, [landmarks, videoRect]);

  if (!joints) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Svg width={containerWidth} height={containerHeight}>
        {/* Skeleton connections */}
        {SKELETON_CONNECTIONS.map(([from, to]) => {
          const jointA = joints[from];
          const jointB = joints[to];
          if (jointA.confidence < CONFIDENCE_THRESHOLD || jointB.confidence < CONFIDENCE_THRESHOLD) {
            return null;
          }
          return (
            <Line
              key={`${from}-${to}`}
              x1={jointA.x}
              y1={jointA.y}
              x2={jointB.x}
              y2={jointB.y}
              stroke={LINE_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}

        {/* Joint dots */}
        {JOINT_NAMES.map((name) => {
          const joint = joints[name];
          if (joint.confidence < CONFIDENCE_THRESHOLD) return null;
          return (
            <Circle
              key={name}
              cx={joint.x}
              cy={joint.y}
              r={3}
              fill={JOINT_COLOR}
              opacity={0.9}
            />
          );
        })}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
