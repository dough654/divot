import { requireOptionalNativeModule } from 'expo-modules-core';

type DivotWifiDirectNativeModule = {
  startAdvertising: (roomCode: string) => void;
  startBrowsing: (roomCode: string) => void;
  sendMessage: (type: string, payload: string) => void;
  respondToInvitation: (accept: boolean) => void;
  disconnect: () => void;
  addListener: (eventName: string, listener: (...args: any[]) => void) => { remove: () => void };
};

/**
 * Native module exposing Wi-Fi Direct for local WebRTC signaling relay on Android.
 *
 * Camera calls `startAdvertising(roomCode)`, viewer calls `startBrowsing(roomCode)`.
 * Once connected, both sides exchange signaling messages via `sendMessage(type, payload)`.
 *
 * The returned object is also an EventEmitter (Expo SDK 52+) that emits
 * `onPeerConnected`, `onPeerDisconnected`, `onSignalingMessage`, and `onInvitationReceived` events.
 * Use `addListener()` directly on this object.
 *
 * Returns `null` on platforms where Wi-Fi Direct is unavailable (e.g. iOS).
 */
export const DivotWifiDirectModule =
  requireOptionalNativeModule<DivotWifiDirectNativeModule>('DivotWifiDirect');
