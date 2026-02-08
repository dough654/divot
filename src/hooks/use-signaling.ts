import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createSignalingClient, SignalingClient } from '@/src/services/signaling';
import type { SignalingConnectionState, SignalingError, IceCandidateInfo, SignalingChannel, ConnectionRequest } from '@/src/types';

export type UseSignalingOptions = {
  serverUrl?: string;
  autoConnect?: boolean;
};

export type UseSignalingResult = {
  connectionState: SignalingConnectionState;
  roomCode: string | null;
  error: SignalingError | null;
  channel: SignalingChannel;
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnectSignaling: () => Promise<void>;
  createRoom: () => Promise<string | null>;
  joinRoom: (code: string) => Promise<boolean>;
  rejoinRoom: (roomCode: string, role: 'camera' | 'viewer') => Promise<boolean>;
  requestRoom: (roomCode: string, deviceName: string, platform: string) => Promise<boolean>;
  respondToRequest: (roomCode: string, requesterId: string, accepted: boolean) => void;
  leaveRoom: () => void;
  sendOffer: (sdp: string) => void;
  sendAnswer: (sdp: string) => void;
  sendIceCandidate: (candidate: IceCandidateInfo) => void;
  onOffer: (callback: (sdp: string) => void) => () => void;
  onAnswer: (callback: (sdp: string) => void) => () => void;
  onIceCandidate: (callback: (candidate: IceCandidateInfo) => void) => () => void;
  onPeerJoined: (callback: () => void) => () => void;
  onPeerLeft: (callback: () => void) => () => void;
  onReconnected: (callback: () => void) => () => void;
  onConnectionRequest: (callback: (request: ConnectionRequest) => void) => () => void;
  onConnectionRequestResponse: (callback: (response: { accepted: boolean }) => void) => () => void;
};

/**
 * Hook for managing signaling server connection.
 * Handles room creation/joining and WebRTC signaling message exchange.
 */
