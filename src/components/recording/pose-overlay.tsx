import { StyleSheet, View } from 'react-native';
import { useState, useCallback } from 'react';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import { JOINT_NAMES, SKELETON_CONNECTIONS, POSE_ARRAY_LENGTH } from '@/src/utils/pose-normalization';
import type { JointName } from '@/src/types/pose';

/** Minimum confidence threshold to display a joint. */
const MIN_CONFIDENCE = 0.3;

/** Joint circle radius in SVG units. */
const JOINT_RADIUS = 4;

/** Skeleton line stroke width. */
const LINE_WIDTH = 2;

/** Joint colors by body region. */
const JOINT_COLOR = '#00FF88';
const LINE_COLOR = 'rgba(0, 255, 136, 0.6)';

type PoseOverlayProps = {
  /** Raw 42-element shared value from pose detection. */
  poseSharedValue: SharedValue<number[]>;
  /** Whether the overlay should be rendered. */
  visible: boolean;
};

type ParsedJoint = {
  x: number;
  y: number;
  confidence: number;
};

/**
 * SVG skeleton overlay rendered on top of the camera preview.
 * Reads joint positions from a Reanimated shared value and draws
 * 14 joint circles + skeleton connections.
 *
 * Coordinates are normalized (0-1) and scaled to the container dimensions.
 * Joints with confidence below MIN_CONFIDENCE are hidden.
 */
export const PoseOverlay = ({ poseSharedValue, visible }: PoseOverlayProps) => {
  const [joints, setJoints] = useState<Map<JointName, ParsedJoint>>(new Map());
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Bridge shared value → React state
  const handlePoseData = useCallback((data: number[]) => {
    if (data.length !== POSE_ARRAY_LENGTH) return;

    const newJoints = new Map<JointName, ParsedJoint>();
    for (let i = 0; i < JOINT_NAMES.length; i++) {
      const offset = i * 3;
      newJoints.set(JOINT_NAMES[i], {
        x: data[offset],
        y: data[offset + 1],
        confidence: data[offset + 2],
      });
    }
    setJoints(newJoints);
  }, []);

  useAnimatedReaction(
    () => poseSharedValue.value,
    (current) => {
      if (current.length === POSE_ARRAY_LENGTH) {
        runOnJS(handlePoseData)(current);
      }
    },
    [handlePoseData]
  );

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
        {SKELETON_CONNECTIONS.map(([jointA, jointB], index) => {
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
        {JOINT_NAMES.map((jointName) => {
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
