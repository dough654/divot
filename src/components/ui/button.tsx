import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
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
}: ButtonProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isDisabled = disabled || loading;

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

  return (
    <Pressable
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
        },
        variant === 'outline' && styles.buttonOutline,
      ]}
      onPress={onPress}
      disabled={isDisabled}
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
    </Pressable>
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
