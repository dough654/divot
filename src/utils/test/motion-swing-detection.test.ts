import { describe, it, expect } from 'vitest';
import {
  nextMotionSwingState,
  DEFAULT_MOTION_SWING_CONFIG,
  INITIAL_MOTION_SWING_COUNTERS,
  motionSensitivityToThreshold,
} from '../motion-swing-detection';
import type { MotionSwingState, MotionSwingCounters, MotionInput, MotionSwingConfig } from '../../types/motion-detection';

/** Helper to run the state machine through a sequence of inputs. */
const runSequence = (
  inputs: MotionInput[],
  config: MotionSwingConfig = DEFAULT_MOTION_SWING_CONFIG,
  initialState: MotionSwingState = 'idle',
  initialCounters: MotionSwingCounters = INITIAL_MOTION_SWING_COUNTERS,
) => {
  let state = initialState;
  let counters = initialCounters;
  const events: Array<ReturnType<typeof nextMotionSwingState>['event']> = [];

  for (const input of inputs) {
    const result = nextMotionSwingState(state, counters, input, config);
    state = result.state;
    counters = result.counters;
    if (result.event) events.push(result.event);
  }

  return { state, counters, events };
};

/** Helper to create a MotionInput. */
const input = (motionMagnitude: number, audioLevel = 0, timestamp = 0): MotionInput => ({
  motionMagnitude,
  audioLevel,
  timestamp,
});

describe('motionSensitivityToThreshold', () => {
  it('maps 0 sensitivity to high threshold (hard to trigger)', () => {
    expect(motionSensitivityToThreshold(0)).toBe(0.08);
  });

  it('maps 1 sensitivity to low threshold (easy to trigger)', () => {
    expect(motionSensitivityToThreshold(1)).toBe(0.015);
  });

  it('maps 0.5 to mid-range', () => {
    const result = motionSensitivityToThreshold(0.5);
    expect(result).toBeGreaterThan(0.015);
    expect(result).toBeLessThan(0.08);
  });

  it('clamps values below 0', () => {
    expect(motionSensitivityToThreshold(-1)).toBe(0.08);
  });

  it('clamps values above 1', () => {
    expect(motionSensitivityToThreshold(2)).toBe(0.015);
  });
});

