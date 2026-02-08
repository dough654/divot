import { requireNativeModule } from 'expo-modules-core';

type NativeModule = {
  startAdvertising: (roomCode: string) => void;
  stopAdvertising: () => void;
  startScanning: () => void;
  stopScanning: () => void;
};

/**
 * Native module exposing BLE advertising (camera side)
 * and scanning (viewer side) for nearby device discovery.
 *
 * The returned object is also an EventEmitter (Expo SDK 52+) that emits
 * `onDeviceFound` and `onDeviceLost` events. Use `addListener()` directly
 * on this object — do NOT wrap it with RN's NativeEventEmitter.
 */
export const SwingLinkBLEModule =
  requireNativeModule<NativeModule>('SwingLinkBLE');
