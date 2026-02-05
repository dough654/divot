import { StyleSheet, View, Text, Platform, Linking, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type HotspotConnectInstructionsProps = {
  onConnected: () => void;
  onCancel: () => void;
  isDark?: boolean;
};

/**
 * Instructions for connecting to the camera's hotspot from the viewer device.
 * Shows platform-specific steps for iOS and Android.
 */
export const HotspotConnectInstructions = ({
  onConnected,
  onCancel,
  isDark = false,
}: HotspotConnectInstructionsProps) => {
  const iosSteps = [
    'Go to Settings > Wi-Fi',
    'Look for the camera device\'s hotspot name',
    'Tap to connect and enter the password',
    'Return here once connected',
  ];

  const androidSteps = [
    'Go to Settings > Wi-Fi',
    'Find the camera device\'s hotspot in the list',
    'Tap to connect and enter the password',
    'Return here once connected',
  ];

  const steps = Platform.OS === 'ios' ? iosSteps : androidSteps;

  const openWifiSettings = async () => {
    if (Platform.OS === 'ios') {
      // Deep-link directly to WiFi settings
      // iOS will show "Back to SwingLink" in the top-left
      try {
        const wifiUrl = 'App-Prefs:WIFI';
        const canOpen = await Linking.canOpenURL(wifiUrl);
        if (canOpen) {
          await Linking.openURL(wifiUrl);
        } else {
          await Linking.openSettings();
        }
      } catch {
        await Linking.openSettings();
      }
    } else {
      // Android - open WiFi settings
      try {
        await Linking.sendIntent('android.settings.WIFI_SETTINGS');
      } catch {
        await Linking.openSettings();
      }
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Ionicons name="wifi" size={32} color="#4CAF50" />
        <Text style={[styles.title, isDark && styles.titleDark]}>
          Connect to Camera's Hotspot
        </Text>
      </View>

      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
        Connect this device to the camera's mobile hotspot to establish the video stream.
      </Text>

      <View style={[styles.tipBox, isDark && styles.tipBoxDark]}>
        <Ionicons name="bulb-outline" size={18} color="#FF9800" />
        <Text style={[styles.tipText, isDark && styles.tipTextDark]}>
          Ask the person with the camera for their hotspot name and password
        </Text>
      </View>

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

      <Pressable
        style={styles.settingsButton}
        onPress={openWifiSettings}
        accessibilityRole="button"
        accessibilityLabel="Open Wi-Fi Settings"
        accessibilityHint="Open device Wi-Fi settings to connect to hotspot"
      >
        <Ionicons name="wifi-outline" size={18} color="#4CAF50" />
        <Text style={styles.settingsButtonText}>Open Wi-Fi Settings</Text>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.cancelButton, isDark && styles.cancelButtonDark]}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          accessibilityHint="Skip hotspot connection"
        >
          <Text style={[styles.cancelButtonText, isDark && styles.cancelButtonTextDark]}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.connectedButton]}
          onPress={onConnected}
          accessibilityRole="button"
          accessibilityLabel="I'm Connected"
          accessibilityHint="Confirm that you've connected to the hotspot"
        >
          <Ionicons name="checkmark-circle" size={20} color="#ffffff" style={styles.buttonIcon} />
          <Text style={styles.connectedButtonText}>I'm Connected</Text>
        </Pressable>
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
    flex: 1,
  },
  titleDark: {
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  subtitleDark: {
    color: '#888',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  tipBoxDark: {
    backgroundColor: '#3a2a1a',
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: '#E65100',
    lineHeight: 18,
  },
  tipTextDark: {
    color: '#FFB74D',
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
  connectedButton: {
    backgroundColor: '#4CAF50',
  },
  connectedButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
