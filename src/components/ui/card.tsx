import { Pressable, View, ViewStyle, StyleProp } from 'react-native';
import { ReactNode } from 'react';
import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

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

  const cardStyle: StyleProp<ViewStyle> = [
    styles.base,
    { padding: PADDING_MAP[padding] },
    variant === 'elevated' && styles.elevated,
    variant === 'outlined' && styles.outlined,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          cardStyle,
          pressed && styles.pressed,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        android_ripple={{
          color: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderless: false,
        }}
      >
        {children}
      </Pressable>
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
  pressed: {
    opacity: 0.9,
  },
}));
