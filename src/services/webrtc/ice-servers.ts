import type { RTCIceServer } from '@/src/types';

/**
 * Google's free public STUN servers for NAT traversal
 */
const GOOGLE_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

/**
 * Open Relay Project free TURN servers (fallback when STUN fails)
 * These are publicly available and free to use
 */
const OPEN_RELAY_TURN_SERVERS: RTCIceServer[] = [
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

/**
 * Returns the default ICE server configuration for WebRTC connections.
 * Uses Google STUN servers for NAT traversal and Open Relay TURN servers as fallback.
 */
export const getDefaultIceServers = (): RTCIceServer[] => {
  return [...GOOGLE_STUN_SERVERS, ...OPEN_RELAY_TURN_SERVERS];
};

/**
 * Returns ICE servers optimized for local network connections.
 * Only uses STUN servers since TURN is not needed on local networks.
 */
export const getLocalNetworkIceServers = (): RTCIceServer[] => {
  return [...GOOGLE_STUN_SERVERS];
};
