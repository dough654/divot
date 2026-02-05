import { useCallback } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';

export type PressAnimationOptions = {
  /** Scale factor on press. Defaults to 0.98 (2% shrink). */
  scale?: number;
  /** Default background color. */
  defaultColor: string;
  /** Background color when pressed. */
  pressedColor: string;
  /** Duration for press-in animation in ms. Defaults to 100. */
  pressInDuration?: number;
  /** Duration for press-out animation in ms. Defaults to 150. */
  pressOutDuration?: number;
  /** Whether animation is disabled. Defaults to false. */
  disabled?: boolean;
};

/**
 * Hook for adding consistent press feedback animation to any Pressable.
 * Returns animated style and press handlers to spread onto AnimatedPressable.
 *
 * @example
 * const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
 *
 * const MyButton = () => {
 *   const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation({
 *     defaultColor: theme.colors.surface,
 *     pressedColor: theme.colors.surfaceElevated,
 *   });
 *
 *   return (
 *     <AnimatedPressable
 *       style={[styles.button, animatedStyle]}
 *       onPressIn={handlePressIn}
 *       onPressOut={handlePressOut}
 *       onPress={handlePress}
 *     >
 *       <Text>Press me</Text>
 *     </AnimatedPressable>
 *   );
 * };
 */
export const usePressAnimation = ({
  scale = 0.98,
  defaultColor,
  pressedColor,
  pressInDuration = 100,
  pressOutDuration = 150,
  disabled = false,
}: PressAnimationOptions) => {
  const pressed = useSharedValue(0);

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    pressed.value = withTiming(1, {
      duration: pressInDuration,
      easing: Easing.out(Easing.cubic),
    });
  }, [pressed, pressInDuration, disabled]);

  const handlePressOut = useCallback(() => {
    if (disabled) return;
    pressed.value = withTiming(0, {
      duration: pressOutDuration,
      easing: Easing.out(Easing.cubic),
    });
  }, [pressed, pressOutDuration, disabled]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: disabled ? 1 : 1 - pressed.value * (1 - scale) }],
    backgroundColor: interpolateColor(
      pressed.value,
      [0, 1],
      [defaultColor, pressedColor]
    ),
  }));

  return {
    animatedStyle,
    handlePressIn,
    handlePressOut,
    /** Raw pressed value (0-1) for custom animations */
    pressed,
  };
};
