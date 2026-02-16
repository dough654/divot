import { requireNativeModule } from 'expo-modules-core';

type NativeModule = {
  /** No-op — plugin is registered in OnCreate. Exposed for potential future config. */
  isAvailable: () => boolean;
  /** Returns model initialization status: "not_initialized" | "loaded" | "init_failed". */
  getModelStatus: () => string;
  /** Returns the latest pose detection result (72-element array), or null if no pose detected. */
  getLatestPose: () => number[] | null;
  /** Returns the last frame orientation and buffer dimensions for diagnostics. */
  getLastOrientation: () => string;
};

/**
 * Native module that registers the "detectPose" frame processor plugin.
 * The plugin runs Apple Vision (iOS) or ML Kit (Android) pose detection
 * on camera frames and returns a flat array of joint positions.
 */
export const VisionCameraPoseDetectionModule =
  requireNativeModule<NativeModule>('VisionCameraPoseDetection');
