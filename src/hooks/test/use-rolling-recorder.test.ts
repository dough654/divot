import { describe, it, expect } from 'vitest';
import {
  nextRollingRecorderState,
  type RollingRecorderState,
  type RollingRecorderAction,
  type RollingRecorderEffect,
} from '../../utils/rolling-recorder-state';

/** Helper to apply a sequence of actions and return the final state + all effects. */
const applyActions = (
  initialState: RollingRecorderState,
  actions: Array<{ action: RollingRecorderAction; suspended?: boolean }>,
): { state: RollingRecorderState; allEffects: RollingRecorderEffect[] } => {
  let state = initialState;
  const allEffects: RollingRecorderEffect[] = [];
  for (const { action, suspended = false } of actions) {
    const result = nextRollingRecorderState(state, action, suspended);
    state = result.state;
    allEffects.push(...result.effects);
  }
  return { state, allEffects };
};

describe('nextRollingRecorderState', () => {
  describe('enable/disable', () => {
    it('transitions from idle to buffering when enabled', () => {
      const result = nextRollingRecorderState('idle', { type: 'enable' }, false);
      expect(result.state).toBe('buffering');
      expect(result.effects).toContain('startRecording');
      expect(result.effects).toContain('scheduleCycle');
    });

    it('stays idle when enabled while suspended', () => {
      const result = nextRollingRecorderState('idle', { type: 'enable' }, true);
      expect(result.state).toBe('idle');
      expect(result.effects).toEqual([]);
    });

    it('ignores enable when already buffering', () => {
      const result = nextRollingRecorderState('buffering', { type: 'enable' }, false);
      expect(result.state).toBe('buffering');
      expect(result.effects).toEqual([]);
    });

    it('cancels recording and returns to idle on disable from buffering', () => {
      const result = nextRollingRecorderState('buffering', { type: 'disable' }, false);
      expect(result.state).toBe('idle');
      expect(result.effects).toContain('cancelRecording');
      expect(result.effects).toContain('clearCycleTimer');
    });

    it('cancels recording from post-rolling state on disable', () => {
      const result = nextRollingRecorderState('post-rolling', { type: 'disable' }, false);
      expect(result.state).toBe('idle');
      expect(result.effects).toContain('cancelRecording');
      expect(result.effects).toContain('clearPostRollTimer');
    });

    it('clears timers but does not cancel recording from transitioning on disable', () => {
      const result = nextRollingRecorderState('transitioning', { type: 'disable' }, false);
      expect(result.state).toBe('idle');
      expect(result.effects).toContain('clearCycleTimer');
      expect(result.effects).not.toContain('cancelRecording');
    });

    it('is a no-op when disabling from idle', () => {
      const result = nextRollingRecorderState('idle', { type: 'disable' }, false);
      expect(result.state).toBe('idle');
      expect(result.effects).toEqual([]);
    });
  });

  describe('segment cycling', () => {
    it('transitions to transitioning when cycle expires during buffering', () => {
      const result = nextRollingRecorderState('buffering', { type: 'cycleExpired' }, false);
      expect(result.state).toBe('transitioning');
      expect(result.effects).toContain('cancelRecording');
    });

    it('ignores cycle expiry in non-buffering states', () => {
      const result = nextRollingRecorderState('post-rolling', { type: 'cycleExpired' }, false);
      expect(result.state).toBe('post-rolling');
      expect(result.effects).toEqual([]);
    });

    it('restarts buffering after cancel finalized', () => {
      const result = nextRollingRecorderState('transitioning', { type: 'cancelFinalized' }, false);
      expect(result.state).toBe('buffering');
      expect(result.effects).toContain('startRecording');
      expect(result.effects).toContain('scheduleCycle');
    });

    it('goes idle after cancel finalized when suspended', () => {
      const result = nextRollingRecorderState('transitioning', { type: 'cancelFinalized' }, true);
      expect(result.state).toBe('idle');
      expect(result.effects).toEqual([]);
    });

    it('ignores cancel finalized in non-transitioning states', () => {
      const result = nextRollingRecorderState('buffering', { type: 'cancelFinalized' }, false);
      expect(result.state).toBe('buffering');
      expect(result.effects).toEqual([]);
    });
  });

  describe('fixed-window swing capture', () => {
    it('transitions from buffering to post-rolling on swing detected', () => {
      const result = nextRollingRecorderState('buffering', { type: 'swingDetected' }, false);
      expect(result.state).toBe('post-rolling');
      expect(result.effects).toContain('clearCycleTimer');
      expect(result.effects).toContain('schedulePostRoll');
    });

    it('ignores swing detected when idle', () => {
      const result = nextRollingRecorderState('idle', { type: 'swingDetected' }, false);
      expect(result.state).toBe('idle');
      expect(result.effects).toEqual([]);
    });

    it('ignores swing detected when transitioning', () => {
      const result = nextRollingRecorderState('transitioning', { type: 'swingDetected' }, false);
      expect(result.state).toBe('transitioning');
      expect(result.effects).toEqual([]);
    });

    it('ignores swing detected when already post-rolling', () => {
      const result = nextRollingRecorderState('post-rolling', { type: 'swingDetected' }, false);
      expect(result.state).toBe('post-rolling');
      expect(result.effects).toEqual([]);
    });

    it('stops recording when post-roll expires', () => {
      const result = nextRollingRecorderState('post-rolling', { type: 'postRollExpired' }, false);
      expect(result.state).toBe('post-rolling');
      expect(result.effects).toContain('stopRecording');
    });

    it('ignores post-roll expiry in wrong state', () => {
      const result = nextRollingRecorderState('buffering', { type: 'postRollExpired' }, false);
      expect(result.state).toBe('buffering');
      expect(result.effects).toEqual([]);
    });
  });

  describe('recording saved', () => {
    it('re-arms buffering after saving clip', () => {
      const result = nextRollingRecorderState('post-rolling', { type: 'recordingSaved' }, false);
      expect(result.state).toBe('buffering');
      expect(result.effects).toContain('startRecording');
      expect(result.effects).toContain('scheduleCycle');
    });

    it('goes idle after saving when suspended', () => {
      const result = nextRollingRecorderState('post-rolling', { type: 'recordingSaved' }, true);
      expect(result.state).toBe('idle');
    });
  });

  describe('recording error', () => {
    it('returns to idle and clears all timers', () => {
      const result = nextRollingRecorderState('buffering', { type: 'recordingError' }, false);
      expect(result.state).toBe('idle');
      expect(result.effects).toContain('clearCycleTimer');
      expect(result.effects).toContain('clearPostRollTimer');
    });

    it('clears timers from any active state', () => {
      for (const state of ['post-rolling', 'transitioning'] as RollingRecorderState[]) {
        const result = nextRollingRecorderState(state, { type: 'recordingError' }, false);
        expect(result.state).toBe('idle');
        expect(result.effects).toContain('clearCycleTimer');
      }
    });
  });

  describe('suspend/resume', () => {
    it('suspend cancels recording from buffering', () => {
      const result = nextRollingRecorderState('buffering', { type: 'suspend' }, false);
      expect(result.state).toBe('idle');
      expect(result.effects).toContain('cancelRecording');
    });

    it('suspend cancels recording from post-rolling', () => {
      const result = nextRollingRecorderState('post-rolling', { type: 'suspend' }, false);
      expect(result.state).toBe('idle');
      expect(result.effects).toContain('cancelRecording');
    });

    it('resume starts buffering from idle', () => {
      const result = nextRollingRecorderState('idle', { type: 'resume' }, false);
      expect(result.state).toBe('buffering');
      expect(result.effects).toContain('startRecording');
      expect(result.effects).toContain('scheduleCycle');
    });

    it('resume is no-op when already buffering', () => {
      const result = nextRollingRecorderState('buffering', { type: 'resume' }, false);
      expect(result.state).toBe('buffering');
      expect(result.effects).toEqual([]);
    });
  });

  describe('full capture flow', () => {
    it('goes through enable → buffer → swing → post-roll → save → re-arm', () => {
      const { state, allEffects } = applyActions('idle', [
        { action: { type: 'enable' } },
        { action: { type: 'swingDetected' } },
        { action: { type: 'postRollExpired' } },
        { action: { type: 'recordingSaved' } },
      ]);

      expect(state).toBe('buffering');
      expect(allEffects).toContain('startRecording');
      expect(allEffects).toContain('clearCycleTimer');
      expect(allEffects).toContain('schedulePostRoll');
      expect(allEffects).toContain('stopRecording');
      // Re-armed: second startRecording
      expect(allEffects.filter((e) => e === 'startRecording')).toHaveLength(2);
    });

    it('handles cycling before swing detection', () => {
      const { state } = applyActions('idle', [
        { action: { type: 'enable' } },
        { action: { type: 'cycleExpired' } },
        { action: { type: 'cancelFinalized' } },
        { action: { type: 'swingDetected' } },
      ]);

      expect(state).toBe('post-rolling');
    });

    it('ignores swing during transition — catches next one after re-arm', () => {
      const { state, allEffects } = applyActions('idle', [
        { action: { type: 'enable' } },
        { action: { type: 'cycleExpired' } },
        { action: { type: 'swingDetected' } },        // during transitioning — ignored
        { action: { type: 'cancelFinalized' } },       // restarts buffering
        { action: { type: 'swingDetected' } },          // now caught
        { action: { type: 'postRollExpired' } },
        { action: { type: 'recordingSaved' } },
      ]);

      expect(state).toBe('buffering');
      expect(allEffects).toContain('schedulePostRoll');
      expect(allEffects).toContain('stopRecording');
    });

    it('handles multiple cycles before swing', () => {
      const { state } = applyActions('idle', [
        { action: { type: 'enable' } },
        { action: { type: 'cycleExpired' } },
        { action: { type: 'cancelFinalized' } },
        { action: { type: 'cycleExpired' } },
        { action: { type: 'cancelFinalized' } },
        { action: { type: 'swingDetected' } },
      ]);

      expect(state).toBe('post-rolling');
    });

    it('handles suspend during post-rolling then saves', () => {
      const { state } = applyActions('idle', [
        { action: { type: 'enable' } },
        { action: { type: 'swingDetected' } },
        { action: { type: 'postRollExpired' } },
        { action: { type: 'recordingSaved' }, suspended: true },
      ]);

      expect(state).toBe('idle');
    });
  });
});
