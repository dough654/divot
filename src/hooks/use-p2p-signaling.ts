import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { SwingLinkMultipeerModule } from '@/modules/swinglink-multipeer/src';
import type { MultipeerState, SignalingMessage } from '@/modules/swinglink-multipeer/src';
import type { SignalingChannel, IceCandidateInfo } from '@/src/types';

const DEFAULT_TIMEOUT_MS = 15_000;

type UseP2PSignalingOptions = {
  roomCode: string | null;
  role: 'camera' | 'viewer';
  timeoutMs?: number;
};

type UseP2PSignalingResult = {
  channel: SignalingChannel;
  state: MultipeerState | 'unavailable';
  start: () => void;
  stop: () => void;
};

/** No-op unsubscribe function, shared across all no-op channel methods. */
const noop = () => {};
const noopUnsubscribe = () => noop;

/**
 * Wraps the SwingLinkMultipeer native module into a `SignalingChannel` that
 * `useWebRTCConnection` can consume, identical in shape to the one
 * `useSignaling` returns for server-based signaling.
 *
 * iOS-only for now — returns state `'unavailable'` on Android (native module
 * resolves to `null` via `requireOptionalNativeModule`).
 */
export const useP2PSignaling = (options: UseP2PSignalingOptions): UseP2PSignalingResult => {
  const { roomCode, role, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const nativeModule = SwingLinkMultipeerModule;

  const [state, setState] = useState<MultipeerState | 'unavailable'>(
    nativeModule ? 'idle' : 'unavailable'
  );

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionsRef = useRef<Array<{ remove: () => void }>>([]);

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

  const stop = useCallback(() => {
    clearTimeout_();
    removeAllListeners();
    nativeModule?.disconnect();
    setState((prev) => (prev === 'unavailable' ? 'unavailable' : 'disconnected'));
  }, [nativeModule, clearTimeout_, removeAllListeners]);

  const start = useCallback(() => {
    if (!nativeModule || !roomCode) return;

    // Clean up any prior session
    removeAllListeners();
    clearTimeout_();

    setState('searching');

    // Subscribe to native events
    const peerConnectedSub = nativeModule.addListener(
      'onPeerConnected',
      () => {
        clearTimeout_();
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

    subscriptionsRef.current = [peerConnectedSub, peerDisconnectedSub, signalingMessageSub];

    // Start advertising or browsing based on role
    if (role === 'camera') {
      nativeModule.startAdvertising(roomCode);
    } else {
      nativeModule.startBrowsing(roomCode);
    }

    // Connection timeout
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
  }, [nativeModule, roomCode, role, timeoutMs, clearTimeout_, removeAllListeners]);

  // --- Channel methods ---

  const sendOffer = useCallback((sdp: string) => {
    nativeModule?.sendMessage('offer', sdp);
  }, [nativeModule]);

  const sendAnswer = useCallback((sdp: string) => {
    nativeModule?.sendMessage('answer', sdp);
  }, [nativeModule]);

  const sendIceCandidate = useCallback((candidate: IceCandidateInfo) => {
    nativeModule?.sendMessage('ice-candidate', JSON.stringify(candidate));
  }, [nativeModule]);

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
  }, [nativeModule, sendOffer, sendAnswer, sendIceCandidate, onOffer, onAnswer, onIceCandidate, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout_();
      removeAllListeners();
      nativeModule?.disconnect();
    };
  }, [nativeModule, clearTimeout_, removeAllListeners]);

  return { channel, state, start, stop };
};
