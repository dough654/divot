import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ReconnectionState,
  ReconnectionStrategy,
  IceConnectionState,
  SDPInfo,
  SignalingConnectionState,
  AppRole,
} from '@/src/types';
import { calculateBackoffDelay, DEFAULT_BACKOFF_CONFIG, type BackoffConfig } from '@/src/utils/exponential-backoff';

export type UseAutoReconnectOptions = {
  role: AppRole;
  iceConnectionState: IceConnectionState;
  signalingConnectionState: SignalingConnectionState;
  wasConnected: boolean;
  roomCode: string | null;
  isRecording: boolean;
  isTransferring: boolean;
  restartIce: () => Promise<SDPInfo | null>;
  renegotiate: () => Promise<SDPInfo | null>;
  reconnectSignaling: () => Promise<void>;
  rejoinRoom: (roomCode: string, role: AppRole) => Promise<boolean>;
  backoffConfig?: BackoffConfig;
};

export type UseAutoReconnectResult = {
  reconnectionState: ReconnectionState;
  cancelReconnection: () => void;
};

const INITIAL_RECONNECTION_STATE: ReconnectionState = {
  isReconnecting: false,
  attempt: 0,
  maxAttempts: DEFAULT_BACKOFF_CONFIG.maxAttempts,
  lastDisconnectReason: null,
  strategy: null,
};

const ICE_GRACE_PERIOD_MS = 2000;

export type InternalPhase = 'idle' | 'grace-period' | 'scenario-a' | 'scenario-b' | 'give-up';

export type ReconnectionContext = {
  role: AppRole;
  iceConnectionState: IceConnectionState;
  signalingConnectionState: SignalingConnectionState;
  wasConnected: boolean;
  roomCode: string | null;
  isRecording: boolean;
  isTransferring: boolean;
  currentPhase: InternalPhase;
  currentAttempt: number;
  maxAttempts: number;
};

export type ReconnectionAction =
  | 'none'
  | 'reset'
  | 'start-grace-period'
  | 'start-scenario-a'
  | 'start-scenario-b'
  | 'defer';

/**
 * Pure function that determines the next reconnection action based on current context.
 * Extracted from the hook for testability.
 */
export const determineReconnectionAction = (ctx: ReconnectionContext): ReconnectionAction => {
  if (!ctx.wasConnected) return 'none';

  // Already given up — no further action
  if (ctx.currentPhase === 'give-up') return 'none';

  // ICE recovered — reset if we were reconnecting
  if (ctx.iceConnectionState === 'connected' || ctx.iceConnectionState === 'completed') {
    if (ctx.currentPhase === 'grace-period' || ctx.currentPhase === 'scenario-a') {
      return 'reset';
    }
    // Check signaling while ICE is healthy
    if (ctx.signalingConnectionState === 'disconnected' && ctx.currentPhase === 'idle') {
      if (ctx.isTransferring) return 'defer';
      return 'start-scenario-b';
    }
    return 'none';
  }

  // ICE disconnected from idle — start grace period
  if (ctx.iceConnectionState === 'disconnected' && ctx.currentPhase === 'idle') {
    if (ctx.isTransferring) return 'defer';
    return 'start-grace-period';
  }

  // ICE failed from idle or grace-period — go straight to scenario A
  if (ctx.iceConnectionState === 'failed' && (ctx.currentPhase === 'idle' || ctx.currentPhase === 'grace-period')) {
    if (ctx.isTransferring) return 'defer';
    return 'start-scenario-a';
  }

  // Signaling disconnected from idle
  if (ctx.signalingConnectionState === 'disconnected' && ctx.currentPhase === 'idle') {
    if (ctx.isTransferring) return 'defer';
    return 'start-scenario-b';
  }

  // Already in a reconnection phase — don't start another
  return 'none';
};

/**
 * Orchestration hook that observes ICE + signaling state and drives auto-reconnection.
 * Camera always initiates (creates offers); viewer stays ready.
 */
