import { StyleSheet, View, Text, TextInput, Pressable } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type HotspotCredentials = {
  ssid: string;
  password: string;
};

export type HotspotCredentialsFormProps = {
  onSubmit: (credentials: HotspotCredentials) => void;
  onCancel: () => void;
  isDark?: boolean;
};

/**
 * Form for entering mobile hotspot credentials on the camera device.
 * User enables their hotspot manually, then enters the SSID and password here.
 */
export const HotspotCredentialsForm = ({
  onSubmit,
  onCancel,
  isDark = false,
}: HotspotCredentialsFormProps) => {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isValid = ssid.trim().length > 0 && password.length >= 8;

  const handleSubmit = () => {
    if (isValid) {
      onSubmit({ ssid: ssid.trim(), password });
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Ionicons name="phone-portrait" size={32} color="#4CAF50" />
        <Text style={[styles.title, isDark && styles.titleDark]}>
          Hotspot Setup
        </Text>
      </View>

      <Text style={[styles.instructions, isDark && styles.instructionsDark]}>
        Enable your phone's mobile hotspot, then enter the network name and password below.
      </Text>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={[styles.label, isDark && styles.labelDark]}>
            Hotspot Name (SSID)
          </Text>
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            value={ssid}
            onChangeText={setSsid}
            placeholder="e.g., iPhone or Galaxy S22"
            placeholderTextColor={isDark ? '#666' : '#999'}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, isDark && styles.labelDark]}>
            Password
          </Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, styles.passwordInput, isDark && styles.inputDark]}
              value={password}
              onChangeText={setPassword}
              placeholder="Hotspot password"
              placeholderTextColor={isDark ? '#666' : '#999'}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color={isDark ? '#888' : '#666'}
              />
            </Pressable>
          </View>
          {password.length > 0 && password.length < 8 && (
            <Text style={styles.hint}>Password must be at least 8 characters</Text>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.cancelButton, isDark && styles.cancelButtonDark]}
          onPress={onCancel}
        >
          <Text style={[styles.cancelButtonText, isDark && styles.cancelButtonTextDark]}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.submitButton, !isValid && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!isValid}
        >
          <Text style={styles.submitButtonText}>
            Generate QR Code
          </Text>
        </Pressable>
      </View>

      <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={isDark ? '#888' : '#666'}
        />
        <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
          The viewer device will need to connect to this hotspot before the video stream can start.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  containerDark: {
    backgroundColor: '#2a2a4e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  titleDark: {
    color: '#ffffff',
  },
  instructions: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 20,
  },
  instructionsDark: {
    color: '#888',
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  labelDark: {
    color: '#ccc',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputDark: {
    backgroundColor: '#1a1a2e',
    borderColor: '#3a3a5e',
    color: '#ffffff',
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  hint: {
    fontSize: 12,
    color: '#f44336',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonDark: {
    backgroundColor: '#1a1a2e',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  cancelButtonTextDark: {
    color: '#888',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  infoBox: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 12,
  },
  infoBoxDark: {
    backgroundColor: '#1a3a1a',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  infoTextDark: {
    color: '#888',
  },
});
