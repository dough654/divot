import { useState, useEffect, useCallback, useRef } from 'react';
import { RTCPeerConnection, MediaStream } from 'react-native-webrtc';
import {
  createPeerConnection,
  addStreamToPeerConnection,
  createOffer,
  createAnswer,
  setRemoteDescription,
  addIceCandidate,
  closePeerConnection,
  createDataChannel,
  DataChannel,
} from '@/src/services/webrtc';
import type {
  WebRTCConnectionStatus,
  SDPInfo,
  IceCandidateInfo,
  IceConnectionState,
  ConnectionState,
  SignalingState,
} from '@/src/types';

export type UseWebRTCConnectionOptions = {
  localStream?: MediaStream | null;
  onRemoteStream?: (stream: MediaStream) => void;
  onIceCandidate?: (candidate: IceCandidateInfo) => void;
  onDataChannel?: (channel: DataChannel) => void;
};

export type UseWebRTCConnectionResult = {
  peerConnection: RTCPeerConnection | null;
  remoteStream: MediaStream | null;
  dataChannel: DataChannel | null;
  status: WebRTCConnectionStatus;
  createOffer: () => Promise<SDPInfo | null>;
  handleOffer: (sdp: SDPInfo) => Promise<SDPInfo | null>;
  handleAnswer: (sdp: SDPInfo) => Promise<void>;
  handleIceCandidate: (candidate: IceCandidateInfo) => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
};

const initialStatus: WebRTCConnectionStatus = {
  iceConnectionState: 'new',
  signalingState: 'stable',
  connectionState: 'new',
  isConnected: false,
};

/**
 * Hook for managing a WebRTC peer connection.
 * Handles connection lifecycle, stream attachment, and ICE candidates.
 */
const DATA_CHANNEL_LABEL = 'clip-sync';

export const useWebRTCConnection = (
  options: UseWebRTCConnectionOptions = {}
): UseWebRTCConnectionResult => {
  const { localStream, onRemoteStream, onIceCandidate, onDataChannel } = options;

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<WebRTCConnectionStatus>(initialStatus);
  const [dataChannel, setDataChannel] = useState<DataChannel | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<DataChannel | null>(null);
  const pendingCandidatesRef = useRef<IceCandidateInfo[]>([]);

  // Set up data channel event handlers
  const setupDataChannel = useCallback((channel: DataChannel) => {
    channel.onopen = () => {
      setDataChannel(channel);
      dataChannelRef.current = channel;
      onDataChannel?.(channel);
    };

    channel.onclose = () => {
      setDataChannel(null);
      dataChannelRef.current = null;
    };

    // If already open, trigger immediately
    if (channel.readyState === 'open') {
      setDataChannel(channel);
      dataChannelRef.current = channel;
      onDataChannel?.(channel);
    }
  }, [onDataChannel]);

  // Initialize peer connection
  const initializePeerConnection = useCallback((isInitiator: boolean) => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const pc = createPeerConnection(
      {},
      {
        onIceCandidate: (candidate) => {
          onIceCandidate?.(candidate);
        },
        onIceConnectionStateChange: (state) => {
          setStatus((prev) => ({
            ...prev,
            iceConnectionState: state as IceConnectionState,
            isConnected: state === 'connected' || state === 'completed',
          }));
        },
        onConnectionStateChange: (state) => {
          setStatus((prev) => ({
            ...prev,
            connectionState: state as ConnectionState,
          }));
        },
        onTrack: (stream) => {
          setRemoteStream(stream);
          onRemoteStream?.(stream);
        },
        onDataChannel: (channel) => {
          // Receiver side - incoming data channel
          if (channel.label === DATA_CHANNEL_LABEL) {
            setupDataChannel(channel);
          }
        },
      }
    );

    peerConnectionRef.current = pc;

    // Add local stream tracks if available
    if (localStream) {
      addStreamToPeerConnection(pc, localStream);
    }

    // Create data channel if initiator (before offer)
    if (isInitiator) {
      const channel = createDataChannel(pc, DATA_CHANNEL_LABEL);
      setupDataChannel(channel);
    }

    return pc;
  }, [localStream, onIceCandidate, onRemoteStream, setupDataChannel]);

  // Add local stream when it becomes available
  useEffect(() => {
    if (localStream && peerConnectionRef.current) {
      addStreamToPeerConnection(peerConnectionRef.current, localStream);
    }
  }, [localStream]);

  const handleCreateOffer = useCallback(async (): Promise<SDPInfo | null> => {
    try {
      // Camera/initiator creates offer and data channel
      const pc = initializePeerConnection(true);
      const offer = await createOffer(pc);

      setStatus((prev) => ({
        ...prev,
        signalingState: 'have-local-offer' as SignalingState,
      }));

      return offer;
    } catch (err) {
      console.error('Failed to create offer:', err);
      return null;
    }
  }, [initializePeerConnection]);

  const handleOffer = useCallback(
    async (sdp: SDPInfo): Promise<SDPInfo | null> => {
      try {
        // Viewer/receiver creates answer, receives data channel
        const pc = initializePeerConnection(false);
        const answer = await createAnswer(pc, sdp);

        // Process any pending ICE candidates
        for (const candidate of pendingCandidatesRef.current) {
          await addIceCandidate(pc, candidate);
        }
        pendingCandidatesRef.current = [];

        setStatus((prev) => ({
          ...prev,
          signalingState: 'stable' as SignalingState,
        }));

        return answer;
      } catch (err) {
        console.error('Failed to handle offer:', err);
        return null;
      }
    },
    [initializePeerConnection]
  );

  const handleAnswer = useCallback(async (sdp: SDPInfo): Promise<void> => {
    try {
      if (!peerConnectionRef.current) {
        throw new Error('No peer connection');
      }

      await setRemoteDescription(peerConnectionRef.current, sdp);

      // Process any pending ICE candidates
      for (const candidate of pendingCandidatesRef.current) {
        await addIceCandidate(peerConnectionRef.current, candidate);
      }
      pendingCandidatesRef.current = [];

      setStatus((prev) => ({
        ...prev,
        signalingState: 'stable' as SignalingState,
      }));
    } catch (err) {
      console.error('Failed to handle answer:', err);
    }
  }, []);

  const handleIceCandidate = useCallback(async (candidate: IceCandidateInfo): Promise<void> => {
    try {
      if (!peerConnectionRef.current) {
        // Queue candidates until peer connection is ready
        pendingCandidatesRef.current.push(candidate);
        return;
      }

      // Check if remote description is set
      const pc = peerConnectionRef.current;
      if (!pc.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }

      await addIceCandidate(pc, candidate);
    } catch (err) {
      console.error('Failed to add ICE candidate:', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (peerConnectionRef.current) {
      closePeerConnection(peerConnectionRef.current);
      peerConnectionRef.current = null;
    }

    setRemoteStream(null);
    setDataChannel(null);
    dataChannelRef.current = null;
    setStatus(initialStatus);
    pendingCandidatesRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (peerConnectionRef.current) {
        closePeerConnection(peerConnectionRef.current);
      }
    };
  }, []);

  return {
    peerConnection: peerConnectionRef.current,
    remoteStream,
    dataChannel,
    status,
    createOffer: handleCreateOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    disconnect,
    isConnected: status.isConnected,
  };
};
