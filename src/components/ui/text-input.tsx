import { TextInput as RNTextInput, View, Text, TextInputProps as RNTextInputProps } from 'react-native';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type TextInputProps = RNTextInputProps & {
  /** Optional label displayed above the input. */
  label?: string;
  /** Error message to display below the input. Shows error styling when provided. */
  error?: string;
  /** Helper text to display below the input (hidden when error is shown). */
  hint?: string;
};

/**
 * Themed text input component with optional label and error state.
 * Automatically adapts to light/dark theme.
 *
 * @example
 * // Basic input
 * <TextInput
 *   placeholder="Enter your name"
 *   value={name}
 *   onChangeText={setName}
 * />
 *
 * @example
 * // With label and error
 * <TextInput
 *   label="Email"
 *   placeholder="you@example.com"
 *   value={email}
 *   onChangeText={setEmail}
 *   error={emailError}
 *   keyboardType="email-address"
 * />
 *
 * @example
 * // Password input with hint
 * <TextInput
 *   label="Password"
 *   placeholder="Enter password"
 *   value={password}
 *   onChangeText={setPassword}
 *   secureTextEntry
 *   hint="Must be at least 8 characters"
 * />
 */
export const TextInput = ({
  label,
  error,
  hint,
  style,
  ...props
}: TextInputProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const hasError = !!error;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      <RNTextInput
        style={[
          styles.input,
          hasError && styles.inputError,
          style,
        ]}
        placeholderTextColor={theme.colors.textTertiary}
        {...props}
      />
      {hasError ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: 2,
  },
  input: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  error: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.error,
    marginTop: 2,
  },
  hint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
}));
