import { requireNativeModule } from 'expo-modules-core';

type NativeModule = {
  /** No-op — plugin is registered in OnCreate. Exposed for potential future config. */
  isAvailable: () => boolean;
  /** Returns the latest club detection result (9-element array), or null if no club detected. */
  getLatestClub: () => number[] | null;
};

/**
 * Native module that registers the "detectClub" frame processor plugin.
 * The plugin runs a custom YOLOv8-nano-pose model (CoreML on iOS, TFLite on Android)
 * to detect golf club keypoints and returns a flat array of 3 keypoint positions:
 * [grip_x, grip_y, grip_conf, shaftMid_x, shaftMid_y, shaftMid_conf, head_x, head_y, head_conf].
 */
export const VisionCameraClubDetectionModule =
  requireNativeModule<NativeModule>('VisionCameraClubDetection');
