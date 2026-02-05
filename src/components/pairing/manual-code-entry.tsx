import { StyleSheet, View, Text, TextInput, Pressable } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type ManualCodeEntryProps = {
  onSubmit: (code: string) => void;
  onSwitchToScanner: () => void;
  isSubmitting?: boolean;
  isDark?: boolean;
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
  isDark = false,
}: ManualCodeEntryProps) => {
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
            isDark && styles.codeBoxDark,
            isActive && styles.codeBoxActive,
          ]}
        >
          <Text style={[styles.codeChar, isDark && styles.codeCharDark]}>
            {char}
          </Text>
        </View>
      );
    }
    return boxes;
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.iconContainer}>
        <Ionicons
          name="keypad-outline"
          size={48}
          color={isDark ? '#888' : '#666'}
        />
      </View>

      <Text style={[styles.title, isDark && styles.titleDark]}>
        Enter Room Code
      </Text>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
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
          color="#4CAF50"
          style={styles.switchIcon}
        />
        <Text style={styles.switchButtonText}>Scan QR Code Instead</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 12,
  },
  containerDark: {
    backgroundColor: '#1a1a2e',
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  titleDark: {
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  subtitleDark: {
    color: '#888',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  codeBoxesContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  codeBox: {
    width: 44,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxDark: {
    backgroundColor: '#2a2a4e',
    borderColor: '#3a3a5e',
  },
  codeBoxActive: {
    borderColor: '#4CAF50',
  },
  codeChar: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  codeCharDark: {
    color: '#ffffff',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginBottom: 16,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  switchIcon: {
    marginRight: 8,
  },
  switchButtonText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
  },
});
