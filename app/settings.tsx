import { View, Text, Switch, Pressable, Alert, Linking, ScrollView } from 'react-native';
import { useState } from 'react';
import Slider from '@react-native-community/slider';

import { useTheme, useSettings } from '@/src/context';
import { useThemedStyles, makeThemedStyles, useHaptics } from '@/src/hooks';
import { useScreenOrientation } from '@/src/hooks/use-screen-orientation';
import { useToast } from '@/src/context';
import { clearAllClips, listClips } from '@/src/services/recording/clip-storage';
import type { Theme, ThemeMode, RecordingFps } from '@/src/context';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const FPS_OPTIONS: { value: RecordingFps; label: string }[] = [
  { value: 30, label: '30' },
  { value: 60, label: '60' },
  { value: 120, label: '120' },
  { value: 240, label: '240' },
];

const FEEDBACK_EMAIL = 'feedback@swinglink.app';

export default function SettingsScreen() {
  useScreenOrientation({ lock: 'portrait' });
  const { theme } = useTheme();
  const {
    settings,
    setHapticsEnabled,
    setThemeMode,
    setRecordingFps,
    setPoseOverlayEnabled,
    setSwingAutoDetectionEnabled,
    setSwingDetectionSensitivity,
  } = useSettings();
  const styles = useThemedStyles(createStyles);
  const haptics = useHaptics();
  const { show: showToast } = useToast();
  const [isClearing, setIsClearing] = useState(false);

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

  const handleRecordingFpsChange = (fps: RecordingFps) => {
    haptics.selection();
    setRecordingFps(fps);
  };

  const handlePoseOverlayToggle = (value: boolean) => {
    haptics.selection();
    setPoseOverlayEnabled(value);
  };

  const handleAutoDetectionToggle = (value: boolean) => {
    haptics.selection();
    setSwingAutoDetectionEnabled(value);
  };

  const handleSensitivityChange = (value: number) => {
    setSwingDetectionSensitivity(value);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>preferences</Text>

        {/* Haptic Feedback Toggle */}
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingLabel}>HAPTIC FEEDBACK</Text>
            <Text style={styles.settingDescription}>vibration on button presses</Text>
          </View>
          <Switch
            value={settings.hapticsEnabled}
            onValueChange={handleHapticsToggle}
            trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            thumbColor={theme.palette.white}
            accessibilityLabel="Toggle haptic feedback"
            accessibilityHint={settings.hapticsEnabled ? 'Disable haptic feedback' : 'Enable haptic feedback'}
          />
        </View>

        <View style={styles.divider} />

        {/* Theme Mode Selector */}
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingLabel}>APPEARANCE</Text>
            <Text style={styles.settingDescription}>choose light or dark theme</Text>
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

        <View style={styles.divider} />

        {/* Recording FPS Selector */}
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingLabel}>RECORDING FPS</Text>
            <Text style={styles.settingDescription}>higher fps for slow-motion review</Text>
          </View>
        </View>

        <View style={styles.themeOptions}>
          {FPS_OPTIONS.map((option) => {
            const isSupported = !settings.supportedRecordingFps || settings.supportedRecordingFps.includes(option.value);
            const isSelected = settings.recordingFps === option.value;
            return (
              <Pressable
                key={option.value}
                style={[
                  styles.themeOption,
                  isSelected && styles.themeOptionSelected,
                  !isSupported && styles.themeOptionDisabled,
                ]}
                onPress={() => handleRecordingFpsChange(option.value)}
                disabled={!isSupported}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: !isSupported }}
                accessibilityLabel={`${option.label} fps${!isSupported ? ' (not supported)' : ''}`}
              >
                <Text
                  style={[
                    styles.themeOptionText,
                    isSelected && styles.themeOptionTextSelected,
                    !isSupported && styles.themeOptionTextDisabled,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Recording Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>recording</Text>

        {/* Pose Overlay Toggle */}
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingLabel}>POSE OVERLAY</Text>
            <Text style={styles.settingDescription}>show skeleton on camera preview</Text>
          </View>
          <Switch
            value={settings.poseOverlayEnabled}
            onValueChange={handlePoseOverlayToggle}
            trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            thumbColor={theme.palette.white}
            accessibilityLabel="Toggle pose overlay"
            accessibilityHint={settings.poseOverlayEnabled ? 'Disable pose overlay' : 'Enable pose overlay'}
          />
        </View>

        <View style={styles.divider} />

        {/* Auto-Detect Swings Toggle */}
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingLabel}>AUTO-DETECT SWINGS</Text>
            <Text style={styles.settingDescription}>automatically start/stop recording</Text>
          </View>
          <Switch
            value={settings.swingAutoDetectionEnabled}
            onValueChange={handleAutoDetectionToggle}
            trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            thumbColor={theme.palette.white}
            accessibilityLabel="Toggle swing auto-detection"
            accessibilityHint={settings.swingAutoDetectionEnabled ? 'Disable auto-detection' : 'Enable auto-detection'}
          />
        </View>

        {/* Detection Sensitivity Slider */}
        {settings.swingAutoDetectionEnabled && (
          <>
            <View style={styles.divider} />
            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>DETECTION SENSITIVITY</Text>
                <Text style={styles.settingDescription}>
                  {settings.swingDetectionSensitivity < 0.33
                    ? 'low — fewer false triggers'
                    : settings.swingDetectionSensitivity > 0.66
                      ? 'high — catches subtle swings'
                      : 'medium'}
                </Text>
              </View>
            </View>
            <Slider
              style={styles.slider}
              value={settings.swingDetectionSensitivity}
              onSlidingComplete={handleSensitivityChange}
              minimumValue={0}
              maximumValue={1}
              step={0.05}
              minimumTrackTintColor={theme.colors.accent}
              maximumTrackTintColor={theme.colors.border}
              thumbTintColor={theme.colors.accent}
            />
          </>
        )}
      </View>

      {/* Data Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>data</Text>

        <Pressable
          style={styles.actionRow}
          onPress={handleClearClips}
          disabled={isClearing}
          accessibilityRole="button"
          accessibilityLabel="Clear all clips"
          accessibilityHint="Deletes all recorded clips from the app"
        >
          <Text style={[styles.settingLabel, styles.dangerText]}>
            {isClearing ? 'CLEARING...' : 'CLEAR ALL CLIPS'}
          </Text>
          <Text style={styles.actionArrow}>→</Text>
        </Pressable>
      </View>

      {/* Support Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>support</Text>

        <Pressable
          style={styles.actionRow}
          onPress={handleSendFeedback}
          accessibilityRole="button"
          accessibilityLabel="Send feedback"
          accessibilityHint="Opens email to send feedback"
        >
          <Text style={styles.settingLabel}>SEND FEEDBACK</Text>
          <Text style={styles.actionArrow}>→</Text>
        </Pressable>
      </View>

      {/* About */}
      <View style={styles.aboutSection}>
        <Text style={styles.appName}>swinglink</Text>
        <Text style={styles.version}>v1.0.0</Text>
        <Text style={styles.description}>
          p2p video streaming for golfers
        </Text>
      </View>
    </ScrollView>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    padding: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing['2xl'],
  },
  sectionTitle: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.accent,
    textTransform: 'lowercase' as const,
    marginBottom: theme.spacing.md,
  },
  settingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 12,
  },
  settingText: {
    flex: 1,
  },
  settingLabel: {
    fontFamily: theme.fontFamily.display,
    fontSize: 18,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.3,
  },
  settingDescription: {
    fontFamily: theme.fontFamily.body,
    fontSize: 16,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  themeOptions: {
    flexDirection: 'row' as const,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  themeOption: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  },
  themeOptionSelected: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  themeOptionDisabled: {
    opacity: 0.35,
  },
  themeOptionText: {
    fontFamily: theme.fontFamily.bodyMedium,
    fontSize: 16,
    color: theme.colors.textSecondary,
    textTransform: 'lowercase' as const,
  },
  themeOptionTextSelected: {
    color: theme.isDark ? theme.palette.black : theme.palette.white,
  },
  themeOptionTextDisabled: {
    color: theme.colors.textTertiary,
  },
  slider: {
    width: '100%' as const,
    height: 40,
    marginBottom: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 12,
  },
  actionArrow: {
    fontFamily: theme.fontFamily.body,
    fontSize: 16,
    color: theme.colors.textTertiary,
  },
  dangerText: {
    color: theme.colors.error,
  },
  aboutSection: {
    marginTop: 'auto' as const,
    alignItems: 'center' as const,
    paddingBottom: theme.spacing.lg,
  },
  appName: {
    fontFamily: theme.fontFamily.bodyMedium,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
  version: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  description: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    marginTop: 4,
  },
}));