export const useSignaling = (options: UseSignalingOptions = {}): UseSignalingResult => {
  const { serverUrl, autoConnect = false } = options;

  const [connectionState, setConnectionState] = useState<SignalingConnectionState>('disconnected');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [error, setError] = useState<SignalingError | null>(null);

  const clientRef = useRef<SignalingClient | null>(null);
  const callbacksRef = useRef<{
    onOffer: Set<(sdp: string) => void>;
    onAnswer: Set<(sdp: string) => void>;
    onIceCandidate: Set<(candidate: IceCandidateInfo) => void>;
    onPeerJoined: Set<() => void>;
    onPeerLeft: Set<() => void>;
    onReconnected: Set<() => void>;
    onConnectionRequest: Set<(request: ConnectionRequest) => void>;
    onConnectionRequestResponse: Set<(response: { accepted: boolean }) => void>;
  }>({
    onOffer: new Set(),
    onAnswer: new Set(),
    onIceCandidate: new Set(),
    onPeerJoined: new Set(),
    onPeerLeft: new Set(),
    onReconnected: new Set(),
    onConnectionRequest: new Set(),
    onConnectionRequestResponse: new Set(),
  });

  // Initialize client
  useEffect(() => {
    clientRef.current = createSignalingClient(
      { serverUrl },
      {
        onConnectionStateChange: setConnectionState,
        onError: setError,
        onOffer: (sdp) => {
          callbacksRef.current.onOffer.forEach((cb) => cb(sdp));
        },
        onAnswer: (sdp) => {
          callbacksRef.current.onAnswer.forEach((cb) => cb(sdp));
        },
        onIceCandidate: (candidate) => {
          callbacksRef.current.onIceCandidate.forEach((cb) => cb(candidate));
        },
        onPeerJoined: () => {
          callbacksRef.current.onPeerJoined.forEach((cb) => cb());
        },
        onPeerLeft: () => {
          callbacksRef.current.onPeerLeft.forEach((cb) => cb());
        },
        onReconnected: () => {
          callbacksRef.current.onReconnected.forEach((cb) => cb());
        },
        onConnectionRequest: (request) => {
          callbacksRef.current.onConnectionRequest.forEach((cb) => cb(request));
        },
        onConnectionRequestResponse: (response) => {
          callbacksRef.current.onConnectionRequestResponse.forEach((cb) => cb(response));
        },
      }
    );

    return () => {
      clientRef.current?.disconnect();
    };
  }, [serverUrl]);

  const connect = useCallback(async () => {
    if (!clientRef.current) return;
    try {
      await clientRef.current.connect();
    } catch (err) {
      console.error('Failed to connect to signaling server:', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setRoomCode(null);
  }, []);

  const createRoom = useCallback(async (): Promise<string | null> => {
    if (!clientRef.current) return null;
    try {
      const code = await clientRef.current.createRoom();
      setRoomCode(code);
      return code;
    } catch (err) {
      console.error('Failed to create room:', err);
      return null;
    }
  }, []);

  const joinRoom = useCallback(async (code: string): Promise<boolean> => {
    if (!clientRef.current) return false;
    try {
      await clientRef.current.joinRoom(code);
      setRoomCode(code);
      return true;
    } catch (err) {
      console.error('Failed to join room:', err);
      return false;
    }
  }, []);

  const leaveRoom = useCallback(() => {
    clientRef.current?.leaveRoom();
    setRoomCode(null);
  }, []);

  const sendOffer = useCallback((sdp: string) => {
    clientRef.current?.sendOffer(sdp);
  }, []);

  const sendAnswer = useCallback((sdp: string) => {
    clientRef.current?.sendAnswer(sdp);
  }, []);

  const sendIceCandidate = useCallback((candidate: IceCandidateInfo) => {
    clientRef.current?.sendIceCandidate(candidate);
  }, []);

  // Callback subscription functions
  const onOffer = useCallback((callback: (sdp: string) => void) => {
    callbacksRef.current.onOffer.add(callback);
    return () => {
      callbacksRef.current.onOffer.delete(callback);
    };
  }, []);

  const onAnswer = useCallback((callback: (sdp: string) => void) => {
    callbacksRef.current.onAnswer.add(callback);
    return () => {
      callbacksRef.current.onAnswer.delete(callback);
    };
  }, []);

  const onIceCandidate = useCallback((callback: (candidate: IceCandidateInfo) => void) => {
    callbacksRef.current.onIceCandidate.add(callback);
    return () => {
      callbacksRef.current.onIceCandidate.delete(callback);
    };
  }, []);

  const onPeerJoined = useCallback((callback: () => void) => {
    callbacksRef.current.onPeerJoined.add(callback);
    return () => {
      callbacksRef.current.onPeerJoined.delete(callback);
    };
  }, []);

  const onPeerLeft = useCallback((callback: () => void) => {
    callbacksRef.current.onPeerLeft.add(callback);
    return () => {
      callbacksRef.current.onPeerLeft.delete(callback);
    };
  }, []);

  const onReconnected = useCallback((callback: () => void) => {
    callbacksRef.current.onReconnected.add(callback);
    return () => {
      callbacksRef.current.onReconnected.delete(callback);
    };
  }, []);

  const reconnectSignaling = useCallback(async () => {
    if (!clientRef.current) return;
    try {
      await clientRef.current.reconnect();
    } catch (err) {
      console.error('Failed to reconnect signaling:', err);
    }
  }, []);

  const rejoinRoom = useCallback(async (code: string, role: 'camera' | 'viewer'): Promise<boolean> => {
    if (!clientRef.current) return false;
    try {
      await clientRef.current.rejoinRoom(code, role);
      setRoomCode(code);
      return true;
    } catch (err) {
      console.error('Failed to rejoin room:', err);
      return false;
    }
  }, []);

  const requestRoom = useCallback(async (roomCode: string, deviceName: string, platform: string): Promise<boolean> => {
    if (!clientRef.current) return false;
    try {
      return await clientRef.current.requestRoom(roomCode, deviceName, platform);
    } catch (err) {
      console.error('Failed to request room:', err);
      return false;
    }
  }, []);

  const respondToRequest = useCallback((roomCode: string, requesterId: string, accepted: boolean): void => {
    clientRef.current?.respondToRequest(roomCode, requesterId, accepted);
  }, []);

  const onConnectionRequest = useCallback((callback: (request: ConnectionRequest) => void) => {
    callbacksRef.current.onConnectionRequest.add(callback);
    return () => {
      callbacksRef.current.onConnectionRequest.delete(callback);
    };
  }, []);

  const onConnectionRequestResponse = useCallback((callback: (response: { accepted: boolean }) => void) => {
    callbacksRef.current.onConnectionRequestResponse.add(callback);
    return () => {
      callbacksRef.current.onConnectionRequestResponse.delete(callback);
    };
  }, []);

  const channel: SignalingChannel = useMemo(() => ({
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    onOffer,
    onAnswer,
    onIceCandidate,
    disconnect,
  }), [sendOffer, sendAnswer, sendIceCandidate, onOffer, onAnswer, onIceCandidate, disconnect]);

  // Auto-connect if requested
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
  }, [autoConnect, connect]);

  return {
    connectionState,
    roomCode,
    error,
    channel,
    connect,
    disconnect,
    reconnectSignaling,
    createRoom,
    joinRoom,
    rejoinRoom,
    requestRoom,
    respondToRequest,
    leaveRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    onOffer,
    onAnswer,
    onIceCandidate,
    onPeerJoined,
    onPeerLeft,
    onReconnected,
    onConnectionRequest,
    onConnectionRequestResponse,
  };
};
