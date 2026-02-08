import { useState, useEffect, useRef, useMemo } from 'react';
import { Platform } from 'react-native';
import { useP2PSignaling } from './use-p2p-signaling';
import type { P2PInvitation } from '@/modules/swinglink-multipeer/src';
import type { SignalingChannel } from '@/src/types';

type UseAutoConnectOptions = {
  role: 'camera' | 'viewer';
  roomCode: string | null;
  serverChannel: SignalingChannel;
  /** Camera: true once room is created. Viewer: true once joinRoom succeeds. */
  serverReady?: boolean;
  /** Remote device platform from BLE discovery. Only needed for viewer. */
  remotePlatform?: 'ios' | 'android';
  /** Activates the hook. Default false. */
  enabled?: boolean;
};

type AutoConnectState =
  | 'idle'
  | 'attempting-p2p'
  | 'connected-p2p'
  | 'needs-server'
  | 'connected-server';

type UseAutoConnectResult = {
  /** Pass this to useWebRTCConnection({ signalingChannel }). */
  channel: SignalingChannel;
  state: AutoConnectState;
  activeTransport: 'p2p' | 'server' | null;
  /** True when the viewer should initiate the server signaling handshake flow. */
  needsServerSignaling: boolean;
  /** Pending MPC invitation on the camera side. Null when no invitation pending. */
  pendingInvitation: P2PInvitation | null;
  /** Accept the pending P2P invitation. */
  acceptInvitation: () => void;
  /** Reject the pending P2P invitation. */
  rejectInvitation: () => void;
};

/**
 * Decides which signaling transport to use (MultipeerConnectivity P2P vs
 * signaling server) and returns a single `SignalingChannel` for
 * `useWebRTCConnection`.
 *
 * "First transport wins" — once a transport locks in, it stays for the session.
 */
export const useAutoConnect = (options: UseAutoConnectOptions): UseAutoConnectResult => {
  const {
    role,
    roomCode,
    serverChannel,
    serverReady = false,
    remotePlatform,
    enabled = false,
  } = options;

  const [state, setState] = useState<AutoConnectState>('idle');
  const lockedTransportRef = useRef<'p2p' | 'server' | null>(null);

  // Determine if P2P is worth attempting
  const localPlatform = Platform.OS as 'ios' | 'android';
  const canAttemptP2P = localPlatform === 'ios' && (
    role === 'camera' || remotePlatform === 'ios'
  );

  const p2p = useP2PSignaling({
    roomCode,
    role,
  });

  // Start P2P when enabled and appropriate
  useEffect(() => {
    if (!enabled || !roomCode) {
      setState('idle');
      return;
    }

    // Already locked — don't restart P2P
    if (lockedTransportRef.current) return;

    if (canAttemptP2P) {
      setState('attempting-p2p');
      p2p.start();
    } else {
      // Skip P2P entirely
      setState('needs-server');
    }
  }, [enabled, roomCode, canAttemptP2P]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to P2P state changes
  useEffect(() => {
    if (!enabled || lockedTransportRef.current) return;

    if (p2p.state === 'connected') {
      lockedTransportRef.current = 'p2p';
      setState('connected-p2p');
    } else if (p2p.state === 'disconnected' && state === 'attempting-p2p') {
      // P2P timed out or failed — fall back to server
      setState('needs-server');
    }
  }, [p2p.state, enabled, state]);

  // Transition needs-server → connected-server when consumer signals ready
  useEffect(() => {
    if (state === 'needs-server' && serverReady) {
      lockedTransportRef.current = 'server';
      setState('connected-server');
    }
  }, [state, serverReady]);

  const activeTransport = lockedTransportRef.current;

  const channel: SignalingChannel = useMemo(() => {
    if (activeTransport === 'p2p') return p2p.channel;
    // For camera: default to server channel even before lock-in, because
    // onPeerJoined from the server triggers createOffer via the server channel.
    // For viewer: use server channel once needs-server or connected-server.
    return serverChannel;
  }, [activeTransport, p2p.channel, serverChannel]);

  const needsServerSignaling = state === 'needs-server';

  return {
    channel,
    state,
    activeTransport,
    needsServerSignaling,
    pendingInvitation: p2p.pendingInvitation,
    acceptInvitation: p2p.acceptInvitation,
    rejectInvitation: p2p.rejectInvitation,
  };
};

export type { UseAutoConnectOptions, AutoConnectState, UseAutoConnectResult };
