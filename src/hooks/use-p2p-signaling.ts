import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { DivotMultipeerModule } from '@/modules/divot-multipeer/src';
import { DivotWifiDirectModule } from '@/modules/divot-wifi-direct/src';
import type { MultipeerState, SignalingMessage, P2PInvitation } from '@/modules/divot-multipeer/src';
import type { SignalingChannel, IceCandidateInfo } from '@/src/types';

const nativeModule = Platform.OS === 'ios'
  ? DivotMultipeerModule
  : DivotWifiDirectModule;

const VIEWER_TIMEOUT_MS = 25_000;

/**
 * Requests Wi-Fi Direct runtime permissions on Android.
 * Android 13+ (API 33) requires NEARBY_WIFI_DEVICES; older versions need ACCESS_FINE_LOCATION.
 * iOS returns 'granted' immediately — MPC handles permissions via Info.plist.
 */
const requestWifiDirectPermissions = async (): Promise<'granted' | 'denied'> => {
  if (Platform.OS !== 'android') return 'granted';

  // Android 13+ (API 33): NEARBY_WIFI_DEVICES replaces location for Wi-Fi Direct
  if (Platform.Version >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES
    );
    return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
  }

  // Android < 13: ACCESS_FINE_LOCATION required for Wi-Fi Direct peer discovery
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
};

type UseP2PSignalingOptions = {
  roomCode: string | null;
  role: 'camera' | 'viewer';
  timeoutMs?: number;
};

type UseP2PSignalingResult = {
  channel: SignalingChannel;
  state: MultipeerState | 'unavailable';
  /** Pending invitation from a viewer (camera-only). Null when no invitation pending. */
  pendingInvitation: P2PInvitation | null;
  /** Accept the pending MPC invitation. */
  acceptInvitation: () => void;
  /** Reject the pending MPC invitation. */
  rejectInvitation: () => void;
  start: () => void;
  stop: () => void;
};

/** No-op unsubscribe function, shared across all no-op channel methods. */
const noop = () => {};
const noopUnsubscribe = () => noop;

/**
 * Wraps the platform-specific P2P native module (MultipeerConnectivity on iOS,
 * Wi-Fi Direct on Android) into a `SignalingChannel` that `useWebRTCConnection`
 * can consume, identical in shape to the one `useSignaling` returns for
 * server-based signaling.
 *
 * Returns state `'unavailable'` if the native module is absent (e.g. Expo Go).
 */
