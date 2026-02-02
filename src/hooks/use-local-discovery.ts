import { useState, useEffect, useCallback, useRef } from 'react';
import { createLocalDiscovery, LocalDiscoveryManager } from '@/src/services/discovery';
import type { LocalDiscoveryService, LocalDiscoveryState } from '@/src/types';

export type UseLocalDiscoveryResult = {
  state: LocalDiscoveryState;
  publishService: (params: { name: string; port: number; sessionId: string }) => void;
  unpublishService: () => void;
  startBrowsing: (timeoutMs?: number) => Promise<LocalDiscoveryService[]>;
  stopBrowsing: () => void;
  discoveredServices: LocalDiscoveryService[];
};

/**
 * Hook for local network device discovery using mDNS/Zeroconf.
 * Used for finding devices on the same local network.
 */
export const useLocalDiscovery = (): UseLocalDiscoveryResult => {
  const [state, setState] = useState<LocalDiscoveryState>({
    isPublishing: false,
    isBrowsing: false,
    discoveredServices: [],
    error: null,
  });

  const discoveryRef = useRef<LocalDiscoveryManager | null>(null);

  useEffect(() => {
    discoveryRef.current = createLocalDiscovery({
      onStateChange: setState,
      onServiceFound: (service) => {
        console.log('Service found:', service.name, service.addresses);
      },
      onServiceLost: (serviceName) => {
        console.log('Service lost:', serviceName);
      },
      onError: (error) => {
        console.error('Discovery error:', error);
      },
    });

    return () => {
      discoveryRef.current?.destroy();
    };
  }, []);

  const publishService = useCallback(
    (params: { name: string; port: number; sessionId: string }) => {
      discoveryRef.current?.publishService(params);
    },
    []
  );

  const unpublishService = useCallback(() => {
    discoveryRef.current?.unpublishService();
  }, []);

  const startBrowsing = useCallback(async (timeoutMs?: number): Promise<LocalDiscoveryService[]> => {
    if (!discoveryRef.current) return [];
    return discoveryRef.current.startBrowsing({ timeoutMs });
  }, []);

  const stopBrowsing = useCallback(() => {
    discoveryRef.current?.stopBrowsing();
  }, []);

  return {
    state,
    publishService,
    unpublishService,
    startBrowsing,
    stopBrowsing,
    discoveredServices: state.discoveredServices,
  };
};
