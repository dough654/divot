import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '../../hooks';
import { useTheme } from '../../context';

export type ArmButtonProps = {
  /** Whether auto-detection is armed. */
  isArmed: boolean;
  /** Callback when button is pressed. */
  onPress: () => void;
  /** Whether the button is disabled. */
  disabled?: boolean;
  /** Size of the button. Defaults to 64. */
  size?: number;
};

/**
 * Arm/disarm toggle for swing auto-detection.
 *
 * Disarmed: circle outline with shield-off icon, muted.
 * Armed: filled pulsing circle with shield-checkmark icon, success color.
 */
export const ArmButton = ({
  isArmed,
  onPress,
  disabled = false,
  size = 64,
}: ArmButtonProps) => {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const haptics = useHaptics();

  const handlePress = useCallback(() => {
    if (!disabled) {
      haptics.heavy();
      onPress();
    }
  }, [disabled, haptics, onPress]);

  // Pulse animation when armed
  useEffect(() => {
    if (isArmed) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    } else {
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [isArmed, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const armedColor = theme.colors.success;
  const disarmedColor = theme.colors.textTertiary;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pressable,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && !disabled && { opacity: 0.8 },
        disabled && { opacity: 0.5 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={isArmed ? 'Disarm auto-detection' : 'Arm auto-detection'}
      accessibilityHint={isArmed ? 'Stops automatic swing detection' : 'Starts automatic swing detection'}
      accessibilityState={{ disabled }}
    >
      <Animated.View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: isArmed ? armedColor : disarmedColor,
            backgroundColor: isArmed ? armedColor : 'transparent',
          },
          animatedStyle,
        ]}
      >
        <Ionicons
          name={isArmed ? 'shield-checkmark' : 'shield-outline'}
          size={size * 0.4}
          color={isArmed ? '#fff' : disarmedColor}
        />
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pressable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
});