export const useAutoReconnect = (options: UseAutoReconnectOptions): UseAutoReconnectResult => {
  const {
    role,
    iceConnectionState,
    signalingConnectionState,
    wasConnected,
    roomCode,
    isRecording,
    isTransferring,
    restartIce,
    renegotiate,
    reconnectSignaling,
    rejoinRoom,
    backoffConfig = DEFAULT_BACKOFF_CONFIG,
  } = options;

  const [reconnectionState, setReconnectionState] = useState<ReconnectionState>({
    ...INITIAL_RECONNECTION_STATE,
    maxAttempts: backoffConfig.maxAttempts,
  });

  const phaseRef = useRef<InternalPhase>('idle');
  const attemptRef = useRef(0);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const deferredRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    if (backoffTimerRef.current) {
      clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    clearTimers();
    phaseRef.current = 'idle';
    attemptRef.current = 0;
    cancelledRef.current = false;
    deferredRef.current = false;
    setReconnectionState({
      ...INITIAL_RECONNECTION_STATE,
      maxAttempts: backoffConfig.maxAttempts,
    });
  }, [clearTimers, backoffConfig.maxAttempts]);

  const giveUp = useCallback((reason: string) => {
    clearTimers();
    phaseRef.current = 'give-up';
    setReconnectionState({
      isReconnecting: false,
      attempt: attemptRef.current,
      maxAttempts: backoffConfig.maxAttempts,
      lastDisconnectReason: reason,
      strategy: null,
    });
  }, [clearTimers, backoffConfig.maxAttempts]);

  const cancelReconnection = useCallback(() => {
    cancelledRef.current = true;
    resetState();
  }, [resetState]);

  /**
   * Scenario A: ICE failed, signaling still alive.
   * 1. ICE restart
   * 2. If still failed -> full renegotiation (suppressed if recording)
   */
  const runScenarioA = useCallback(async () => {
    if (cancelledRef.current || role !== 'camera') return;

    phaseRef.current = 'scenario-a';
    const currentAttempt = attemptRef.current;

    const updateState = (strategy: ReconnectionStrategy) => {
      setReconnectionState({
        isReconnecting: true,
        attempt: currentAttempt,
        maxAttempts: backoffConfig.maxAttempts,
        lastDisconnectReason: 'ice-failure',
        strategy,
      });
    };

    // Step 1: ICE restart (always allowed, even during recording)
    updateState('ice-restart');
    const iceOffer = await restartIce();
    if (iceOffer && !cancelledRef.current) {
      return; // Offer auto-sent via channel; wait for ICE state to recover
    }

    // Step 2: Full renegotiation (suppressed during recording)
    if (isRecording) {
      console.log('[AutoReconnect] Renegotiation suppressed during recording');
      // Schedule retry
      attemptRef.current += 1;
      const delay = calculateBackoffDelay(attemptRef.current, backoffConfig);
      if (delay === null) {
        giveUp('ice-failure');
        return;
      }
      backoffTimerRef.current = setTimeout(() => runScenarioA(), delay);
      return;
    }

    updateState('renegotiation');
    const reOffer = await renegotiate();
    if (reOffer && !cancelledRef.current) {
      return; // Offer auto-sent via channel
    }

    // Schedule retry with backoff
    attemptRef.current += 1;
    const delay = calculateBackoffDelay(attemptRef.current, backoffConfig);
    if (delay === null) {
      giveUp('ice-failure');
      return;
    }
    backoffTimerRef.current = setTimeout(() => runScenarioA(), delay);
  }, [role, backoffConfig, restartIce, renegotiate, isRecording, giveUp]);

  /**
   * Scenario B: Signaling dropped.
   * 1. Socket.IO handles initial reconnect attempts
   * 2. On reconnected -> rejoinRoom
   * 3. On peer-joined -> camera creates new offer
   * 4. Manual reconnect with backoff if all else fails
   */
  const runScenarioB = useCallback(async () => {
    if (cancelledRef.current || !roomCode) return;

    phaseRef.current = 'scenario-b';
    const currentAttempt = attemptRef.current;

    setReconnectionState({
      isReconnecting: true,
      attempt: currentAttempt,
      maxAttempts: backoffConfig.maxAttempts,
      lastDisconnectReason: 'signaling-disconnect',
      strategy: 'signaling-rejoin',
    });

    try {
      // Try to reconnect signaling
      await reconnectSignaling();

      if (cancelledRef.current) return;

      // Rejoin the room
      const rejoined = await rejoinRoom(roomCode, role);
      if (!rejoined) {
        throw new Error('Failed to rejoin room');
      }

      // If camera, the peer-joined handler in the screen will create a new offer.
      // Reset state — the connection flow will handle the rest.
      return;
    } catch (err) {
      console.log('[AutoReconnect] Scenario B attempt failed:', err);
    }

    if (cancelledRef.current) return;

    // Schedule retry
    attemptRef.current += 1;
    const delay = calculateBackoffDelay(attemptRef.current, backoffConfig);
    if (delay === null) {
      giveUp('signaling-disconnect');
      return;
    }
    backoffTimerRef.current = setTimeout(() => runScenarioB(), delay);
  }, [roomCode, role, backoffConfig, reconnectSignaling, rejoinRoom, giveUp]);

  // Watch ICE connection state for failures
  useEffect(() => {
    if (!wasConnected) return;
    if (cancelledRef.current) return;

    // ICE self-healed or connected
    if (iceConnectionState === 'connected' || iceConnectionState === 'completed') {
      if (phaseRef.current === 'grace-period' || phaseRef.current === 'scenario-a') {
        resetState();
      }
      return;
    }

    // ICE disconnected: start grace period
    if (iceConnectionState === 'disconnected' && phaseRef.current === 'idle') {
      if (isTransferring) {
        deferredRef.current = true;
        return;
      }

      phaseRef.current = 'grace-period';
      setReconnectionState((prev) => ({
        ...prev,
        isReconnecting: true,
        lastDisconnectReason: 'ice-disconnected',
        strategy: 'ice-restart',
      }));

      graceTimerRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        attemptRef.current = 0;
        runScenarioA();
      }, ICE_GRACE_PERIOD_MS);
      return;
    }

    // ICE failed: skip grace period
    if (iceConnectionState === 'failed' && (phaseRef.current === 'idle' || phaseRef.current === 'grace-period')) {
      clearTimers();

      if (isTransferring) {
        deferredRef.current = true;
        return;
      }

      attemptRef.current = 0;
      runScenarioA();
    }
  }, [iceConnectionState, wasConnected, isTransferring, resetState, clearTimers, runScenarioA]);

  // Watch signaling connection state
  useEffect(() => {
    if (!wasConnected) return;
    if (cancelledRef.current) return;

    if (signalingConnectionState === 'disconnected' && phaseRef.current === 'idle') {
      if (isTransferring) {
        deferredRef.current = true;
        return;
      }

      attemptRef.current = 0;
      runScenarioB();
    }

    // Signaling recovered externally (Socket.IO auto-reconnect)
    if (signalingConnectionState === 'connected' && phaseRef.current === 'scenario-b') {
      // The rejoin logic in runScenarioB handles this
    }
  }, [signalingConnectionState, wasConnected, isTransferring, runScenarioB]);

  // When transfer completes, run deferred reconnection
  useEffect(() => {
    if (!isTransferring && deferredRef.current && phaseRef.current === 'idle') {
      deferredRef.current = false;

      if (iceConnectionState === 'failed' || iceConnectionState === 'disconnected') {
        attemptRef.current = 0;
        runScenarioA();
      } else if (signalingConnectionState === 'disconnected') {
        attemptRef.current = 0;
        runScenarioB();
      }
    }
  }, [isTransferring, iceConnectionState, signalingConnectionState, runScenarioA, runScenarioB]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return {
    reconnectionState,
    cancelReconnection,
  };
};
