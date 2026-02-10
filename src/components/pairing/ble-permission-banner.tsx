import { View, Text, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import type { Theme } from '@/src/context';

export type BLEPermissionBannerProps = {
  /** Called when the user taps the dismiss button. */
  onDismiss: () => void;
};

/**
 * Dismissable banner prompting the user to enable Bluetooth permissions
 * for faster BLE-based pairing. Only shown on Android when permissions
 * are denied.
 */
export const BLEPermissionBanner = ({ onDismiss }: BLEPermissionBannerProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.container}>
      <Ionicons name="bluetooth" size={18} color="#5B8DEF" />
      <Text style={styles.text}>Enable Bluetooth for faster pairing</Text>
      <Pressable
        onPress={() => Linking.openSettings()}
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        hitSlop={8}
      >
        <Text style={styles.settingsLink}>Settings</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
        style={styles.dismissButton}
      >
        <Ionicons name="close" size={16} color="#888" />
      </Pressable>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: 'rgba(91, 141, 239, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(91, 141, 239, 0.15)',
  },
  text: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.body,
    color: theme.colors.textSecondary,
  },
  settingsLink: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bodySemiBold,
    color: '#5B8DEF',
  },
  dismissButton: {
    marginLeft: 4,
  },
}));
