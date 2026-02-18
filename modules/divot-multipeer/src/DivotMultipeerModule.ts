import { requireOptionalNativeModule } from 'expo-modules-core';

type DivotMultipeerNativeModule = {
  startAdvertising: (roomCode: string) => void;
  startBrowsing: (roomCode: string) => void;
  sendMessage: (type: string, payload: string) => void;
  respondToInvitation: (accept: boolean) => void;
  disconnect: () => void;
  addListener: (eventName: string, listener: (...args: any[]) => void) => { remove: () => void };
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
 *
 * Returns `null` on platforms where MultipeerConnectivity is unavailable (e.g. Android).
 */
export const DivotMultipeerModule =
  requireOptionalNativeModule<DivotMultipeerNativeModule>('DivotMultipeer');
