import { useState, useEffect } from 'react';
import { NativeModules } from 'react-native';

const HAS_NETINFO = !!NativeModules.RNCNetInfo;

export type UseConnectivityResult = {
  /** Whether the device has network connectivity. */
  isConnected: boolean | null;
  /** Whether the internet is actually reachable (not just connected to a network). */
  isInternetReachable: boolean | null;
};

/**
 * Subscribes to network state changes and returns current connectivity status.
 * Returns null values if the native module isn't linked (pre-rebuild).
 */
export const useConnectivity = (): UseConnectivityResult => {
  const [state, setState] = useState<UseConnectivityResult>({
    isConnected: null,
    isInternetReachable: null,
  });

  useEffect(() => {
    if (!HAS_NETINFO) {
      console.warn('[useConnectivity] RNCNetInfo native module not available. Rebuild the dev client.');
      return;
    }

    const NetInfo = require('@react-native-community/netinfo').default;
    const unsubscribe = NetInfo.addEventListener((netState: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      setState({
        isConnected: netState.isConnected,
        isInternetReachable: netState.isInternetReachable,
      });
    });

    return unsubscribe;
  }, []);

  return state;
};
