export type NetworkTransport = 'p2p' | 'wifi' | 'internet';

type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay';

/**
 * Resolves the user-facing network transport from the signaling transport and ICE candidate type.
 *
 * - P2P transport (MultipeerConnectivity / WiFi Direct) always shows "P2P"
 * - Server transport with host candidate → same LAN → "WiFi"
 * - Server transport with srflx/prflx/relay → NAT traversal → "Internet"
 */
export const resolveNetworkTransport = (
  activeTransport: 'p2p' | 'server' | null,
  candidateType?: CandidateType,
): NetworkTransport | null => {
  if (!activeTransport) return null;

  if (activeTransport === 'p2p') return 'p2p';

  if (!candidateType) return null;

  if (candidateType === 'host') return 'wifi';

  return 'internet';
};

type TransportDisplay = {
  label: string;
  icon: string;
  color: string;
  backgroundColor: string;
};

/** Returns display metadata for a network transport. */
export const getTransportDisplay = (transport: NetworkTransport): TransportDisplay => {
  switch (transport) {
    case 'p2p':
      return {
        label: 'P2P',
        icon: 'radio',
        color: '#7C6BFF',
        backgroundColor: 'rgba(124,107,255,0.15)',
      };
    case 'wifi':
      return {
        label: 'WiFi',
        icon: 'wifi',
        color: '#00CC66',
        backgroundColor: 'rgba(0,204,102,0.15)',
      };
    case 'internet':
      return {
        label: 'Internet',
        icon: 'globe-outline',
        color: 'rgba(255,255,255,0.6)',
        backgroundColor: 'rgba(0,0,0,0.4)',
      };
  }
};
