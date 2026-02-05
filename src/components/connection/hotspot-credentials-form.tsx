import { View, Text, Pressable } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';
import { TextInput } from '../ui';

export type HotspotCredentials = {
  ssid: string;
  password: string;
};

export type HotspotCredentialsFormProps = {
  onSubmit: (credentials: HotspotCredentials) => void;
  onCancel: () => void;
};

/**
 * Form for entering mobile hotspot credentials on the camera device.
 * User enables their hotspot manually, then enters the SSID and password here.
 */
export const HotspotCredentialsForm = ({
  onSubmit,
  onCancel,
}: HotspotCredentialsFormProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isValid = ssid.trim().length > 0 && password.length >= 8;

  const handleSubmit = () => {
    if (isValid) {
      onSubmit({ ssid: ssid.trim(), password });
    }
  };

  const passwordError = password.length > 0 && password.length < 8
    ? 'Password must be at least 8 characters'
    : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="phone-portrait" size={32} color={theme.colors.primary} />
        <Text style={styles.title}>Hotspot Setup</Text>
      </View>

      <Text style={styles.instructions}>
        Enable your phone's mobile hotspot, then enter the network name and password below.
      </Text>

      <View style={styles.form}>
        <TextInput
          label="Hotspot Name (SSID)"
          value={ssid}
          onChangeText={setSsid}
          placeholder="e.g., iPhone or Galaxy S22"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.passwordContainer}>
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Hotspot password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            error={passwordError}
          />
          <Pressable
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            accessibilityHint="Toggle password visibility"
          >
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={20}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          accessibilityHint="Skip hotspot credential setup"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.submitButton, !isValid && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!isValid}
          accessibilityRole="button"
          accessibilityLabel="Generate QR Code"
          accessibilityHint="Create a QR code with the hotspot credentials"
          accessibilityState={{ disabled: !isValid }}
        >
          <Text style={styles.submitButtonText}>Generate QR Code</Text>
        </Pressable>
      </View>

      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={theme.colors.textSecondary}
        />
        <Text style={styles.infoText}>
          The viewer device will need to connect to this hotspot before the video stream can start.
        </Text>
      </View>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
  },
  instructions: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.xl,
  },
  form: {
    gap: theme.spacing.lg,
  },
  passwordContainer: {
    position: 'relative' as const,
  },
  eyeButton: {
    position: 'absolute' as const,
    right: theme.spacing.md,
    top: 28, // Account for label height
    bottom: 0,
    justifyContent: 'center' as const,
    height: 48,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    marginTop: theme.spacing['2xl'],
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center' as const,
  },
  cancelButton: {
    backgroundColor: theme.colors.backgroundTertiary,
  },
  cancelButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textSecondary,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
  },
  submitButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  submitButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.palette.white,
  },
  infoBox: {
    marginTop: theme.spacing.xl,
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.successBackground,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
}));
