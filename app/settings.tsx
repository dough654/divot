import { View, Text, Switch, Pressable, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';

import { useTheme, useSettings } from '@/src/context';
import { useThemedStyles, makeThemedStyles, useHaptics, useOrientation } from '@/src/hooks';
import { useToast } from '@/src/context';
import { Card } from '@/src/components/ui';
import { clearAllClips, listClips } from '@/src/services/recording/clip-storage';
import type { Theme, ThemeMode } from '@/src/context';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const FEEDBACK_EMAIL = 'feedback@swinglink.app';

export default function SettingsScreen() {
  const { theme } = useTheme();
  const { settings, setHapticsEnabled, setThemeMode } = useSettings();
  const styles = useThemedStyles(createStyles);
  const haptics = useHaptics();
  const { show: showToast } = useToast();
  const { lockToPortrait, unlock } = useOrientation();
  const [isClearing, setIsClearing] = useState(false);

  // Lock settings screen to portrait
  useEffect(() => {
    lockToPortrait();
    return () => {
      unlock();
    };
  }, [lockToPortrait, unlock]);

  const handleHapticsToggle = (value: boolean) => {
    // Trigger haptic before potentially disabling
    if (value) {
      haptics.selection();
    }
    setHapticsEnabled(value);
  };

  const handleThemeModeChange = (mode: ThemeMode) => {
    haptics.selection();
    setThemeMode(mode);
  };

  const handleClearClips = async () => {
    // Check if there are any clips first
    const clips = await listClips();
    if (clips.length === 0) {
      showToast('No clips to delete', { variant: 'info' });
      return;
    }

    Alert.alert(
      'Clear All Clips',
      `Are you sure you want to delete all ${clips.length} clip${clips.length === 1 ? '' : 's'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setIsClearing(true);
            try {
              await clearAllClips();
              haptics.success();
              showToast('All clips deleted', { variant: 'success' });
            } catch (err) {
              haptics.error();
              showToast('Failed to clear clips', { variant: 'error' });
            } finally {
              setIsClearing(false);
            }
          },
        },
      ]
    );
  };

  const handleSendFeedback = () => {
    haptics.light();
    const subject = encodeURIComponent('SwingLink Feedback');
    const body = encodeURIComponent('\n\n---\nApp Version: 1.0.0');
    Linking.openURL(`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>

        <Card style={styles.settingsCard}>
          {/* Haptic Feedback Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="hand-left-outline" size={22} color={theme.colors.text} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Haptic Feedback</Text>
                <Text style={styles.settingDescription}>Vibration on button presses</Text>
              </View>
            </View>
            <Switch
              value={settings.hapticsEnabled}
              onValueChange={handleHapticsToggle}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.palette.white}
              accessibilityLabel="Toggle haptic feedback"
              accessibilityHint={settings.hapticsEnabled ? 'Disable haptic feedback' : 'Enable haptic feedback'}
            />
          </View>

          <View style={styles.divider} />

          {/* Theme Mode Selector */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="moon-outline" size={22} color={theme.colors.text} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Appearance</Text>
                <Text style={styles.settingDescription}>Choose light or dark theme</Text>
              </View>
            </View>
          </View>

          <View style={styles.themeOptions}>
            {THEME_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.themeOption,
                  settings.themeMode === option.value && styles.themeOptionSelected,
                ]}
                onPress={() => handleThemeModeChange(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: settings.themeMode === option.value }}
                accessibilityLabel={`${option.label} theme`}
              >
                <Text
                  style={[
                    styles.themeOptionText,
                    settings.themeMode === option.value && styles.themeOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>
      </View>

      {/* Data Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>

        <Card style={styles.settingsCard}>
          <Pressable
            style={styles.actionRow}
            onPress={handleClearClips}
            disabled={isClearing}
            accessibilityRole="button"
            accessibilityLabel="Clear all clips"
            accessibilityHint="Deletes all recorded clips from the app"
          >
            <View style={styles.settingInfo}>
              <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
              <Text style={[styles.settingLabel, styles.dangerText]}>
                {isClearing ? 'Clearing...' : 'Clear All Clips'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
          </Pressable>
        </Card>
      </View>

      {/* Support Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>

        <Card style={styles.settingsCard}>
          <Pressable
            style={styles.actionRow}
            onPress={handleSendFeedback}
            accessibilityRole="button"
            accessibilityLabel="Send feedback"
            accessibilityHint="Opens email to send feedback"
          >
            <View style={styles.settingInfo}>
              <Ionicons name="mail-outline" size={22} color={theme.colors.text} />
              <Text style={styles.settingLabel}>Send Feedback</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
          </Pressable>
        </Card>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <Card padding="lg" style={styles.infoCard}>
          <Text style={styles.appName}>SwingLink</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
          <Text style={styles.description}>
            P2P video streaming for golfers. One device films, the other views in real-time.
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    padding: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing['2xl'],
  },
  sectionTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: theme.spacing.md,
    marginLeft: theme.spacing.xs,
  },
  settingsCard: {
    padding: 0,
    overflow: 'hidden' as const,
  },
  settingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: theme.spacing.lg,
  },
  settingInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.md,
    flex: 1,
  },
  settingText: {
    flex: 1,
  },
  settingLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.text,
  },
  settingDescription: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.lg,
  },
  themeOptions: {
    flexDirection: 'row' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  themeOption: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.backgroundTertiary,
    alignItems: 'center' as const,
  },
  themeOptionSelected: {
    backgroundColor: theme.colors.primary,
  },
  themeOptionText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  themeOptionTextSelected: {
    color: theme.palette.white,
  },
  actionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: theme.spacing.lg,
  },
  dangerText: {
    color: theme.colors.error,
  },
  infoCard: {
    alignItems: 'center' as const,
  },
  appName: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: 4,
  },
  version: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  description: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
}));
