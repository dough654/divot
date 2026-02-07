import { requireNativeModule } from 'expo-modules-core';

type NativeModule = {
  startAdvertising: (roomCode: string) => void;
  stopAdvertising: () => void;
  startScanning: () => void;
  stopScanning: () => void;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

/**
 * Native module exposing BLE advertising (camera side)
 * and scanning (viewer side) for nearby device discovery.
 */
export const SwingLinkBLEModule =
  requireNativeModule<NativeModule>('SwingLinkBLE');
