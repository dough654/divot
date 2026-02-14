import { requireNativeModule } from 'expo-modules-core';

type NativeModule = {
  /** Returns the latest frame diff magnitude (0-1), or null if not yet computed. */
  getLatestMotion: () => number | null;
};

/**
 * Native module that registers the "frameDiff" frame processor plugin.
 * The plugin computes luminance-based frame differencing on camera frames
 * and returns a normalized motion magnitude.
 */
const VisionCameraFrameDiffModule =
  requireNativeModule<NativeModule>('VisionCameraFrameDiff');

/** Returns the latest frame diff magnitude (0-1), or null if not yet computed. */
export const getLatestMotion = (): number | null => {
  return VisionCameraFrameDiffModule.getLatestMotion();
};
