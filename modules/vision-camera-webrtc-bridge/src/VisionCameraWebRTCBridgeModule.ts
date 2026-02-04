import { requireNativeModule } from 'expo-modules-core';
import type { VisionCameraTrackInfo } from './types';

type NativeModule = {
  createVisionCameraTrack: () => Promise<VisionCameraTrackInfo>;
  stopForwarding: () => void;
};

/**
 * Native module that bridges VisionCamera frame processor frames
 * into a WebRTC video track without crossing the JS bridge.
 */
export const VisionCameraWebRTCBridgeModule =
  requireNativeModule<NativeModule>('VisionCameraWebRTCBridge');
