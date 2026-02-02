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
};

export type UseWebRTCConnectionResult = {
  peerConnection: RTCPeerConnection | null;
  remoteStream: MediaStream | null;
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
export const useWebRTCConnection = (
  options: UseWebRTCConnectionOptions = {}
): UseWebRTCConnectionResult => {
  const { localStream, onRemoteStream, onIceCandidate } = options;

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<WebRTCConnectionStatus>(initialStatus);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<IceCandidateInfo[]>([]);

  // Initialize peer connection
  const initializePeerConnection = useCallback(() => {
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
      }
    );

    peerConnectionRef.current = pc;

    // Add local stream tracks if available
    if (localStream) {
      addStreamToPeerConnection(pc, localStream);
    }

    return pc;
  }, [localStream, onIceCandidate, onRemoteStream]);

  // Add local stream when it becomes available
  useEffect(() => {
    if (localStream && peerConnectionRef.current) {
      addStreamToPeerConnection(peerConnectionRef.current, localStream);
    }
  }, [localStream]);

  const handleCreateOffer = useCallback(async (): Promise<SDPInfo | null> => {
    try {
      const pc = initializePeerConnection();
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
        const pc = initializePeerConnection();
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
    status,
    createOffer: handleCreateOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    disconnect,
    isConnected: status.isConnected,
  };
};
