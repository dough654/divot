import { io, Socket } from 'socket.io-client';
import type {
  SignalingConnectionState,
  SignalingClientConfig,
  SignalingError,
  IceCandidateInfo,
} from '@/src/types';

const DEFAULT_CONFIG: SignalingClientConfig = {
  serverUrl: 'https://swinglink-signaling.fly.dev',
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
};

export type SignalingClientCallbacks = {
  onConnectionStateChange?: (state: SignalingConnectionState) => void;
  onError?: (error: SignalingError) => void;
  onOffer?: (sdp: string) => void;
  onAnswer?: (sdp: string) => void;
  onIceCandidate?: (candidate: IceCandidateInfo) => void;
  onPeerJoined?: () => void;
  onPeerLeft?: () => void;
};

/**
 * Creates a signaling client for WebRTC session establishment.
 * Handles room creation/joining and relays SDP/ICE messages between peers.
 */
export const createSignalingClient = (
  config: Partial<SignalingClientConfig> = {},
  callbacks: SignalingClientCallbacks = {}
) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let socket: Socket | null = null;
  let currentRoom: string | null = null;
  let connectionState: SignalingConnectionState = 'disconnected';

  const updateConnectionState = (state: SignalingConnectionState) => {
    connectionState = state;
    callbacks.onConnectionStateChange?.(state);
  };

  /**
   * Connects to the signaling server.
   */
  const connect = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (socket?.connected) {
        resolve();
        return;
      }

      updateConnectionState('connecting');

      socket = io(finalConfig.serverUrl, {
        reconnectionAttempts: finalConfig.reconnectionAttempts,
        reconnectionDelay: finalConfig.reconnectionDelay,
        transports: ['websocket'],
      });

      socket.on('connect', () => {
        updateConnectionState('connected');
        resolve();
      });

      socket.on('connect_error', (error) => {
        updateConnectionState('error');
        callbacks.onError?.({
          code: 'CONNECTION_ERROR',
          message: error.message,
        });
        reject(error);
      });

      socket.on('disconnect', () => {
        updateConnectionState('disconnected');
        currentRoom = null;
      });

      // Set up message handlers
      socket.on('offer', (data: { sdp: string }) => {
        callbacks.onOffer?.(data.sdp);
      });

      socket.on('answer', (data: { sdp: string }) => {
        callbacks.onAnswer?.(data.sdp);
      });

      socket.on('ice-candidate', (data: { candidate: IceCandidateInfo }) => {
        callbacks.onIceCandidate?.(data.candidate);
      });

      socket.on('peer-joined', () => {
        callbacks.onPeerJoined?.();
      });

      socket.on('peer-left', () => {
        callbacks.onPeerLeft?.();
      });

      socket.on('error', (error: SignalingError) => {
        callbacks.onError?.(error);
      });
    });
  };

  /**
   * Disconnects from the signaling server.
   */
  const disconnect = (): void => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    currentRoom = null;
    updateConnectionState('disconnected');
  };

  /**
   * Creates a new room and returns the room code.
   */
  const createRoom = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!socket?.connected) {
        reject(new Error('Not connected to signaling server'));
        return;
      }

      socket.emit('create-room', (response: { roomCode?: string; error?: string }) => {
        if (response.error) {
          callbacks.onError?.({
            code: 'CREATE_ROOM_ERROR',
            message: response.error,
          });
          reject(new Error(response.error));
          return;
        }

        if (response.roomCode) {
          currentRoom = response.roomCode;
          resolve(response.roomCode);
        } else {
          reject(new Error('No room code received'));
        }
      });
    });
  };

  /**
   * Joins an existing room with the given code.
   */
  const joinRoom = (roomCode: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!socket?.connected) {
        reject(new Error('Not connected to signaling server'));
        return;
      }

      socket.emit('join-room', roomCode, (response: { success?: boolean; error?: string }) => {
        if (response.error) {
          callbacks.onError?.({
            code: 'JOIN_ROOM_ERROR',
            message: response.error,
          });
          reject(new Error(response.error));
          return;
        }

        if (response.success) {
          currentRoom = roomCode;
          resolve();
        } else {
          reject(new Error('Failed to join room'));
        }
      });
    });
  };

  /**
   * Leaves the current room.
   */
  const leaveRoom = (): void => {
    if (socket?.connected && currentRoom) {
      socket.emit('leave-room', currentRoom);
      currentRoom = null;
    }
  };

  /**
   * Sends an SDP offer to the peer.
   */
  const sendOffer = (sdp: string): void => {
    if (socket?.connected && currentRoom) {
      socket.emit('offer', { room: currentRoom, sdp });
    }
  };

  /**
   * Sends an SDP answer to the peer.
   */
  const sendAnswer = (sdp: string): void => {
    if (socket?.connected && currentRoom) {
      socket.emit('answer', { room: currentRoom, sdp });
    }
  };

  /**
   * Sends an ICE candidate to the peer.
   */
  const sendIceCandidate = (candidate: IceCandidateInfo): void => {
    if (socket?.connected && currentRoom) {
      socket.emit('ice-candidate', { room: currentRoom, candidate });
    }
  };

  /**
   * Returns the current connection state.
   */
  const getConnectionState = (): SignalingConnectionState => connectionState;

  /**
   * Returns the current room code.
   */
  const getCurrentRoom = (): string | null => currentRoom;

  return {
    connect,
    disconnect,
    createRoom,
    joinRoom,
    leaveRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    getConnectionState,
    getCurrentRoom,
  };
};

export type SignalingClient = ReturnType<typeof createSignalingClient>;
