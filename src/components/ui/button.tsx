import { StyleSheet, Pressable, Text, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  isDark?: boolean;
};

/**
 * Reusable button component with multiple variants.
 */
export const Button = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  isDark = false,
}: ButtonProps) => {
  const isDisabled = disabled || loading;

  const getBackgroundColor = () => {
    if (isDisabled) return isDark ? '#333' : '#ccc';
    switch (variant) {
      case 'primary':
        return '#4CAF50';
      case 'secondary':
        return isDark ? '#2a2a4e' : '#f0f0f0';
      case 'outline':
        return 'transparent';
      case 'danger':
        return '#f44336';
    }
  };

  const getTextColor = () => {
    if (isDisabled) return '#888';
    switch (variant) {
      case 'primary':
      case 'danger':
        return '#ffffff';
      case 'secondary':
        return isDark ? '#ffffff' : '#1a1a2e';
      case 'outline':
        return '#4CAF50';
    }
  };

  const getBorderColor = () => {
    if (variant === 'outline') {
      return isDisabled ? '#888' : '#4CAF50';
    }
    return 'transparent';
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

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonOutline: {
    borderWidth: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});
