import { requireNativeModule } from 'expo-modules-core';

type NativeModule = {
  startAdvertising: (roomCode: string) => void;
  startBrowsing: (roomCode: string) => void;
  sendMessage: (type: string, payload: string) => void;
  disconnect: () => void;
};

/**
 * Native module exposing MultipeerConnectivity for local WebRTC signaling relay.
 *
 * Camera calls `startAdvertising(roomCode)`, viewer calls `startBrowsing(roomCode)`.
 * Once connected, both sides exchange signaling messages via `sendMessage(type, payload)`.
 *
 * The returned object is also an EventEmitter (Expo SDK 52+) that emits
 * `onPeerConnected`, `onPeerDisconnected`, and `onSignalingMessage` events.
 * Use `addListener()` directly on this object.
 */
export const SwingLinkMultipeerModule =
  requireNativeModule<NativeModule>('SwingLinkMultipeer');
