import { StyleSheet, View } from 'react-native';
import { useState, useMemo } from 'react';
import Svg, { Circle, Line } from 'react-native-svg';
import { JOINT_NAMES, SKELETON_CONNECTIONS, POSE_ARRAY_LENGTH } from '@/src/utils/pose-normalization';

/** Minimum confidence threshold to display a joint. */
const MIN_CONFIDENCE = 0.3;

/** Joint circle radius in SVG units. */
const JOINT_RADIUS = 4;

/** Skeleton line stroke width. */
const LINE_WIDTH = 2;

/** Joint and line colors. */
const JOINT_COLOR = '#00FF88';
const LINE_COLOR = 'rgba(0, 255, 136, 0.6)';

type ParsedJoint = {
  x: number;
  y: number;
  confidence: number;
};

type PoseOverlayProps = {
  /** Raw 42-element pose array, or null if no pose detected. */
  poseData: number[] | null;
  /** Whether the overlay should be rendered. */
  visible: boolean;
};

/**
 * SVG skeleton overlay rendered on top of the camera preview.
 * Draws 14 joint circles + skeleton connections from raw pose data.
 *
 * Coordinates are normalized (0-1) and scaled to the container dimensions.
 * Joints with confidence below MIN_CONFIDENCE are hidden.
 */
export const PoseOverlay = ({ poseData, visible }: PoseOverlayProps) => {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Parse raw array into joint map
  const joints = useMemo(() => {
    if (!poseData || poseData.length !== POSE_ARRAY_LENGTH) return null;

    const map = new Map<string, ParsedJoint>();
    for (let i = 0; i < JOINT_NAMES.length; i++) {
      const offset = i * 3;
      map.set(JOINT_NAMES[i], {
        x: poseData[offset],
        y: poseData[offset + 1],
        confidence: poseData[offset + 2],
      });
    }
    return map;
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

          if (!a || !b || a.confidence < MIN_CONFIDENCE || b.confidence < MIN_CONFIDENCE) {
            return null;
          }

          return (
            <Line
              key={`line-${index}`}
              x1={a.x * width}
              y1={a.y * height}
              x2={b.x * width}
              y2={b.y * height}
              stroke={LINE_COLOR}
              strokeWidth={LINE_WIDTH}
              strokeLinecap="round"
            />
          );
        })}

        {/* Joint circles */}
        {joints && JOINT_NAMES.map((jointName) => {
          const joint = joints.get(jointName);
          if (!joint || joint.confidence < MIN_CONFIDENCE) return null;

          return (
            <Circle
              key={jointName}
              cx={joint.x * width}
              cy={joint.y * height}
              r={JOINT_RADIUS}
              fill={JOINT_COLOR}
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
