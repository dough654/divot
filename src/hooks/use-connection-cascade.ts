import { useState, useCallback, useRef } from 'react';
import type { ConnectionStep, ConnectionMode, ConnectionCascadeState } from '@/src/types';

const LOCAL_DISCOVERY_TIMEOUT_MS = 5000;

export type UseConnectionCascadeOptions = {
  mode: ConnectionMode;
  sessionId: string;
  onLocalDiscoveryAttempt?: () => Promise<string | null>; // Returns local IP if found
  onHotspotSetupNeeded?: () => void;
  onSignalingConnect?: () => Promise<boolean>;
  onWebRTCConnect?: () => Promise<boolean>;
};

export type UseConnectionCascadeResult = {
  state: ConnectionCascadeState;
  startCascade: () => Promise<void>;
  retry: () => Promise<void>;
  switchToHotspot: () => void;
  reset: () => void;
};

const initialState: ConnectionCascadeState = {
  step: 'idle',
  mode: 'auto',
  sessionId: null,
  localIpAddress: null,
  hotspotSsid: null,
  hotspotPassword: null,
  errorMessage: null,
};

/**
 * Hook for managing the connection cascade flow.
 * Orchestrates the WiFi -> Hotspot fallback logic.
 */
export const useConnectionCascade = (
  options: UseConnectionCascadeOptions
): UseConnectionCascadeResult => {
  const {
    mode,
    sessionId,
    onLocalDiscoveryAttempt,
    onHotspotSetupNeeded,
    onSignalingConnect,
    onWebRTCConnect,
  } = options;

  const [state, setState] = useState<ConnectionCascadeState>({
    ...initialState,
    mode,
    sessionId,
  });

  const isRunningRef = useRef(false);

  const updateState = useCallback((updates: Partial<ConnectionCascadeState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const attemptLocalDiscovery = useCallback(async (): Promise<boolean> => {
    if (!onLocalDiscoveryAttempt) return false;

    updateState({ step: 'discovering-local' });

    try {
      const localIp = await Promise.race([
        onLocalDiscoveryAttempt(),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), LOCAL_DISCOVERY_TIMEOUT_MS)
        ),
      ]);

      if (localIp) {
        updateState({ localIpAddress: localIp });
        return true;
      }

      updateState({ step: 'local-discovery-failed' });
      return false;
    } catch (error) {
      updateState({
        step: 'local-discovery-failed',
        errorMessage: error instanceof Error ? error.message : 'Discovery failed',
      });
      return false;
    }
  }, [onLocalDiscoveryAttempt, updateState]);

  const initiateHotspotFlow = useCallback(() => {
    updateState({ step: 'setting-up-hotspot' });
    onHotspotSetupNeeded?.();
  }, [onHotspotSetupNeeded, updateState]);

  const connectViaSignaling = useCallback(async (): Promise<boolean> => {
    if (!onSignalingConnect) return false;

    updateState({ step: 'exchanging-signaling' });

    try {
      const success = await onSignalingConnect();
      return success;
    } catch (error) {
      updateState({
        errorMessage: error instanceof Error ? error.message : 'Signaling failed',
      });
      return false;
    }
  }, [onSignalingConnect, updateState]);

  const establishWebRTC = useCallback(async (): Promise<boolean> => {
    if (!onWebRTCConnect) return false;

    updateState({ step: 'establishing-webrtc' });

    try {
      const success = await onWebRTCConnect();
      if (success) {
        updateState({ step: 'connected' });
      } else {
        updateState({
          step: 'failed',
          errorMessage: 'WebRTC connection failed',
        });
      }
      return success;
    } catch (error) {
      updateState({
        step: 'failed',
        errorMessage: error instanceof Error ? error.message : 'WebRTC failed',
      });
      return false;
    }
  }, [onWebRTCConnect, updateState]);

  const startCascade = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    updateState({
      step: 'generating-session',
      errorMessage: null,
    });

    try {
      // If mode is hotspot, skip local discovery
      if (mode === 'hotspot') {
        initiateHotspotFlow();
        isRunningRef.current = false;
        return;
      }

      // Try local discovery first (Auto mode)
      const localDiscoverySuccess = await attemptLocalDiscovery();

      if (!localDiscoverySuccess) {
        // Fall back to hotspot
        initiateHotspotFlow();
        isRunningRef.current = false;
        return;
      }

      // Continue with signaling
      const signalingSuccess = await connectViaSignaling();
      if (!signalingSuccess) {
        updateState({
          step: 'failed',
          errorMessage: 'Failed to connect to signaling server',
        });
        isRunningRef.current = false;
        return;
      }

      // Establish WebRTC
      await establishWebRTC();
    } finally {
      isRunningRef.current = false;
    }
  }, [
    mode,
    attemptLocalDiscovery,
    initiateHotspotFlow,
    connectViaSignaling,
    establishWebRTC,
    updateState,
  ]);

  const retry = useCallback(async () => {
    updateState({
      ...initialState,
      mode,
      sessionId,
    });
    await startCascade();
  }, [mode, sessionId, startCascade, updateState]);

  const switchToHotspot = useCallback(() => {
    updateState({ mode: 'hotspot' });
    initiateHotspotFlow();
  }, [initiateHotspotFlow, updateState]);

  const reset = useCallback(() => {
    isRunningRef.current = false;
    setState({
      ...initialState,
      mode,
      sessionId,
    });
  }, [mode, sessionId]);

  return {
    state,
    startCascade,
    retry,
    switchToHotspot,
    reset,
  };
};
