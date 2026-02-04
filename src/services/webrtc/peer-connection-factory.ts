import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
  MediaStreamTrack,
} from 'react-native-webrtc';

import type { RTCIceServer, SDPInfo, IceCandidateInfo } from '@/src/types';
import { getDefaultIceServers } from './ice-servers';

export type PeerConnectionFactoryConfig = {
  iceServers?: RTCIceServer[];
  iceCandidatePoolSize?: number;
};

export type PeerConnectionCallbacks = {
  onIceCandidate?: (candidate: IceCandidateInfo) => void;
  onIceConnectionStateChange?: (state: string) => void;
  onConnectionStateChange?: (state: string) => void;
  onTrack?: (stream: MediaStream) => void;
  onNegotiationNeeded?: () => void;
  onDataChannel?: (channel: DataChannel) => void;
};

// DataChannel type for data transfers
export type DataChannel = {
  label: string;
  readyState: 'connecting' | 'open' | 'closing' | 'closed';
  send: (data: string) => void;
  close: () => void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((event: { error: Error }) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
};

// Extended type to include event handlers that exist at runtime but not in types
type ExtendedRTCPeerConnection = RTCPeerConnection & {
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  onconnectionstatechange: (() => void) | null;
  ontrack: ((event: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null;
  onnegotiationneeded: (() => void) | null;
  ondatachannel: ((event: { channel: DataChannel }) => void) | null;
  connectionState: string;
  createDataChannel: (label: string, options?: { ordered?: boolean }) => DataChannel;
};

/**
 * Creates and configures a new RTCPeerConnection with the specified options.
 */
export const createPeerConnection = (
  config: PeerConnectionFactoryConfig = {},
  callbacks: PeerConnectionCallbacks = {}
): RTCPeerConnection => {
  const iceServers = config.iceServers ?? getDefaultIceServers();
  const iceCandidatePoolSize = config.iceCandidatePoolSize ?? 10;

  const peerConnection = new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize,
  }) as ExtendedRTCPeerConnection;

  // Set up ICE candidate handling
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && callbacks.onIceCandidate) {
      callbacks.onIceCandidate({
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid ?? null,
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
      });
    }
  };

  // Set up connection state change handlers
  peerConnection.oniceconnectionstatechange = () => {
    callbacks.onIceConnectionStateChange?.(peerConnection.iceConnectionState);
  };

  peerConnection.onconnectionstatechange = () => {
    callbacks.onConnectionStateChange?.(peerConnection.connectionState);
  };

  // Set up track handler for receiving remote streams
  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0] && callbacks.onTrack) {
      callbacks.onTrack(event.streams[0]);
    }
  };

  // Set up negotiation needed handler
  peerConnection.onnegotiationneeded = () => {
    callbacks.onNegotiationNeeded?.();
  };

  // Set up data channel handler (for receiving channels)
  peerConnection.ondatachannel = (event) => {
    if (callbacks.onDataChannel) {
      callbacks.onDataChannel(event.channel);
    }
  };

  return peerConnection;
};

/**
 * Gets the local media stream from the device's camera and microphone.
 */
export const getLocalMediaStream = async (options: {
  video?: boolean;
  audio?: boolean;
  useFrontCamera?: boolean;
} = {}): Promise<MediaStream> => {
  const { video = true, audio = true, useFrontCamera = false } = options;

  const constraints = {
    video: video
      ? {
          facingMode: useFrontCamera ? 'user' : 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60 },
        }
      : false,
    audio: audio,
  };

  const stream = await mediaDevices.getUserMedia(constraints);
  return stream as MediaStream;
};

/**
 * Adds a local media stream to the peer connection.
 */
export const addStreamToPeerConnection = (
  peerConnection: RTCPeerConnection,
  stream: MediaStream
): void => {
  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });
};

export type CreateOfferOptions = {
  iceRestart?: boolean;
};

/**
 * Creates an SDP offer for the peer connection.
 */
export const createOffer = async (
  peerConnection: RTCPeerConnection,
  options: CreateOfferOptions = {}
): Promise<SDPInfo> => {
  const offer = await peerConnection.createOffer(
    options.iceRestart ? { iceRestart: true } : {}
  );
  await peerConnection.setLocalDescription(offer);

  return {
    type: 'offer',
    sdp: offer.sdp,
  };
};

/**
 * Creates an SDP answer in response to a remote offer.
 */
export const createAnswer = async (
  peerConnection: RTCPeerConnection,
  remoteSdp: SDPInfo
): Promise<SDPInfo> => {
  const remoteDesc = new RTCSessionDescription({
    type: remoteSdp.type,
    sdp: remoteSdp.sdp,
  });
  await peerConnection.setRemoteDescription(remoteDesc);

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  return {
    type: 'answer',
    sdp: answer.sdp,
  };
};

/**
 * Sets the remote description on the peer connection.
 */
export const setRemoteDescription = async (
  peerConnection: RTCPeerConnection,
  sdp: SDPInfo
): Promise<void> => {
  const remoteDesc = new RTCSessionDescription({
    type: sdp.type,
    sdp: sdp.sdp,
  });
  await peerConnection.setRemoteDescription(remoteDesc);
};

/**
 * Adds an ICE candidate to the peer connection.
 */
export const addIceCandidate = async (
  peerConnection: RTCPeerConnection,
  candidate: IceCandidateInfo
): Promise<void> => {
  const iceCandidate = new RTCIceCandidate({
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
  });
  await peerConnection.addIceCandidate(iceCandidate);
};

/**
 * Closes the peer connection and releases resources.
 */
export const closePeerConnection = (peerConnection: RTCPeerConnection): void => {
  peerConnection.close();
};

/**
 * Stops all tracks in a media stream.
 */
export const stopMediaStream = (stream: MediaStream): void => {
  stream.getTracks().forEach((track) => {
    track.stop();
  });
};

/**
 * Creates a data channel on the peer connection.
 */
export const createDataChannel = (
  peerConnection: RTCPeerConnection,
  label: string
): DataChannel => {
  const pc = peerConnection as ExtendedRTCPeerConnection;
  return pc.createDataChannel(label, { ordered: true }) as unknown as DataChannel;
};
