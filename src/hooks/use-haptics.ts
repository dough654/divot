import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Import settings context directly to avoid circular dependency through index
import { useSettings } from '../context/settings-context';

/**
 * Hook for triggering haptic feedback throughout the app.
 * Respects the global hapticsEnabled setting from SettingsContext.
 * Gracefully no-ops on unsupported devices (web, older Android).
 *
 * @example
 * const haptics = useHaptics();
 *
 * // Button press
 * haptics.light();
 *
 * // Recording start/stop
 * haptics.heavy();
 *
 * // Success (connection established, QR scanned)
 * haptics.success();
 *
 * // Error occurred
 * haptics.error();
 */
export const useHaptics = () => {
  const isSupported = Platform.OS === 'ios' || Platform.OS === 'android';

  // Try to get haptics setting, default to enabled if context not available
  let hapticsEnabled = true;
  try {
    const { settings } = useSettings();
    hapticsEnabled = settings.hapticsEnabled;
  } catch {
    // Settings context not available, default to enabled
  }

  const isEnabled = isSupported && hapticsEnabled;

  const light = useCallback(() => {
    if (!isEnabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [isEnabled]);

  const medium = useCallback(() => {
    if (!isEnabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [isEnabled]);

  const heavy = useCallback(() => {
    if (!isEnabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, [isEnabled]);

  const success = useCallback(() => {
    if (!isEnabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [isEnabled]);

  const warning = useCallback(() => {
    if (!isEnabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [isEnabled]);

  const error = useCallback(() => {
    if (!isEnabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, [isEnabled]);

  const selection = useCallback(() => {
    if (!isEnabled) return;
    Haptics.selectionAsync().catch(() => {});
  }, [isEnabled]);

  return {
    /** Light impact - for button presses, selections */
    light,
    /** Medium impact - for confirmations */
    medium,
    /** Heavy impact - for significant actions (start/stop recording) */
    heavy,
    /** Success notification - for completed actions */
    success,
    /** Warning notification - for alerts */
    warning,
    /** Error notification - for failures */
    error,
    /** Selection feedback - for picker/toggle changes */
    selection,
    /** Whether haptics are supported on this device */
    isSupported,
  };
};
