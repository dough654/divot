import { useState, useEffect, useCallback } from 'react';
import { useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { getOrientationType } from '@/src/utils/orientation-mapping';
import type { ScreenOrientationType } from '@/src/utils/orientation-mapping';

type UseOrientationResult = {
  isLandscape: boolean;
  orientation: ScreenOrientationType;
  windowWidth: number;
  windowHeight: number;
  lockToPortrait: () => Promise<void>;
  lockToLandscape: () => Promise<void>;
  unlock: () => Promise<void>;
};

/**
 * Hook that provides current device orientation and lock/unlock controls.
 *
 * Uses `expo-screen-orientation` for event-based orientation tracking
 * and `useWindowDimensions` for responsive width/height values.
 *
 * @returns Orientation state and control functions
 */
const useOrientation = (): UseOrientationResult => {
  const { width, height } = useWindowDimensions();
  const [orientationType, setOrientationType] = useState<ScreenOrientationType>(
    getOrientationType(width, height)
  );

  // Keep orientation state in sync with dimension changes
  useEffect(() => {
    setOrientationType(getOrientationType(width, height));
  }, [width, height]);

  // Subscribe to orientation change events for faster updates
  useEffect(() => {
    const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
      const { orientationInfo } = event;
      const isLandscapeOrientation =
        orientationInfo.orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientationInfo.orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      setOrientationType(isLandscapeOrientation ? 'landscape' : 'portrait');
    });

    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  const lockToPortrait = useCallback(async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  const lockToLandscape = useCallback(async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);

  const unlock = useCallback(async () => {
    await ScreenOrientation.unlockAsync();
  }, []);

  return {
    isLandscape: orientationType === 'landscape',
    orientation: orientationType,
    windowWidth: width,
    windowHeight: height,
    lockToPortrait,
    lockToLandscape,
    unlock,
  };
};

export { useOrientation };
export type { UseOrientationResult };
