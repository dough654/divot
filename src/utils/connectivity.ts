/**
 * Determines whether a connection should be blocked based on platform
 * compatibility and internet reachability.
 *
 * Same-platform connections may work via local P2P in the future,
 * so they are never blocked. Cross-platform connections require the
 * signaling server and therefore need internet.
 */
export type ConnectivityCheckParams = {
  localPlatform: 'ios' | 'android';
  remotePlatform: 'ios' | 'android';
  isInternetReachable: boolean | null;
};

/**
 * Returns true if the connection should be blocked due to missing internet
 * on a cross-platform pairing.
 */
export const shouldBlockConnection = ({
  localPlatform,
  remotePlatform,
  isInternetReachable,
}: ConnectivityCheckParams): boolean => {
  // Same platform — future P2P possible, never block
  if (localPlatform === remotePlatform) {
    return false;
  }

  // Cross-platform + no internet → block
  if (isInternetReachable === false) {
    return true;
  }

  // null (unknown) → optimistic, don't block
  return false;
};
