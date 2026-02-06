import { Text, Pressable } from 'react-native';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type EmptyStateAction = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
};

export type EmptyStateProps = {
  /** Icon name from Ionicons. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Main message displayed prominently. */
  title: string;
  /** Secondary explanation text. */
  description?: string;
  /** Optional action button. */
  action?: EmptyStateAction;
  /** Icon size. Defaults to 64. */
  iconSize?: number;
};

/**
 * Reusable empty state component for screens with no content.
 * Displays a centered icon, title, optional description, and optional action button.
 * Fades in on mount for a polished feel.
 */
export const EmptyState = ({
  icon,
  title,
  description,
  action,
  iconSize = 64,
}: EmptyStateProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Fade-in animation
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Ionicons
        name={icon}
        size={iconSize}
        color={theme.colors.textTertiary}
        style={styles.icon}
      />
      <Text style={styles.title}>{title}</Text>
      {description && (
        <Text style={styles.description}>{description}</Text>
      )}
      {action && (
        <Pressable
          style={styles.actionButton}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          {action.icon && (
            <Ionicons
              name={action.icon}
              size={20}
              color={theme.isDark ? theme.palette.black : theme.palette.white}
            />
          )}
          <Text style={styles.actionButtonText}>{action.label}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing['3xl'],
  },
  icon: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.display,
    color: theme.colors.text,
    textAlign: 'center' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.5,
    marginBottom: theme.spacing.sm,
  },
  description: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: theme.spacing['2xl'],
  },
  actionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.sm,
  },
  actionButtonText: {
    color: theme.isDark ? theme.palette.black : theme.palette.white,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bodySemiBold,
  },
}));
