import { View, Text, Platform, Linking, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type HotspotEnableInstructionsProps = {
  onEnabled: () => void;
  onCancel: () => void;
};

/**
 * Instructions for enabling mobile hotspot on the camera device.
 * Shows platform-specific steps for iOS and Android.
 */
export const HotspotEnableInstructions = ({
  onEnabled,
  onCancel,
}: HotspotEnableInstructionsProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const iosSteps = [
    'Open Settings, then tap "Personal Hotspot"',
    'Turn on "Allow Others to Join"',
    'Note the Wi-Fi Password shown on that screen',
    'Come back here and tap "Hotspot is Enabled"',
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
      // iOS doesn't allow deep-linking to specific Settings pages anymore
      // Just open the main Settings app
      await Linking.openSettings();
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="phone-portrait" size={32} color={theme.colors.primary} />
        <Text style={styles.title}>
          Enable Your Hotspot
        </Text>
      </View>

      <Text style={styles.subtitle}>
        The viewer device will connect to this phone's hotspot for the best connection quality.
      </Text>

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
        onPress={openSettings}
        accessibilityRole="button"
        accessibilityLabel="Open Settings"
        accessibilityHint="Open device settings to enable hotspot"
      >
        <Ionicons name="settings-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.settingsButtonText}>Open Settings</Text>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={styles.cancelButton}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          accessibilityHint="Skip hotspot setup"
        >
          <Text style={styles.cancelButtonText}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          style={styles.enabledButton}
          onPress={onEnabled}
          accessibilityRole="button"
          accessibilityLabel="Hotspot is Enabled"
          accessibilityHint="Confirm that hotspot has been enabled"
        >
          <Ionicons name="checkmark-circle" size={20} color={theme.palette.white} style={styles.buttonIcon} />
          <Text style={styles.enabledButtonText}>Hotspot is Enabled</Text>
        </Pressable>
      </View>

      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={theme.colors.textSecondary}
        />
        <Text style={styles.infoText}>
          The viewer will need your hotspot name and password to connect. You'll share this after generating the QR code.
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
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.xl,
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
    fontSize: 17,
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
  enabledButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  enabledButtonText: {
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
    fontSize: 15,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
}));
