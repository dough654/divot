import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useEffect, useCallback } from 'react';
import { useHaptics } from '../../hooks';
import { useTheme } from '../../context';

export type RecordingButtonProps = {
  /** Whether currently recording. */
  isRecording: boolean;
  /** Callback when button is pressed. */
  onPress: () => void;
  /** Whether the button is disabled. */
  disabled?: boolean;
  /** Size of the button. Defaults to 44. */
  size?: number;
};

/**
 * Record button — Stark style: red border circle with square inner when recording.
 */
export const RecordingButton = ({
  isRecording,
  onPress,
  disabled = false,
  size = 44,
}: RecordingButtonProps) => {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const innerRadius = useSharedValue(size / 2 - 6);
  const innerDimension = useSharedValue(size - 12);
  const haptics = useHaptics();

  const handlePress = useCallback(() => {
    if (!disabled) {
      haptics.heavy();
      onPress();
    }
  }, [disabled, haptics, onPress]);

  // Pulse animation when recording
  useEffect(() => {
    if (isRecording) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      innerRadius.value = withTiming(4, { duration: 200 });
      // Shrink inner to fit as a square inscribed in the circle
      const squareSize = Math.floor((size - 4) / Math.SQRT2);
      innerDimension.value = withTiming(squareSize, { duration: 200 });
    } else {
      scale.value = withTiming(1, { duration: 200 });
      innerRadius.value = withTiming(size / 2 - 6, { duration: 200 });
      innerDimension.value = withTiming(size - 12, { duration: 200 });
    }
  }, [isRecording, scale, innerRadius, innerDimension, size]);

  const animatedOuterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedInnerStyle = useAnimatedStyle(() => ({
    width: innerDimension.value,
    height: innerDimension.value,
    borderRadius: innerRadius.value,
  }));

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        pressed && !disabled && { opacity: 0.8 },
        disabled && { opacity: 0.5 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
      accessibilityHint={isRecording ? 'Stops video recording' : 'Starts video recording'}
      accessibilityState={{ disabled }}
    >
      <Animated.View
        style={[
          {
            justifyContent: 'center' as const,
            alignItems: 'center' as const,
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: theme.colors.recording,
          },
          animatedOuterStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              backgroundColor: theme.colors.recording,
            },
            animatedInnerStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
};
