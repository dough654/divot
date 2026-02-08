import { useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type UseConnectivityResult = {
  /** Whether the device has network connectivity. */
  isConnected: boolean | null;
  /** Whether the internet is actually reachable (not just connected to a network). */
  isInternetReachable: boolean | null;
};

/**
 * Subscribes to network state changes and returns current connectivity status.
 */
export const useConnectivity = (): UseConnectivityResult => {
  const [state, setState] = useState<UseConnectivityResult>({
    isConnected: null,
    isInternetReachable: null,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      setState({
        isConnected: netState.isConnected,
        isInternetReachable: netState.isInternetReachable,
      });
    });

    return unsubscribe;
  }, []);

  return state;
};
