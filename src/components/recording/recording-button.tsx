import { StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

export type RecordingButtonProps = {
  /** Whether currently recording. */
  isRecording: boolean;
  /** Callback when button is pressed. */
  onPress: () => void;
  /** Whether the button is disabled. */
  disabled?: boolean;
  /** Size of the button. Defaults to 72. */
  size?: number;
};

/**
 * Circular record button that changes appearance when recording.
 * Shows a red circle when idle, transforms to a rounded square when recording.
 */
export const RecordingButton = ({
  isRecording,
  onPress,
  disabled = false,
  size = 72,
}: RecordingButtonProps) => {
  const scale = useSharedValue(1);
  const innerRadius = useSharedValue(size / 2 - 8);

  // Pulse animation when recording
  useEffect(() => {
    if (isRecording) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      innerRadius.value = withTiming(8, { duration: 200 });
    } else {
      scale.value = withTiming(1, { duration: 200 });
      innerRadius.value = withTiming(size / 2 - 8, { duration: 200 });
    }
  }, [isRecording, scale, innerRadius, size]);

  const animatedOuterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedInnerStyle = useAnimatedStyle(() => ({
    borderRadius: innerRadius.value,
  }));

  const outerSize = size;
  const innerSize = size - 16;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        { width: outerSize, height: outerSize, borderRadius: outerSize / 2 },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Animated.View
        style={[
          styles.outer,
          { width: outerSize, height: outerSize, borderRadius: outerSize / 2 },
          animatedOuterStyle,
        ]}
      >
        <Animated.View
          style={[
            styles.inner,
            {
              width: innerSize,
              height: innerSize,
              backgroundColor: isRecording ? '#ff3b30' : '#ff453a',
            },
            animatedInnerStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  outer: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  inner: {
    backgroundColor: '#ff453a',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
});
