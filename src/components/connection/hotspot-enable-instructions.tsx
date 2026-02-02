import { StyleSheet, View, Text, Platform, Linking, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type HotspotEnableInstructionsProps = {
  onEnabled: () => void;
  onCancel: () => void;
  isDark?: boolean;
};

/**
 * Instructions for enabling mobile hotspot on the camera device.
 * Shows platform-specific steps for iOS and Android.
 */
export const HotspotEnableInstructions = ({
  onEnabled,
  onCancel,
  isDark = false,
}: HotspotEnableInstructionsProps) => {
  const iosSteps = [
    'Go to Settings > Personal Hotspot',
    'Turn on "Allow Others to Join"',
    'Note your WiFi password (you\'ll share it with the viewer)',
    'Return here and tap "Hotspot is Enabled"',
  ];

  const androidSteps = [
    'Go to Settings > Connections > Mobile Hotspot',
    'Turn on Mobile Hotspot',
    'Note your network name and password',
    'Return here and tap "Hotspot is Enabled"',
  ];

  const steps = Platform.OS === 'ios' ? iosSteps : androidSteps;

  const openSettings = async () => {
    if (Platform.OS === 'ios') {
      // Deep-link directly to Personal Hotspot settings
      // iOS will show "Back to SwingLink" in the top-left
      try {
        const hotspotUrl = 'App-Prefs:INTERNET_TETHERING';
        const canOpen = await Linking.canOpenURL(hotspotUrl);
        if (canOpen) {
          await Linking.openURL(hotspotUrl);
        } else {
          // Fallback to general settings
          await Linking.openSettings();
        }
      } catch {
        await Linking.openSettings();
      }
    } else {
      // Android - try to open hotspot/tethering settings directly
      try {
        await Linking.sendIntent('android.settings.TETHERING_SETTINGS');
      } catch {
        await Linking.openSettings();
      }
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Ionicons name="phone-portrait" size={32} color="#4CAF50" />
        <Text style={[styles.title, isDark && styles.titleDark]}>
          Enable Your Hotspot
        </Text>
      </View>

      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
        The viewer device will connect to this phone's hotspot for the best connection quality.
      </Text>

      <View style={styles.stepsContainer}>
        {steps.map((step, index) => (
          <View key={index} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={[styles.stepText, isDark && styles.stepTextDark]}>
              {step}
            </Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.settingsButton} onPress={openSettings}>
        <Ionicons name="settings-outline" size={18} color="#4CAF50" />
        <Text style={styles.settingsButtonText}>Open Settings</Text>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.cancelButton, isDark && styles.cancelButtonDark]}
          onPress={onCancel}
        >
          <Text style={[styles.cancelButtonText, isDark && styles.cancelButtonTextDark]}>
            Cancel
          </Text>
        </Pressable>
        <Pressable style={[styles.button, styles.enabledButton]} onPress={onEnabled}>
          <Ionicons name="checkmark-circle" size={20} color="#ffffff" style={styles.buttonIcon} />
          <Text style={styles.enabledButtonText}>Hotspot is Enabled</Text>
        </Pressable>
      </View>

      <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={isDark ? '#888' : '#666'}
        />
        <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
          The viewer will need your hotspot name and password to connect. You'll share this after generating the QR code.
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
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  titleDark: {
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 20,
  },
  subtitleDark: {
    color: '#888',
  },
  stepsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  stepTextDark: {
    color: '#ccc',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 8,
  },
  settingsButtonText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonIcon: {
    marginRight: 6,
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
  enabledButton: {
    backgroundColor: '#4CAF50',
  },
  enabledButtonText: {
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
