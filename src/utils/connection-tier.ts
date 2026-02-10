export type ConnectionTierInput = {
  activeTransport: 'p2p' | 'server' | null;
  localPlatform: 'ios' | 'android';
  remotePlatform?: 'ios' | 'android';
  connectionMethod: 'ble' | 'qr' | 'manual';
};

export type ConnectionTier = {
  tier: 1 | 2 | 3 | 4;
  label: string;
};

/**
 * Determines the connection tier based on transport, platforms, and discovery method.
 *
 * - Tier 1: iOS↔iOS P2P (MultipeerConnectivity)
 * - Tier 2: Android↔Android P2P (Wi-Fi Direct)
 * - Tier 3: Cross-platform via server, discovered by BLE
 * - Tier 4: QR or manual code entry (server relay)
 */
export const getConnectionTier = (input: ConnectionTierInput): ConnectionTier => {
  const { activeTransport, localPlatform, remotePlatform, connectionMethod } = input;

  if (activeTransport === 'p2p') {
    const isBothIOS = localPlatform === 'ios' && remotePlatform === 'ios';
    if (isBothIOS) {
      return { tier: 1, label: 'iOS P2P' };
    }
    return { tier: 2, label: 'Android P2P' };
  }

  if (connectionMethod === 'ble') {
    return { tier: 3, label: 'Server (BLE discovery)' };
  }

  return { tier: 4, label: 'Server (QR/manual)' };
};
