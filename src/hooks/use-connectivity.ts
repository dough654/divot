import { useState, useEffect } from 'react';

export type UseConnectivityResult = {
  /** Whether the device has network connectivity. */
  isConnected: boolean | null;
  /** Whether the internet is actually reachable (not just connected to a network). */
  isInternetReachable: boolean | null;
};

/**
 * Subscribes to network state changes and returns current connectivity status.
 * Gracefully returns null values if the native module isn't linked (pre-rebuild).
 */
export const useConnectivity = (): UseConnectivityResult => {
  const [state, setState] = useState<UseConnectivityResult>({
    isConnected: null,
    isInternetReachable: null,
  });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    try {
      // Dynamic import avoids crash if native module isn't linked yet
      const NetInfo = require('@react-native-community/netinfo').default;
      unsubscribe = NetInfo.addEventListener((netState: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
        setState({
          isConnected: netState.isConnected,
          isInternetReachable: netState.isInternetReachable,
        });
      });
    } catch {
      console.warn('[useConnectivity] @react-native-community/netinfo native module not available. Rebuild the dev client.');
    }

    return () => unsubscribe?.();
  }, []);

  return state;
};
