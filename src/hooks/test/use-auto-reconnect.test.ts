import { describe, it, expect } from 'vitest';
import {
  determineReconnectionAction,
  type ReconnectionContext,
} from '../use-auto-reconnect';

const createContext = (overrides: Partial<ReconnectionContext> = {}): ReconnectionContext => ({
  role: 'camera',
  iceConnectionState: 'connected',
  signalingConnectionState: 'connected',
  wasConnected: true,
  roomCode: 'ABC123',
  isRecording: false,
  isTransferring: false,
  currentPhase: 'idle',
  currentAttempt: 0,
  maxAttempts: 5,
  ...overrides,
});

describe('determineReconnectionAction', () => {
  describe('when not previously connected', () => {
    it('returns no-op', () => {
      const ctx = createContext({ wasConnected: false, iceConnectionState: 'failed' });
      expect(determineReconnectionAction(ctx)).toBe('none');
    });
  });

  describe('ICE self-heal detection', () => {
    it('returns reset when ICE recovers during grace period', () => {
      const ctx = createContext({
        iceConnectionState: 'connected',
        currentPhase: 'grace-period',
      });
      expect(determineReconnectionAction(ctx)).toBe('reset');
    });

    it('returns reset when ICE recovers during scenario-a', () => {
      const ctx = createContext({
        iceConnectionState: 'completed',
        currentPhase: 'scenario-a',
      });
      expect(determineReconnectionAction(ctx)).toBe('reset');
    });
  });

  describe('Scenario A — ICE failures', () => {
    it('returns grace-period on ICE disconnected from idle', () => {
      const ctx = createContext({ iceConnectionState: 'disconnected' });
      expect(determineReconnectionAction(ctx)).toBe('start-grace-period');
    });

    it('defers when transferring and ICE disconnects', () => {
      const ctx = createContext({
        iceConnectionState: 'disconnected',
        isTransferring: true,
      });
      expect(determineReconnectionAction(ctx)).toBe('defer');
    });

    it('returns ice-restart on ICE failed from idle', () => {
      const ctx = createContext({ iceConnectionState: 'failed' });
      expect(determineReconnectionAction(ctx)).toBe('start-scenario-a');
    });

    it('returns ice-restart on ICE failed from grace-period', () => {
      const ctx = createContext({
        iceConnectionState: 'failed',
        currentPhase: 'grace-period',
      });
      expect(determineReconnectionAction(ctx)).toBe('start-scenario-a');
    });

    it('defers when transferring and ICE fails', () => {
      const ctx = createContext({
        iceConnectionState: 'failed',
        isTransferring: true,
      });
      expect(determineReconnectionAction(ctx)).toBe('defer');
    });
  });

  describe('Scenario B — Signaling dropped', () => {
    it('returns start-scenario-b when signaling disconnects from idle', () => {
      const ctx = createContext({ signalingConnectionState: 'disconnected' });
      expect(determineReconnectionAction(ctx)).toBe('start-scenario-b');
    });

    it('defers when transferring and signaling disconnects', () => {
      const ctx = createContext({
        signalingConnectionState: 'disconnected',
        isTransferring: true,
      });
      expect(determineReconnectionAction(ctx)).toBe('defer');
    });
  });

  describe('Recording suppression', () => {
    it('allows ICE restart during recording (scenario A still triggers)', () => {
      const ctx = createContext({
        iceConnectionState: 'failed',
        isRecording: true,
      });
      // Scenario A starts — recording suppresses renegotiation internally,
      // but the action to start scenario A is still triggered
      expect(determineReconnectionAction(ctx)).toBe('start-scenario-a');
    });
  });

  describe('Viewer role', () => {
    it('returns start-scenario-a for viewer (hook internally no-ops on camera-only actions)', () => {
      const ctx = createContext({
        role: 'viewer',
        iceConnectionState: 'failed',
      });
      // The action is still determined — the hook handles role gating
      expect(determineReconnectionAction(ctx)).toBe('start-scenario-a');
    });

    it('returns start-scenario-b for viewer signaling drop', () => {
      const ctx = createContext({
        role: 'viewer',
        signalingConnectionState: 'disconnected',
      });
      expect(determineReconnectionAction(ctx)).toBe('start-scenario-b');
    });
  });

  describe('Transfer deferral recovery', () => {
    it('returns start-scenario-a when transfer finishes with ICE failed', () => {
      const ctx = createContext({
        iceConnectionState: 'failed',
        isTransferring: false,
        currentPhase: 'idle',
      });
      expect(determineReconnectionAction(ctx)).toBe('start-scenario-a');
    });

    it('returns start-scenario-b when transfer finishes with signaling down', () => {
      const ctx = createContext({
        signalingConnectionState: 'disconnected',
        isTransferring: false,
        currentPhase: 'idle',
      });
      expect(determineReconnectionAction(ctx)).toBe('start-scenario-b');
    });
  });

  describe('Give-up state', () => {
    it('returns none when already given up', () => {
      const ctx = createContext({
        iceConnectionState: 'failed',
        currentPhase: 'give-up',
      });
      expect(determineReconnectionAction(ctx)).toBe('none');
    });
  });

  describe('Already reconnecting', () => {
    it('returns none when already in scenario-a', () => {
      const ctx = createContext({
        iceConnectionState: 'failed',
        currentPhase: 'scenario-a',
      });
      expect(determineReconnectionAction(ctx)).toBe('none');
    });

    it('returns none when already in scenario-b', () => {
      const ctx = createContext({
        signalingConnectionState: 'disconnected',
        currentPhase: 'scenario-b',
      });
      expect(determineReconnectionAction(ctx)).toBe('none');
    });
  });
});
