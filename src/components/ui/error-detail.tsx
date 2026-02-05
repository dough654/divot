import { View, Text, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';
import type { ErrorInfo, RecoveryAction } from '../../utils/error-messages';

export type ErrorDetailProps = {
  error: ErrorInfo;
  onAction: (action: RecoveryAction['action']) => void;
  /** Compact mode for inline display */
  compact?: boolean;
};

/**
 * Displays an error with title, message, and recovery action buttons.
 * Use for connection failures, permission issues, etc.
 */
export const ErrorDetail = ({
  error,
  onAction,
  compact = false,
}: ErrorDetailProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const getActionIcon = (action: RecoveryAction['action']): keyof typeof Ionicons.glyphMap => {
    switch (action) {
      case 'retry':
        return 'refresh';
      case 'rescan':
        return 'qr-code';
      case 'settings':
        return 'settings-outline';
      case 'hotspot':
        return 'phone-portrait-outline';
      case 'wifi':
        return 'wifi';
      case 'dismiss':
        return 'close';
      default:
        return 'arrow-forward';
    }
  };

  if (compact) {
    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={styles.compactContainer}
      >
        <View style={styles.compactContent}>
          <Ionicons
            name="alert-circle"
            size={16}
            color={theme.colors.error}
          />
          <Text style={styles.compactTitle}>{error.title}</Text>
        </View>
        {error.recoveryActions.length > 0 && (
          <Pressable
            style={styles.compactAction}
            onPress={() => onAction(error.recoveryActions[0].action)}
            android_ripple={Platform.OS === 'android' ? { color: 'rgba(76, 175, 80, 0.2)', borderless: true } : undefined}
            accessibilityRole="button"
            accessibilityLabel={error.recoveryActions[0].label}
          >
            <Text style={styles.compactActionText}>
              {error.recoveryActions[0].label}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
      accessible
      accessibilityLabel={`Error: ${error.title}. ${error.message}`}
      accessibilityRole="alert"
    >
      <View style={styles.iconContainer}>
        <Ionicons
          name="alert-circle"
          size={32}
          color={theme.colors.error}
        />
      </View>

      <Text style={styles.title}>{error.title}</Text>
      <Text style={styles.message}>{error.message}</Text>

      <View style={styles.actions}>
        {error.recoveryActions.map((action) => (
          <Pressable
            key={action.action}
            style={[
              styles.actionButton,
              action.primary && styles.actionButtonPrimary,
            ]}
            onPress={() => onAction(action.action)}
            android_ripple={Platform.OS === 'android' ? {
              color: action.primary ? 'rgba(255, 255, 255, 0.3)' : 'rgba(76, 175, 80, 0.2)',
            } : undefined}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityHint={`${action.label} to resolve the error`}
          >
            <Ionicons
              name={getActionIcon(action.action)}
              size={18}
              color={action.primary ? theme.palette.white : theme.colors.primary}
              style={styles.actionIcon}
            />
            <Text
              style={[
                styles.actionText,
                action.primary && styles.actionTextPrimary,
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing['2xl'],
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.errorBackground,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
    textAlign: 'center' as const,
    marginBottom: theme.spacing.sm,
  },
  message: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: theme.spacing.xl,
  },
  actions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.sm,
    width: '100%' as const,
  },
  actionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.backgroundTertiary,
    minWidth: 100,
  },
  actionButtonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  actionIcon: {
    marginRight: theme.spacing.xs,
  },
  actionText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.primary,
  },
  actionTextPrimary: {
    color: theme.palette.white,
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: theme.colors.errorBackground,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  compactContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    flex: 1,
  },
  compactTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.error,
  },
  compactAction: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  compactActionText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.primary,
  },
}));
