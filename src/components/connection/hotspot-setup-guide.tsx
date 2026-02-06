import { View, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type HotspotSetupGuideProps = {
  hotspotSsid?: string;
  hotspotPassword?: string;
  isCamera?: boolean;
};

/**
 * Guide for setting up mobile hotspot connection.
 * Shows different instructions for camera (host) and viewer (client) roles.
 */
export const HotspotSetupGuide = ({
  hotspotSsid,
  hotspotPassword,
  isCamera = false,
}: HotspotSetupGuideProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const cameraSteps = [
    'Enable your phone\'s mobile hotspot',
    'Note the hotspot name and password',
    'The QR code will update with hotspot info',
    'Wait for the viewer to connect',
  ];

  const viewerStepsAndroid = [
    'Open WiFi settings on this device',
    `Connect to: ${hotspotSsid || 'Camera\'s hotspot'}`,
    `Password: ${hotspotPassword || '(shown on QR)'}`,
    'Return here after connecting',
  ];

  const viewerStepsIOS = [
    'Scan the QR code with your camera app',
    'Tap "Join Network" when prompted',
    'Return to SwingLink after connecting',
  ];

  const steps = isCamera
    ? cameraSteps
    : Platform.OS === 'ios'
    ? viewerStepsIOS
    : viewerStepsAndroid;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons
          name={isCamera ? 'phone-portrait' : 'wifi'}
          size={32}
          color={theme.colors.accent}
        />
        <Text style={styles.title}>
          {isCamera ? 'Enable Hotspot' : 'Connect to Hotspot'}
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

      {!isCamera && hotspotSsid && (
        <View style={styles.credentialsBox}>
          <View style={styles.credentialRow}>
            <Text style={styles.credentialLabel}>
              Network:
            </Text>
            <Text style={styles.credentialValue}>
              {hotspotSsid}
            </Text>
          </View>
          {hotspotPassword && (
            <View style={styles.credentialRow}>
              <Text style={styles.credentialLabel}>
                Password:
              </Text>
              <Text style={styles.credentialValue}>
                {hotspotPassword}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={theme.colors.textSecondary}
        />
        <Text style={styles.infoText}>
          Hotspot mode provides the best connection quality with lowest latency.
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
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontFamily: theme.fontFamily.display,
    fontSize: 20,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.3,
  },
  stepsContainer: {
    gap: theme.spacing.md,
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
    backgroundColor: theme.colors.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stepNumberText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.isDark ? theme.palette.black : theme.palette.white,
    fontSize: theme.fontSize.sm,
  },
  stepText: {
    flex: 1,
    fontFamily: theme.fontFamily.body,
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 20,
  },
  credentialsBox: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  credentialRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  credentialLabel: {
    fontFamily: theme.fontFamily.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    textTransform: 'lowercase' as const,
  },
  credentialValue: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
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