describe('nextMotionSwingState', () => {
  describe('idle → watching', () => {
    it('transitions from idle to watching on first tick', () => {
      const result = nextMotionSwingState('idle', INITIAL_MOTION_SWING_COUNTERS, input(0));
      expect(result.state).toBe('watching');
      expect(result.event).toBeNull();
    });
  });

  describe('watching → still', () => {
    it('transitions to still when motion is below stillness threshold', () => {
      const result = nextMotionSwingState('watching', INITIAL_MOTION_SWING_COUNTERS, input(0.005));
      expect(result.state).toBe('still');
      expect(result.counters.stillFrameCount).toBe(1);
    });

    it('stays in watching when motion is above stillness threshold', () => {
      const result = nextMotionSwingState('watching', INITIAL_MOTION_SWING_COUNTERS, input(0.02));
      expect(result.state).toBe('watching');
    });
  });

  describe('still → armed', () => {
    it('transitions to armed after enough still frames', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        stillFrameCount: 19, // one less than default stillnessFrames (20)
      };
      const result = nextMotionSwingState('still', counters, input(0.005));
      expect(result.state).toBe('armed');
    });

    it('stays in still while accumulating frames', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        stillFrameCount: 10,
      };
      const result = nextMotionSwingState('still', counters, input(0.005));
      expect(result.state).toBe('still');
      expect(result.counters.stillFrameCount).toBe(11);
    });

    it('falls back to watching on motion', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        stillFrameCount: 15,
      };
      const result = nextMotionSwingState('still', counters, input(0.02));
      expect(result.state).toBe('watching');
      expect(result.counters.stillFrameCount).toBe(0);
    });
  });

  describe('armed → detecting', () => {
    it('transitions to detecting on a burst (motion > threshold * multiplier)', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        stillFrameCount: 20,
      };
      // Default: swingThreshold 0.04 * initialTriggerMultiplier 1.5 = 0.06
      const result = nextMotionSwingState('armed', counters, input(0.07, 0, 1000));
      expect(result.state).toBe('detecting');
      expect(result.counters.swingStartTimestamp).toBe(1000);
      expect(result.counters.recentMotionWindow).toEqual([0.07]);
    });

    it('stays armed on moderate motion below burst threshold', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        stillFrameCount: 20,
      };
      // Below 0.06 trigger but above 0.04 swing threshold
      const result = nextMotionSwingState('armed', counters, input(0.05));
      expect(result.state).toBe('armed');
    });

    it('stays armed when still', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        stillFrameCount: 20,
      };
      const result = nextMotionSwingState('armed', counters, input(0.005));
      expect(result.state).toBe('armed');
    });
  });

  describe('detecting → swing (confirmed)', () => {
    it('transitions to swing when enough hits in window', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        recentMotionWindow: [0.08, 0.07], // 2 hits already
        swingStartTimestamp: 1000,
      };
      // 3rd hit → meets swingConfirmationHits (3)
      const result = nextMotionSwingState('detecting', counters, input(0.06, 0, 1200));
      expect(result.state).toBe('swing');
      expect(result.event).toEqual({ type: 'swingStarted', timestamp: 1000 });
    });
  });

  describe('detecting → armed (cancelled)', () => {
    it('cancels detection when window is full without enough hits', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        recentMotionWindow: [0.01, 0.02, 0.01, 0.02], // 4 frames, 0 hits above 0.04
        swingStartTimestamp: 1000,
      };
      // 5th frame, still below threshold → window full, < 3 hits
      const result = nextMotionSwingState('detecting', counters, input(0.01, 0, 1300));
      expect(result.state).toBe('armed');
      expect(result.event?.type).toBe('swingCancelled');
    });
  });

  describe('swing → cooldown (swing ended)', () => {
    it('ends swing after cooldown frames of low motion', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        swingStartTimestamp: 1000,
        cooldownCount: 4, // one less than cooldownFrames (5)
        audioConfirmed: false,
      };
      const result = nextMotionSwingState('swing', counters, input(0.01, 0, 2000));
      expect(result.state).toBe('cooldown');
      expect(result.event).toEqual({
        type: 'swingEnded',
        timestamp: 2000,
        durationMs: 1000,
        audioConfirmed: false,
      });
    });

    it('resets cooldown counter when motion resumes', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        swingStartTimestamp: 1000,
        cooldownCount: 3,
        audioConfirmed: false,
      };
      const result = nextMotionSwingState('swing', counters, input(0.06, 0, 1500));
      expect(result.state).toBe('swing');
      expect(result.counters.cooldownCount).toBe(0);
    });

    it('cancels swing if too short', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        swingStartTimestamp: 1000,
        cooldownCount: 4,
        audioConfirmed: false,
      };
      // Only 200ms elapsed — below minSwingDurationMs (500)
      const result = nextMotionSwingState('swing', counters, input(0.01, 0, 1200));
      expect(result.state).toBe('armed');
      expect(result.event?.type).toBe('swingCancelled');
    });
  });

  describe('audio confirmation', () => {
    it('sets audioConfirmed during swing when audio exceeds threshold', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        swingStartTimestamp: 1000,
        cooldownCount: 0,
        audioConfirmed: false,
      };
      const result = nextMotionSwingState('swing', counters, input(0.06, 0.7, 1500));
      expect(result.counters.audioConfirmed).toBe(true);
    });

    it('carries audioConfirmed through to swingEnded event', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        swingStartTimestamp: 1000,
        cooldownCount: 4,
        audioConfirmed: true,
      };
      const result = nextMotionSwingState('swing', counters, input(0.01, 0, 2000));
      expect(result.state).toBe('cooldown');
      expect(result.event).toEqual({
        type: 'swingEnded',
        timestamp: 2000,
        durationMs: 1000,
        audioConfirmed: true,
      });
    });

    it('confirms audio even on the final cooldown frame', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        swingStartTimestamp: 1000,
        cooldownCount: 4,
        audioConfirmed: false,
      };
      const result = nextMotionSwingState('swing', counters, input(0.01, 0.8, 2000));
      expect(result.event).toEqual({
        type: 'swingEnded',
        timestamp: 2000,
        durationMs: 1000,
        audioConfirmed: true,
      });
    });

    it('does not gate transitions on audio — swing ends without audio', () => {
      const counters: MotionSwingCounters = {
        ...INITIAL_MOTION_SWING_COUNTERS,
        swingStartTimestamp: 1000,
        cooldownCount: 4,
        audioConfirmed: false,
      };
      const result = nextMotionSwingState('swing', counters, input(0.01, 0.1, 2000));
      expect(result.state).toBe('cooldown');
      expect(result.event?.type).toBe('swingEnded');
    });
  });

  describe('cooldown → armed', () => {
    it('immediately transitions from cooldown to armed', () => {
      const result = nextMotionSwingState('cooldown', INITIAL_MOTION_SWING_COUNTERS, input(0));
      expect(result.state).toBe('armed');
      // Should keep armed (stillFrameCount >= stillnessFrames)
      expect(result.counters.stillFrameCount).toBe(DEFAULT_MOTION_SWING_CONFIG.stillnessFrames);
    });
  });

  describe('full swing lifecycle', () => {
    it('detects a complete swing from idle to cooldown', () => {
      const config = DEFAULT_MOTION_SWING_CONFIG;
      const inputs: MotionInput[] = [];
      let t = 0;

      // idle → watching (1 tick)
      inputs.push(input(0.005, 0, t += 66));

      // watching → still (1 tick)
      inputs.push(input(0.005, 0, t += 66));

      // still → armed (19 more ticks of stillness)
      for (let i = 0; i < 19; i++) {
        inputs.push(input(0.005, 0, t += 66));
      }

      // armed → detecting (burst)
      inputs.push(input(0.08, 0, t += 66));

      // detecting → swing (2 more hits = 3 total)
      inputs.push(input(0.06, 0, t += 66));
      inputs.push(input(0.07, 0, t += 66));

      // swing continues for a while (>500ms)
      for (let i = 0; i < 10; i++) {
        inputs.push(input(0.05, 0, t += 66));
      }

      // Audio impact during swing
      inputs.push(input(0.05, 0.7, t += 66));

      // swing → cooldown (5 frames of low motion)
      for (let i = 0; i < 5; i++) {
        inputs.push(input(0.005, 0, t += 66));
      }

      // cooldown → armed
      inputs.push(input(0.005, 0, t += 66));

      const result = runSequence(inputs, config);

      expect(result.state).toBe('armed');
      expect(result.events).toHaveLength(2); // swingStarted + swingEnded
      expect(result.events[0]?.type).toBe('swingStarted');
      expect(result.events[1]?.type).toBe('swingEnded');
      if (result.events[1]?.type === 'swingEnded') {
        expect(result.events[1].audioConfirmed).toBe(true);
        expect(result.events[1].durationMs).toBeGreaterThan(500);
      }
    });

    it('re-arms after a swing and can detect another', () => {
      const config = DEFAULT_MOTION_SWING_CONFIG;
      const inputs: MotionInput[] = [];
      let t = 0;

      // First swing cycle: idle → watching → still → armed → detecting → swing → cooldown → armed
      inputs.push(input(0.005, 0, t += 66)); // idle → watching
      inputs.push(input(0.005, 0, t += 66)); // watching → still
      for (let i = 0; i < 19; i++) inputs.push(input(0.005, 0, t += 66)); // still → armed
      inputs.push(input(0.08, 0, t += 66)); // armed → detecting
      for (let i = 0; i < 3; i++) inputs.push(input(0.06, 0, t += 66)); // detecting → swing
      for (let i = 0; i < 10; i++) inputs.push(input(0.05, 0, t += 66)); // swing continues
      for (let i = 0; i < 5; i++) inputs.push(input(0.005, 0, t += 66)); // swing → cooldown
      inputs.push(input(0.005, 0, t += 66)); // cooldown → armed

      // Second swing: armed → detecting → swing → cooldown
      inputs.push(input(0.08, 0, t += 66)); // armed → detecting
      for (let i = 0; i < 3; i++) inputs.push(input(0.06, 0, t += 66)); // detecting → swing
      for (let i = 0; i < 10; i++) inputs.push(input(0.05, 0, t += 66)); // swing continues
      for (let i = 0; i < 5; i++) inputs.push(input(0.005, 0, t += 66)); // swing → cooldown

      const result = runSequence(inputs, config);
      const swingStartEvents = result.events.filter((e) => e?.type === 'swingStarted');
      const swingEndEvents = result.events.filter((e) => e?.type === 'swingEnded');

      expect(swingStartEvents).toHaveLength(2);
      expect(swingEndEvents).toHaveLength(2);
    });
  });
});
