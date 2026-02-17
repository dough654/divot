import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Warms up the Android Custom Tabs browser session for faster OAuth popup.
 * No-ops on iOS (Safari View Controller doesn't benefit from warm-up).
 */
export const useWarmUpBrowser = (): void => {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    WebBrowser.warmUpAsync();
    return () => {
      WebBrowser.coolDownAsync();
    };
  }, []);
};
