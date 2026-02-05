import { Pressable, View, ViewStyle, StyleProp } from 'react-native';
import { ReactNode, useCallback } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type CardVariant = 'default' | 'elevated' | 'outlined';
export type CardPadding = 'sm' | 'md' | 'lg' | 'none';

export type CardProps = {
  children: ReactNode;
  /** Card style variant. Defaults to 'default'. */
  variant?: CardVariant;
  /** Padding size. Defaults to 'md'. */
  padding?: CardPadding;
  /** Optional press handler - makes the card touchable. */
  onPress?: () => void;
  /** Additional styles to apply to the card. */
  style?: StyleProp<ViewStyle>;
  /** Accessibility label for touchable cards. */
  accessibilityLabel?: string;
  /** Accessibility hint for touchable cards. */
  accessibilityHint?: string;
};

const PADDING_MAP = {
  none: 0,
  sm: 12,
  md: 16,
  lg: 20,
} as const;

/**
 * Reusable card component with multiple variants and padding options.
 * Automatically adapts to light/dark theme.
 *
 * @example
 * // Basic card
 * <Card>
 *   <Text>Content</Text>
 * </Card>
 *
 * @example
 * // Elevated touchable card
 * <Card variant="elevated" onPress={handlePress}>
 *   <Text>Tap me</Text>
 * </Card>
 *
 * @example
 * // Outlined card with large padding
 * <Card variant="outlined" padding="lg">
 *   <Text>Spacious content</Text>
 * </Card>
 */
export const Card = ({
  children,
  variant = 'default',
  padding = 'md',
  onPress,
  style,
  accessibilityLabel,
  accessibilityHint,
}: CardProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Animation state for pressable cards
  const pressed = useSharedValue(0);

  const handlePressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: 100, easing: Easing.out(Easing.cubic) });
  }, [pressed]);

  const handlePressOut = useCallback(() => {
    pressed.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
  }, [pressed]);

  const defaultBg = variant === 'outlined' ? theme.palette.transparent : theme.colors.surface;
  const pressedBg = variant === 'outlined'
    ? (theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)')
    : (theme.isDark ? theme.colors.surfaceElevated : theme.colors.backgroundTertiary);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.02 }],
    backgroundColor: interpolateColor(
      pressed.value,
      [0, 1],
      [defaultBg, pressedBg]
    ),
  }));

  const cardStyle: StyleProp<ViewStyle> = [
    styles.base,
    { padding: PADDING_MAP[padding] },
    variant === 'elevated' && styles.elevated,
    variant === 'outlined' && styles.outlined,
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable
        style={[cardStyle, animatedStyle]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  base: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
  },
  elevated: {
    ...theme.shadows.md,
    shadowOpacity: theme.isDark ? 0.3 : 0.15,
  },
  outlined: {
    backgroundColor: theme.palette.transparent,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
}));
