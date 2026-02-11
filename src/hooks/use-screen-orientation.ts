import { useEffect, useState } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';

type UseScreenOrientationOptions = {
  /** Lock to portrait or landscape. Omit to allow free rotation. */
  lock?: 'portrait' | 'landscape';
};

type UseScreenOrientationReturn = {
  /** Current device orientation category. */
  orientation: 'portrait' | 'landscape';
  /** Convenience boolean — true when device is landscape. */
  isLandscape: boolean;
};

/**
 * Manages per-screen orientation locking and tracks the current orientation.
 *
 * - Pass `{ lock: 'portrait' }` on screens that must stay portrait.
 * - Omit `lock` on screens that should freely rotate (viewer, playback).
 * - On unmount the lock is released so navigation doesn't leave stale locks.
 *
 * Excluded from hooks barrel — has native dep (expo-screen-orientation).
 * Import directly: `import { useScreenOrientation } from '@/src/hooks/use-screen-orientation';`
 */
export const useScreenOrientation = (
  options: UseScreenOrientationOptions = {},
): UseScreenOrientationReturn => {
  const { lock } = options;

  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    // Start with a sensible default; the listener will correct immediately
    return 'portrait';
  });

  // Lock / unlock on mount, release on unmount
  useEffect(() => {
    if (lock === 'portrait') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else if (lock === 'landscape') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else {
      ScreenOrientation.unlockAsync();
    }

    return () => {
      // Release any lock when leaving the screen
      ScreenOrientation.unlockAsync();
    };
  }, [lock]);

  // Subscribe to orientation changes for real-time tracking
  useEffect(() => {
    const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
      const { orientation: deviceOrientation } = event.orientationInfo;
      const isLandscapeOrientation =
        deviceOrientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        deviceOrientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      setOrientation(isLandscapeOrientation ? 'landscape' : 'portrait');
    });

    // Read current orientation immediately
    ScreenOrientation.getOrientationAsync().then((current) => {
      const isLandscapeOrientation =
        current === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        current === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      setOrientation(isLandscapeOrientation ? 'landscape' : 'portrait');
    });

    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  return {
    orientation,
    isLandscape: orientation === 'landscape',
  };
};
