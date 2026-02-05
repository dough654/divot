import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { useCallback } from 'react';
import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles, useHaptics } from '../../hooks';
import type { Theme } from '../../context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Custom accessibility label. Defaults to title. */
  accessibilityLabel?: string;
  /** Hint describing what happens when pressed. */
  accessibilityHint?: string;
};

/**
 * Reusable button component with multiple variants.
 * Automatically adapts to light/dark theme.
 */
export const Button = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const haptics = useHaptics();
  const isDisabled = disabled || loading;

  // Animation state
  const pressed = useSharedValue(0);

  const handlePressIn = useCallback(() => {
    if (!isDisabled) haptics.light();
    pressed.value = withTiming(1, { duration: 100, easing: Easing.out(Easing.cubic) });
  }, [pressed, isDisabled, haptics]);

  const handlePressOut = useCallback(() => {
    pressed.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
  }, [pressed]);

  const getBackgroundColor = () => {
    if (isDisabled) return theme.isDark ? '#333' : '#ccc';
    switch (variant) {
      case 'primary':
        return theme.colors.primary;
      case 'secondary':
        return theme.colors.surface;
      case 'outline':
        return theme.palette.transparent;
      case 'danger':
        return theme.colors.error;
    }
  };

  const getPressedBackgroundColor = () => {
    if (isDisabled) return getBackgroundColor();
    switch (variant) {
      case 'primary':
        return theme.colors.primaryHover;
      case 'secondary':
        return theme.isDark ? theme.colors.surfaceElevated : theme.colors.backgroundTertiary;
      case 'outline':
        return theme.isDark ? 'rgba(76, 175, 80, 0.15)' : 'rgba(76, 175, 80, 0.1)';
      case 'danger':
        return '#d32f2f'; // Darker red
    }
  };

  const getTextColor = () => {
    if (isDisabled) return theme.colors.textTertiary;
    switch (variant) {
      case 'primary':
      case 'danger':
        return theme.palette.white;
      case 'secondary':
        return theme.colors.text;
      case 'outline':
        return theme.colors.primary;
    }
  };

  const getBorderColor = () => {
    if (variant === 'outline') {
      return isDisabled ? theme.colors.textTertiary : theme.colors.primary;
    }
    return theme.palette.transparent;
  };

  const defaultBg = getBackgroundColor();
  const pressedBg = getPressedBackgroundColor();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isDisabled ? 1 : 1 - pressed.value * 0.02 }],
    backgroundColor: interpolateColor(
      pressed.value,
      [0, 1],
      [defaultBg, pressedBg]
    ),
  }));

  return (
    <AnimatedPressable
      style={[
        styles.button,
        { borderColor: getBorderColor() },
        variant === 'outline' && styles.buttonOutline,
        animatedStyle,
      ]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <View style={styles.content}>
          {icon && (
            <Ionicons name={icon} size={20} color={getTextColor()} style={styles.icon} />
          )}
          <Text style={[styles.text, { color: getTextColor() }]}>{title}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  button: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing['2xl'],
    borderRadius: theme.borderRadius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 64,
  },
  buttonOutline: {
    borderWidth: 2,
  },
  content: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  icon: {
    marginRight: theme.spacing.sm,
  },
  text: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
}));
