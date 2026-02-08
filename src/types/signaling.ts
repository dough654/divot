import type { IceCandidateInfo } from './webrtc';

/** Transport-agnostic signaling channel for WebRTC negotiation. */
export type SignalingChannel = {
  sendOffer: (sdp: string) => void;
  sendAnswer: (sdp: string) => void;
  sendIceCandidate: (candidate: IceCandidateInfo) => void;
  onOffer: (handler: (sdp: string) => void) => () => void;
  onAnswer: (handler: (sdp: string) => void) => () => void;
  onIceCandidate: (handler: (candidate: IceCandidateInfo) => void) => () => void;
  disconnect: () => void;
};

export type SignalingEventType =
  | 'create-room'
  | 'join-room'
  | 'rejoin-room'
  | 'leave-room'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'peer-joined'
  | 'peer-left'
  | 'room:request'
  | 'room:request-response'
  | 'error';

export type ConnectionRequest = {
  deviceName: string;
  platform: string;
  requesterId: string;
};

export type ConnectionRequestResponse = {
  accepted: boolean;
  reason?: 'declined' | 'timeout';
};

export type CreateRoomResponse = {
  roomCode: string;
};

export type JoinRoomResponse = {
  success: boolean;
  error?: string;
};

export type SignalingOffer = {
  room: string;
  sdp: string;
};

export type SignalingAnswer = {
  room: string;
  sdp: string;
};

export type SignalingIceCandidate = {
  room: string;
  candidate: {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
  };
};

export type SignalingError = {
  code: string;
  message: string;
};

export type SignalingConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type SignalingClientConfig = {
  serverUrl: string;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
};

export type RejoinRoomResponse = {
  success: boolean;
  error?: string;
};

export type SignalingClientHookResult = {
  connectionState: SignalingConnectionState;
  roomCode: string | null;
  error: SignalingError | null;
  createRoom: () => Promise<string | null>;
  joinRoom: (code: string) => Promise<boolean>;
  rejoinRoom: (roomCode: string, role: 'camera' | 'viewer') => Promise<boolean>;
  leaveRoom: () => void;
  reconnectSignaling: () => Promise<void>;
  sendOffer: (sdp: string) => void;
  sendAnswer: (sdp: string) => void;
  sendIceCandidate: (candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }) => void;
  onOffer: (callback: (sdp: string) => void) => () => void;
  onAnswer: (callback: (sdp: string) => void) => () => void;
  onIceCandidate: (callback: (candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }) => void) => () => void;
  onPeerJoined: (callback: () => void) => () => void;
  onPeerLeft: (callback: () => void) => () => void;
  onReconnected: (callback: () => void) => () => void;
};
