import { io, Socket } from 'socket.io-client';
import type {
  SignalingConnectionState,
  SignalingClientConfig,
  SignalingError,
  IceCandidateInfo,
  ConnectionRequest,
  ConnectionRequestResponse,
} from '@/src/types';

const DEFAULT_CONFIG: SignalingClientConfig = {
  serverUrl: 'https://divot-signaling.fly.dev',
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
  onReconnected?: () => void;
  onConnectionRequest?: (request: ConnectionRequest) => void;
  onConnectionRequestResponse?: (response: ConnectionRequestResponse) => void;
};

/**
 * Creates a signaling client for WebRTC session establishment.
 * Handles room creation/joining and relays SDP/ICE messages between peers.
 */
export const createSignalingClient = (
  config: Partial<SignalingClientConfig> = {},
  callbacks: SignalingClientCallbacks = {}
) => {
  const finalConfig = {
    serverUrl: config.serverUrl ?? DEFAULT_CONFIG.serverUrl,
    reconnectionAttempts: config.reconnectionAttempts ?? DEFAULT_CONFIG.reconnectionAttempts,
    reconnectionDelay: config.reconnectionDelay ?? DEFAULT_CONFIG.reconnectionDelay,
  };
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

      console.log('[Signaling] Connecting to:', finalConfig.serverUrl);

      socket = io(finalConfig.serverUrl, {
        reconnectionAttempts: finalConfig.reconnectionAttempts,
        reconnectionDelay: finalConfig.reconnectionDelay,
        transports: ['polling', 'websocket'],
        timeout: 30000,
      });

      socket.io.on('error', (error) => {
        console.log('[Signaling] Transport error:', error);
      });

      socket.io.on('ping', () => {
        console.log('[Signaling] Ping');
      });

      socket.on('connect', () => {
        console.log('[Signaling] Connected! Socket ID:', socket?.id);
        updateConnectionState('connected');
        resolve();
      });

      socket.on('connect_error', (error) => {
        console.log('[Signaling] Connection error:', error.message);
        updateConnectionState('error');
        callbacks.onError?.({
          code: 'CONNECTION_ERROR',
          message: error.message,
        });
        reject(error);
      });

      socket.on('disconnect', () => {
        updateConnectionState('disconnected');
        // Preserve currentRoom so we can rejoin after reconnection
      });

      socket.io.on('reconnect', () => {
        console.log('[Signaling] Socket.IO reconnected');
        updateConnectionState('connected');
        callbacks.onReconnected?.();
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

      socket.on('room:request', (data: ConnectionRequest) => {
        callbacks.onConnectionRequest?.(data);
      });

      socket.on('room:request-response', (data: ConnectionRequestResponse) => {
        callbacks.onConnectionRequestResponse?.(data);
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
   * Rejoins a room after reconnection.
   * Camera re-creates the room if it was cleaned up; viewer joins existing room.
   */
  const rejoinRoom = (roomCode: string, role: 'camera' | 'viewer'): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!socket?.connected) {
        reject(new Error('Not connected to signaling server'));
        return;
      }

      socket.emit('rejoin-room', { roomCode, role }, (response: { success?: boolean; error?: string }) => {
        if (response.error) {
          callbacks.onError?.({
            code: 'REJOIN_ROOM_ERROR',
            message: response.error,
          });
          reject(new Error(response.error));
          return;
        }

        if (response.success) {
          currentRoom = roomCode;
          resolve();
        } else {
          reject(new Error('Failed to rejoin room'));
        }
      });
    });
  };

  /**
   * Reconnects to the signaling server (disconnect + connect).
   */
  const reconnect = async (): Promise<void> => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    updateConnectionState('disconnected');
    await connect();
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
   * Requests to join a room (BLE tap handshake). Camera must accept before joining.
   */
  const requestRoom = (roomCode: string, deviceName: string, platform: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!socket?.connected) {
        reject(new Error('Not connected to signaling server'));
        return;
      }

      socket.emit('room:request', { roomCode, deviceName, platform }, (response: { success?: boolean; error?: string }) => {
        if (response.error) {
          callbacks.onError?.({
            code: 'REQUEST_ROOM_ERROR',
            message: response.error,
          });
          resolve(false);
          return;
        }

        resolve(!!response.success);
      });
    });
  };

  /**
   * Responds to a connection request (camera accepts/declines).
   * @param reason - Optional reason for decline: 'declined' (explicit) or 'timeout' (auto-expired).
   */
  const respondToRequest = (roomCode: string, requesterId: string, accepted: boolean, reason?: 'declined' | 'timeout'): void => {
    if (socket?.connected) {
      socket.emit('room:request-response', { roomCode, requesterId, accepted, reason });
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
    reconnect,
    createRoom,
    joinRoom,
    rejoinRoom,
    requestRoom,
    respondToRequest,
    leaveRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    getConnectionState,
    getCurrentRoom,
  };
};

export type SignalingClient = ReturnType<typeof createSignalingClient>;