export const useP2PSignaling = (options: UseP2PSignalingOptions): UseP2PSignalingResult => {
  const { roomCode, role, timeoutMs = VIEWER_TIMEOUT_MS } = options;

  const [state, setState] = useState<MultipeerState | 'unavailable'>(
    nativeModule ? 'idle' : 'unavailable'
  );
  const [pendingInvitation, setPendingInvitation] = useState<P2PInvitation | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionsRef = useRef<Array<{ remove: () => void }>>([]);
  const startCancelledRef = useRef(false);

  const callbacksRef = useRef<{
    onOffer: Set<(sdp: string) => void>;
    onAnswer: Set<(sdp: string) => void>;
    onIceCandidate: Set<(candidate: IceCandidateInfo) => void>;
  }>({
    onOffer: new Set(),
    onAnswer: new Set(),
    onIceCandidate: new Set(),
  });

  const clearTimeout_ = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const removeAllListeners = useCallback(() => {
    for (const sub of subscriptionsRef.current) {
      sub.remove();
    }
    subscriptionsRef.current = [];
  }, []);

  const acceptInvitation = useCallback(() => {
    nativeModule?.respondToInvitation(true);
    setPendingInvitation(null);
  }, []);

  const rejectInvitation = useCallback(() => {
    nativeModule?.respondToInvitation(false);
    setPendingInvitation(null);
  }, []);

  const stop = useCallback(() => {
    startCancelledRef.current = true;
    clearTimeout_();
    removeAllListeners();
    nativeModule?.disconnect();
    setPendingInvitation(null);
    setState((prev) => (prev === 'unavailable' ? 'unavailable' : 'disconnected'));
  }, [clearTimeout_, removeAllListeners]);

  const start = useCallback(() => {
    if (!nativeModule || !roomCode) return;

    startCancelledRef.current = false;

    const run = async () => {
      const permissionStatus = await requestWifiDirectPermissions();
      if (startCancelledRef.current) return;

      if (permissionStatus !== 'granted') {
        setState('disconnected');
        return;
      }

      // Clean up any prior session
      removeAllListeners();
      clearTimeout_();

      setState('searching');

      // Subscribe to native events
      const peerConnectedSub = nativeModule.addListener(
        'onPeerConnected',
        () => {
          clearTimeout_();
          setPendingInvitation(null);
          setState('connected');
        }
      );

      const peerDisconnectedSub = nativeModule.addListener(
        'onPeerDisconnected',
        () => {
          setState('disconnected');
        }
      );

      const signalingMessageSub = nativeModule.addListener(
        'onSignalingMessage',
        (message: SignalingMessage) => {
          switch (message.type) {
            case 'offer':
              callbacksRef.current.onOffer.forEach((cb) => cb(message.payload));
              break;
            case 'answer':
              callbacksRef.current.onAnswer.forEach((cb) => cb(message.payload));
              break;
            case 'ice-candidate': {
              const candidate: IceCandidateInfo = JSON.parse(message.payload);
              callbacksRef.current.onIceCandidate.forEach((cb) => cb(candidate));
              break;
            }
          }
        }
      );

      const invitationReceivedSub = nativeModule.addListener(
        'onInvitationReceived',
        (event: P2PInvitation) => {
          setPendingInvitation(event);
        }
      );

      subscriptionsRef.current = [peerConnectedSub, peerDisconnectedSub, signalingMessageSub, invitationReceivedSub];

      // Start advertising or browsing based on role
      if (role === 'camera') {
        nativeModule.startAdvertising(roomCode);
      } else {
        nativeModule.startBrowsing(roomCode);
      }

      // Connection timeout — only for viewer. Camera advertises indefinitely
      // since it defaults to serverChannel anyway (first transport wins).
      if (role === 'viewer') {
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          setState((current) => {
            // Only timeout if we haven't connected yet
            if (current === 'searching' || current === 'connecting') {
              removeAllListeners();
              nativeModule.disconnect();
              return 'disconnected';
            }
            return current;
          });
        }, timeoutMs);
      }
    };

    run();
  }, [roomCode, role, timeoutMs, clearTimeout_, removeAllListeners]);

  // --- Channel methods ---

  const sendOffer = useCallback((sdp: string) => {
    nativeModule?.sendMessage('offer', sdp);
  }, []);

  const sendAnswer = useCallback((sdp: string) => {
    nativeModule?.sendMessage('answer', sdp);
  }, []);

  const sendIceCandidate = useCallback((candidate: IceCandidateInfo) => {
    nativeModule?.sendMessage('ice-candidate', JSON.stringify(candidate));
  }, []);

  const onOffer = useCallback((handler: (sdp: string) => void) => {
    callbacksRef.current.onOffer.add(handler);
    return () => { callbacksRef.current.onOffer.delete(handler); };
  }, []);

  const onAnswer = useCallback((handler: (sdp: string) => void) => {
    callbacksRef.current.onAnswer.add(handler);
    return () => { callbacksRef.current.onAnswer.delete(handler); };
  }, []);

  const onIceCandidate = useCallback((handler: (candidate: IceCandidateInfo) => void) => {
    callbacksRef.current.onIceCandidate.add(handler);
    return () => { callbacksRef.current.onIceCandidate.delete(handler); };
  }, []);

  const disconnect = useCallback(() => {
    stop();
  }, [stop]);

  const channel: SignalingChannel = useMemo(() => {
    if (!nativeModule) {
      return {
        sendOffer: noop,
        sendAnswer: noop,
        sendIceCandidate: noop,
        onOffer: noopUnsubscribe,
        onAnswer: noopUnsubscribe,
        onIceCandidate: noopUnsubscribe,
        disconnect: noop,
      };
    }

    return {
      sendOffer,
      sendAnswer,
      sendIceCandidate,
      onOffer,
      onAnswer,
      onIceCandidate,
      disconnect,
    };
  }, [sendOffer, sendAnswer, sendIceCandidate, onOffer, onAnswer, onIceCandidate, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout_();
      removeAllListeners();
      nativeModule?.disconnect();
    };
  }, [clearTimeout_, removeAllListeners]);

  return { channel, state, pendingInvitation, acceptInvitation, rejectInvitation, start, stop };
};
