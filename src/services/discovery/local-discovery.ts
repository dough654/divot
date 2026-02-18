import Zeroconf from 'react-native-zeroconf';
import type { LocalDiscoveryService, LocalDiscoveryState } from '@/src/types';

const SERVICE_TYPE = '_divot._tcp.';
const SERVICE_DOMAIN = 'local.';
const DISCOVERY_TIMEOUT_MS = 5000;

export type LocalDiscoveryCallbacks = {
  onServiceFound?: (service: LocalDiscoveryService) => void;
  onServiceLost?: (serviceName: string) => void;
  onError?: (error: string) => void;
  onStateChange?: (state: LocalDiscoveryState) => void;
};

/**
 * Creates a local network discovery manager using mDNS/Zeroconf.
 * Used to discover devices on the same local network without a signaling server.
 */
export const createLocalDiscovery = (callbacks: LocalDiscoveryCallbacks = {}) => {
  const zeroconf = new Zeroconf();
  let isPublishing = false;
  let isBrowsing = false;
  let discoveredServices: LocalDiscoveryService[] = [];
  let discoveryTimeout: ReturnType<typeof setTimeout> | null = null;

  const updateState = () => {
    callbacks.onStateChange?.({
      isPublishing,
      isBrowsing,
      discoveredServices,
      error: null,
    });
  };

  // Set up event listeners
  zeroconf.on('resolved', (service) => {
    const discoveryService: LocalDiscoveryService = {
      name: service.name,
      type: service.type,
      host: service.host,
      port: service.port,
      addresses: service.addresses || [],
      txt: service.txt || {},
    };

    // Avoid duplicates
    const existingIndex = discoveredServices.findIndex((s) => s.name === service.name);
    if (existingIndex >= 0) {
      discoveredServices[existingIndex] = discoveryService;
    } else {
      discoveredServices.push(discoveryService);
    }

    callbacks.onServiceFound?.(discoveryService);
    updateState();
  });

  zeroconf.on('remove', (serviceName) => {
    discoveredServices = discoveredServices.filter((s) => s.name !== serviceName);
    callbacks.onServiceLost?.(serviceName);
    updateState();
  });

  zeroconf.on('error', (error) => {
    callbacks.onError?.(error?.message || 'Unknown error');
    callbacks.onStateChange?.({
      isPublishing,
      isBrowsing,
      discoveredServices,
      error: error?.message || 'Unknown error',
    });
  });

  /**
   * Publishes a service for other devices to discover.
   * Used by the camera device to advertise its presence.
   */
  const publishService = (params: {
    name: string;
    port: number;
    sessionId: string;
  }): void => {
    const { name, port, sessionId } = params;

    try {
      zeroconf.publishService(SERVICE_TYPE.slice(0, -1), 'tcp', name, port, {
        sessionId,
        version: '1',
      });
      isPublishing = true;
      updateState();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish service';
      callbacks.onError?.(errorMessage);
    }
  };

  /**
   * Stops publishing the service.
   */
  const unpublishService = (): void => {
    try {
      zeroconf.unpublishService('Divot');
      isPublishing = false;
      updateState();
    } catch (error) {
      // Ignore errors when unpublishing
    }
  };

  /**
   * Starts scanning for services on the local network.
   * Used by the viewer device to find the camera.
   */
  const startBrowsing = (params: { timeoutMs?: number } = {}): Promise<LocalDiscoveryService[]> => {
    const { timeoutMs = DISCOVERY_TIMEOUT_MS } = params;

    return new Promise((resolve) => {
      discoveredServices = [];
      isBrowsing = true;
      updateState();

      try {
        zeroconf.scan(SERVICE_TYPE, SERVICE_DOMAIN);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to start browsing';
        callbacks.onError?.(errorMessage);
        isBrowsing = false;
        updateState();
        resolve([]);
        return;
      }

      // Set timeout for discovery
      discoveryTimeout = setTimeout(() => {
        stopBrowsing();
        resolve(discoveredServices);
      }, timeoutMs);
    });
  };

  /**
   * Stops scanning for services.
   */
  const stopBrowsing = (): void => {
    if (discoveryTimeout) {
      clearTimeout(discoveryTimeout);
      discoveryTimeout = null;
    }

    try {
      zeroconf.stop();
    } catch (error) {
      // Ignore errors when stopping
    }

    isBrowsing = false;
    updateState();
  };

  /**
   * Cleans up resources.
   */
  const destroy = (): void => {
    stopBrowsing();
    unpublishService();
    zeroconf.removeAllListeners();
  };

  /**
   * Returns current state.
   */
  const getState = (): LocalDiscoveryState => ({
    isPublishing,
    isBrowsing,
    discoveredServices,
    error: null,
  });

  /**
   * Returns discovered services.
   */
  const getDiscoveredServices = (): LocalDiscoveryService[] => [...discoveredServices];

  return {
    publishService,
    unpublishService,
    startBrowsing,
    stopBrowsing,
    destroy,
    getState,
    getDiscoveredServices,
  };
};

export type LocalDiscoveryManager = ReturnType<typeof createLocalDiscovery>;
