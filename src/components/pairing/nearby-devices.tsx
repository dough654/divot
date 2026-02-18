import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';
import type { DiscoveredDevice } from '../../../modules/swinglink-ble';

export type NearbyDevicesProps = {
  /** Discovered BLE devices sorted by signal strength. */
  devices: ReadonlyArray<DiscoveredDevice>;
  /** Whether the scanner is actively searching. */
  isScanning: boolean;
  /** Called when a device is tapped. */
  onDeviceSelect: (device: DiscoveredDevice) => void;
};

/** Returns a platform icon name based on device platform. */
const getPlatformIcon = (platform: 'ios' | 'android'): keyof typeof Ionicons.glyphMap => {
  return platform === 'ios' ? 'phone-portrait-outline' : 'phone-portrait-outline';
};

/**
 * Displays a list of nearby BLE-discovered camera devices.
 * Shown above the QR scanner on the viewer screen.
 */
export const NearbyDevices = ({
  devices,
  isScanning,
  onDeviceSelect,
}: NearbyDevicesProps) => {
  const styles = useThemedStyles(createStyles);

  if (!isScanning && devices.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Nearby Cameras</Text>
        {isScanning && devices.length === 0 && (
          <View style={styles.searchingRow}>
            <ActivityIndicator size="small" color={styles.searchingText.color as string} />
            <Text style={styles.searchingText}>Searching nearby...</Text>
          </View>
        )}
      </View>

      {devices.map((device) => (
        <Pressable
          key={device.id}
          style={({ pressed }) => [
            styles.deviceCard,
            pressed && styles.deviceCardPressed,
          ]}
          onPress={() => onDeviceSelect(device)}
          accessibilityRole="button"
          accessibilityLabel={`Connect to ${device.name || 'camera'} on ${device.platform}`}
        >
          <View style={styles.deviceIcon}>
            <Ionicons
              name={getPlatformIcon(device.platform)}
              size={20}
              color={styles.deviceIconColor.color as string}
            />
          </View>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName} numberOfLines={1}>
              {device.name || 'Divot Camera'}
            </Text>
            <Text style={styles.deviceMeta}>
              {device.platform === 'ios' ? 'iPhone' : 'Android'} · {device.roomCode}
            </Text>
          </View>
          <View style={styles.signalContainer}>
            <SignalBars rssi={device.rssi} />
          </View>
        </Pressable>
      ))}

      {devices.length > 0 && (
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>
      )}
    </View>
  );
};

/** Simple signal strength bars indicator. */
const SignalBars = ({ rssi }: { rssi: number }) => {
  const styles = useThemedStyles(createStyles);
  const bars = rssi >= -50 ? 3 : rssi >= -65 ? 2 : rssi >= -80 ? 1 : 0;

  return (
    <View style={styles.signalBars}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.signalBar,
            { height: 6 + i * 4 },
            i <= bars ? styles.signalBarActive : styles.signalBarInactive,
          ]}
        />
      ))}
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing.sm,
  },
  headerText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  searchingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  searchingText: {
    fontFamily: theme.fontFamily.body,
    fontSize: theme.fontSize.xs,
    color: theme.colors.textTertiary,
  },
  deviceCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  deviceCardPressed: {
    opacity: 0.7,
    backgroundColor: theme.colors.surfaceElevated,
  },
  deviceIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.backgroundTertiary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  deviceIconColor: {
    color: theme.colors.textSecondary,
  },
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  deviceName: {
    fontFamily: theme.fontFamily.bodySemiBold,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  deviceMeta: {
    fontFamily: theme.fontFamily.body,
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  signalContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  signalBars: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 2,
  },
  signalBar: {
    width: 4,
    borderRadius: 1,
  },
  signalBarActive: {
    backgroundColor: theme.colors.success,
  },
  signalBarInactive: {
    backgroundColor: theme.colors.borderSubtle,
  },
  divider: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.borderSubtle,
  },
  dividerText: {
    fontFamily: theme.fontFamily.body,
    fontSize: theme.fontSize.xs,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
}));
