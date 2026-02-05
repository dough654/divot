import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Hook for triggering haptic feedback throughout the app.
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

  const light = useCallback(() => {
    if (!isSupported) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [isSupported]);

  const medium = useCallback(() => {
    if (!isSupported) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [isSupported]);

  const heavy = useCallback(() => {
    if (!isSupported) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, [isSupported]);

  const success = useCallback(() => {
    if (!isSupported) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [isSupported]);

  const warning = useCallback(() => {
    if (!isSupported) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [isSupported]);

  const error = useCallback(() => {
    if (!isSupported) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, [isSupported]);

  const selection = useCallback(() => {
    if (!isSupported) return;
    Haptics.selectionAsync().catch(() => {});
  }, [isSupported]);

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
