import type { MediaStream, RTCPeerConnection } from 'react-native-webrtc';

export type IceConnectionState =
  | 'new'
  | 'checking'
  | 'connected'
  | 'completed'
  | 'failed'
  | 'disconnected'
  | 'closed';

export type SignalingState =
  | 'stable'
  | 'have-local-offer'
  | 'have-remote-offer'
  | 'have-local-pranswer'
  | 'have-remote-pranswer'
  | 'closed';

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export type WebRTCConnectionStatus = {
  iceConnectionState: IceConnectionState;
  signalingState: SignalingState;
  connectionState: ConnectionState;
  isConnected: boolean;
};

export type WebRTCConnectionConfig = {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize?: number;
};

export type RTCIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type SDPInfo = {
  type: 'offer' | 'answer';
  sdp: string;
};

export type IceCandidateInfo = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

export type WebRTCConnectionHookResult = {
  peerConnection: RTCPeerConnection | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  status: WebRTCConnectionStatus;
  createOffer: () => Promise<SDPInfo | null>;
  createAnswer: (remoteSdp: SDPInfo) => Promise<SDPInfo | null>;
  setRemoteDescription: (sdp: SDPInfo) => Promise<void>;
  addIceCandidate: (candidate: IceCandidateInfo) => Promise<void>;
  disconnect: () => void;
};

export type ConnectionQuality = {
  latencyMs: number;
  bitrateBps: number;
  packetLossPercent: number;
  jitterMs: number;
  timestamp: number;
};
