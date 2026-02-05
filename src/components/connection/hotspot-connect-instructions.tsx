import { View, Text, Platform, Linking, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type HotspotConnectInstructionsProps = {
  onConnected: () => void;
  onCancel: () => void;
};

/**
 * Instructions for connecting to the camera's hotspot from the viewer device.
 * Shows platform-specific steps for iOS and Android.
 */
export const HotspotConnectInstructions = ({
  onConnected,
  onCancel,
}: HotspotConnectInstructionsProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

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
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="wifi" size={32} color={theme.colors.primary} />
        <Text style={styles.title}>
          Connect to Camera's Hotspot
        </Text>
      </View>

      <Text style={styles.subtitle}>
        Connect this device to the camera's mobile hotspot to establish the video stream.
      </Text>

      <View style={styles.tipBox}>
        <Ionicons name="bulb-outline" size={18} color={theme.colors.warning} />
        <Text style={styles.tipText}>
          Ask the person with the camera for their hotspot name and password
        </Text>
      </View>

      <View style={styles.stepsContainer}>
        {steps.map((step, index) => (
          <View key={index} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepText}>
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
        <Ionicons name="wifi-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.settingsButtonText}>Open Wi-Fi Settings</Text>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={styles.cancelButton}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          accessibilityHint="Skip hotspot connection"
        >
          <Text style={styles.cancelButtonText}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          style={styles.connectedButton}
          onPress={onConnected}
          accessibilityRole="button"
          accessibilityLabel="I'm Connected"
          accessibilityHint="Confirm that you've connected to the hotspot"
        >
          <Ionicons name="checkmark-circle" size={20} color={theme.palette.white} style={styles.buttonIcon} />
          <Text style={styles.connectedButtonText}>I'm Connected</Text>
        </Pressable>
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
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
    flex: 1,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  tipBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: theme.colors.warningBackground,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.warning,
    lineHeight: 18,
  },
  stepsContainer: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  stepRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stepNumberText: {
    color: theme.palette.white,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22,
  },
  settingsButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
  },
  settingsButtonText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
  },
  buttonIcon: {
    marginRight: 6,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  cancelButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textSecondary,
  },
  connectedButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  connectedButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.palette.white,
  },
}));
