import { useEffect, useRef } from 'react';
import { trackEvent } from '@/src/services/analytics';
import { getConnectionTier } from '@/src/utils/connection-tier';
import type { AutoConnectState } from './use-auto-connect';

type UseConnectionAnalyticsOptions = {
  autoConnectState: AutoConnectState;
  activeTransport: 'p2p' | 'server' | null;
  isConnected: boolean;
  connectionMethod: 'ble' | 'qr' | 'manual' | null;
  localPlatform: 'ios' | 'android';
  remotePlatform?: 'ios' | 'android';
  nearbyDeviceCount?: number;
};

/**
 * Observes connection state transitions and fires analytics events:
 *
 * - `connection_started` — when a connection method is chosen
 * - `connection_established` — when `isConnected` becomes true
 * - `ble_discovery_result` — when BLE is selected (with device count)
 * - `p2p_fallback` — when P2P attempt falls back to server
 */
export const useConnectionAnalytics = (options: UseConnectionAnalyticsOptions): void => {
  const {
    autoConnectState,
    activeTransport,
    isConnected,
    connectionMethod,
    localPlatform,
    remotePlatform,
    nearbyDeviceCount,
  } = options;

  const startTimeRef = useRef<number | null>(null);
  const hasTrackedStartRef = useRef(false);
  const hasTrackedEstablishedRef = useRef(false);
  const hasTrackedFallbackRef = useRef(false);
  const previousAutoConnectStateRef = useRef<AutoConnectState>('idle');

  // connection_started + ble_discovery_result
  useEffect(() => {
    if (!connectionMethod || hasTrackedStartRef.current) return;

    hasTrackedStartRef.current = true;
    startTimeRef.current = Date.now();

    trackEvent('connection_started', {
      connectionMethod,
      localPlatform,
      remotePlatform: remotePlatform ?? 'unknown',
    });

    if (connectionMethod === 'ble' && nearbyDeviceCount !== undefined) {
      trackEvent('ble_discovery_result', {
        deviceCount: nearbyDeviceCount,
      });
    }
  }, [connectionMethod, localPlatform, remotePlatform, nearbyDeviceCount]);

  // connection_established
  useEffect(() => {
    if (!isConnected || hasTrackedEstablishedRef.current) return;

    hasTrackedEstablishedRef.current = true;

    const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : null;
    const tier = connectionMethod
      ? getConnectionTier({
          activeTransport,
          localPlatform,
          remotePlatform,
          connectionMethod,
        })
      : null;

    trackEvent('connection_established', {
      tier: tier?.tier ?? 0,
      tierLabel: tier?.label ?? 'unknown',
      transport: activeTransport ?? 'unknown',
      durationMs: durationMs ?? -1,
      connectionMethod: connectionMethod ?? 'unknown',
      localPlatform,
      remotePlatform: remotePlatform ?? 'unknown',
    });
  }, [isConnected, activeTransport, connectionMethod, localPlatform, remotePlatform]);

  // p2p_fallback
  useEffect(() => {
    const previous = previousAutoConnectStateRef.current;
    previousAutoConnectStateRef.current = autoConnectState;

    if (
      previous === 'attempting-p2p' &&
      autoConnectState === 'needs-server' &&
      !hasTrackedFallbackRef.current
    ) {
      hasTrackedFallbackRef.current = true;
      trackEvent('p2p_fallback', {
        localPlatform,
        remotePlatform: remotePlatform ?? 'unknown',
      });
    }
  }, [autoConnectState, localPlatform, remotePlatform]);
};
