import { describe, it, expect } from 'vitest';
import { getConnectionTier } from './connection-tier';
import type { ConnectionTierInput } from './connection-tier';

describe('getConnectionTier', () => {
  it('returns tier 1 for iOS↔iOS P2P', () => {
    const input: ConnectionTierInput = {
      activeTransport: 'p2p',
      localPlatform: 'ios',
      remotePlatform: 'ios',
      connectionMethod: 'ble',
    };
    expect(getConnectionTier(input)).toEqual({ tier: 1, label: 'iOS P2P' });
  });

  it('returns tier 2 for Android↔Android P2P', () => {
    const input: ConnectionTierInput = {
      activeTransport: 'p2p',
      localPlatform: 'android',
      remotePlatform: 'android',
      connectionMethod: 'ble',
    };
    expect(getConnectionTier(input)).toEqual({ tier: 2, label: 'Android P2P' });
  });

  it('returns tier 2 for P2P when remote platform is unknown', () => {
    const input: ConnectionTierInput = {
      activeTransport: 'p2p',
      localPlatform: 'android',
      connectionMethod: 'ble',
    };
    expect(getConnectionTier(input)).toEqual({ tier: 2, label: 'Android P2P' });
  });

  it('returns tier 3 for BLE-discovered server connection', () => {
    const input: ConnectionTierInput = {
      activeTransport: 'server',
      localPlatform: 'ios',
      remotePlatform: 'android',
      connectionMethod: 'ble',
    };
    expect(getConnectionTier(input)).toEqual({ tier: 3, label: 'Server (BLE discovery)' });
  });

  it('returns tier 4 for QR-code server connection', () => {
    const input: ConnectionTierInput = {
      activeTransport: 'server',
      localPlatform: 'android',
      remotePlatform: 'ios',
      connectionMethod: 'qr',
    };
    expect(getConnectionTier(input)).toEqual({ tier: 4, label: 'Server (QR/manual)' });
  });

  it('returns tier 4 for manual code entry', () => {
    const input: ConnectionTierInput = {
      activeTransport: 'server',
      localPlatform: 'ios',
      connectionMethod: 'manual',
    };
    expect(getConnectionTier(input)).toEqual({ tier: 4, label: 'Server (QR/manual)' });
  });

  it('returns tier 4 when transport is null with QR method', () => {
    const input: ConnectionTierInput = {
      activeTransport: null,
      localPlatform: 'android',
      connectionMethod: 'qr',
    };
    expect(getConnectionTier(input)).toEqual({ tier: 4, label: 'Server (QR/manual)' });
  });

  it('returns tier 3 when transport is null but discovered via BLE', () => {
    const input: ConnectionTierInput = {
      activeTransport: null,
      localPlatform: 'android',
      remotePlatform: 'ios',
      connectionMethod: 'ble',
    };
    expect(getConnectionTier(input)).toEqual({ tier: 3, label: 'Server (BLE discovery)' });
  });
});
