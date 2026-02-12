import { StyleSheet, View } from 'react-native';
import { useState, useMemo, useRef } from 'react';
import Svg, { Circle, Line } from 'react-native-svg';
import { JOINT_NAMES, SKELETON_CONNECTIONS } from '@/src/utils/pose-normalization';
import { smoothPoseData, jointOpacity, SmoothedPose } from '@/src/utils/skeleton-smoothing';

/** Joint circle radius in SVG units. */
const JOINT_RADIUS = 4;

/** Skeleton line stroke width. */
const LINE_WIDTH = 2;

/** Joint and line colors. */
const JOINT_COLOR = '#00FF88';
const LINE_COLOR_BASE = [0, 255, 136] as const;

type PoseOverlayProps = {
  /** Raw 42-element pose array, or null if no pose detected. */
  poseData: number[] | null;
  /** Whether the overlay should be rendered. */
  visible: boolean;
};

/**
 * SVG skeleton overlay rendered on top of the camera preview.
 * Draws 14 joint circles + skeleton connections from EMA-smoothed pose data.
 *
 * Coordinates are normalized (0-1) and scaled to the container dimensions.
 * Joints fade out gradually when they drop below confidence threshold,
 * persisting for several frames before disappearing.
 */
export const PoseOverlay = ({ poseData, visible }: PoseOverlayProps) => {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const smoothedRef = useRef<SmoothedPose | null>(null);

  // Compute smoothed pose on each poseData change
  const joints = useMemo(() => {
    const smoothed = smoothPoseData(poseData, smoothedRef.current);
    smoothedRef.current = smoothed;
    return smoothed;
  }, [poseData]);

  if (!visible || containerSize.width === 0 || containerSize.height === 0) {
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
        {/* Skeleton connections */}
        {joints && SKELETON_CONNECTIONS.map(([jointA, jointB], index) => {
          const a = joints.get(jointA);
          const b = joints.get(jointB);

          if (!a || !b) return null;

          // Line opacity = minimum of the two endpoint opacities
          const lineOpacity = Math.min(jointOpacity(a.staleness), jointOpacity(b.staleness));
          const [r, g, bl] = LINE_COLOR_BASE;

          return (
            <Line
              key={`line-${index}`}
              x1={a.x * width}
              y1={a.y * height}
              x2={b.x * width}
              y2={b.y * height}
              stroke={`rgba(${r}, ${g}, ${bl}, ${(0.6 * lineOpacity).toFixed(2)})`}
              strokeWidth={LINE_WIDTH}
              strokeLinecap="round"
            />
          );
        })}

        {/* Joint circles */}
        {joints && JOINT_NAMES.map((jointName) => {
          const joint = joints.get(jointName);
          if (!joint) return null;

          const opacity = jointOpacity(joint.staleness);

          return (
            <Circle
              key={jointName}
              cx={joint.x * width}
              cy={joint.y * height}
              r={JOINT_RADIUS}
              fill={JOINT_COLOR}
              fillOpacity={opacity}
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
