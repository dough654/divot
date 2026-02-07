import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type ManualCodeEntryProps = {
  onSubmit: (code: string) => void;
  onSwitchToScanner: () => void;
  isSubmitting?: boolean;
};

const CODE_LENGTH = 6;

/**
 * Manual room code entry component for when QR scanning is unavailable.
 * Displays 6 individual input boxes for the room code.
 */
export const ManualCodeEntry = ({
  onSubmit,
  onSwitchToScanner,
  isSubmitting = false,
}: ManualCodeEntryProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [code, setCode] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Auto-focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Auto-submit when code is complete
  useEffect(() => {
    if (code.length === CODE_LENGTH && !isSubmitting) {
      onSubmit(code);
    }
  }, [code, isSubmitting, onSubmit]);

  const handleChangeText = (text: string) => {
    // Only allow alphanumeric characters, convert to uppercase
    const sanitized = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (sanitized.length <= CODE_LENGTH) {
      setCode(sanitized);
    }
  };

  const handleSubmit = () => {
    if (code.length === CODE_LENGTH && !isSubmitting) {
      onSubmit(code);
    }
  };

  // Render individual "boxes" for visual effect
  const renderCodeBoxes = () => {
    const boxes = [];
    for (let i = 0; i < CODE_LENGTH; i++) {
      const char = code[i] || '';
      const isActive = i === code.length;
      boxes.push(
        <View
          key={i}
          style={[
            styles.codeBox,
            isActive && styles.codeBoxActive,
          ]}
        >
          <Text style={styles.codeChar}>{char}</Text>
        </View>
      );
    }
    return boxes;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.iconContainer}>
          <Ionicons
            name="keypad-outline"
            size={48}
            color={theme.colors.textSecondary}
          />
        </View>

        <Text style={styles.title}>Enter Room Code</Text>
        <Text style={styles.subtitle}>
          Enter the 6-character code shown on the camera device
        </Text>

        {/* Hidden input that captures keyboard */}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={handleChangeText}
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoCorrect={false}
          keyboardType="default"
          editable={!isSubmitting}
          accessibilityLabel="Room code input"
          accessibilityHint="Enter the 6-character room code from the camera device"
        />

        {/* Visual code boxes */}
        <Pressable
          style={styles.codeBoxesContainer}
          onPress={() => inputRef.current?.focus()}
          accessibilityRole="button"
          accessibilityLabel={`Room code: ${code || 'empty'}. ${CODE_LENGTH - code.length} characters remaining`}
          accessibilityHint="Tap to focus code input"
        >
          {renderCodeBoxes()}
        </Pressable>

        {/* Submit button */}
        <Pressable
          style={[
            styles.submitButton,
            code.length !== CODE_LENGTH && styles.submitButtonDisabled,
            isSubmitting && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={code.length !== CODE_LENGTH || isSubmitting}
          accessibilityRole="button"
          accessibilityLabel={isSubmitting ? 'Connecting' : 'Connect'}
          accessibilityHint="Connect to the camera device with the entered code"
          accessibilityState={{ disabled: code.length !== CODE_LENGTH || isSubmitting }}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Connecting...' : 'Connect'}
          </Text>
        </Pressable>

        {/* Switch to scanner button */}
        <Pressable
          style={styles.switchButton}
          onPress={onSwitchToScanner}
          accessibilityRole="button"
          accessibilityLabel="Scan QR code instead"
          accessibilityHint="Switch to QR code scanner to connect"
        >
          <Ionicons
            name="qr-code-outline"
            size={20}
            color={theme.colors.primary}
            style={styles.switchIcon}
          />
          <Text style={styles.switchButtonText}>Scan QR Code Instead</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
  },
  inner: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing['2xl'],
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing['3xl'],
  },
  hiddenInput: {
    position: 'absolute' as const,
    opacity: 0,
    height: 0,
    width: 0,
  },
  codeBoxesContainer: {
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing['3xl'],
  },
  codeBox: {
    width: 44,
    height: 56,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  codeBoxActive: {
    borderColor: theme.colors.primary,
  },
  codeChar: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
  },
  submitButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  submitButtonText: {
    color: theme.palette.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  switchButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: theme.spacing.md,
  },
  switchIcon: {
    marginRight: theme.spacing.sm,
  },
  switchButtonText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));
