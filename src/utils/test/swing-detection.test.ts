import { describe, it, expect } from 'vitest';
import {
  computeBodyRelativeWristVelocity,
  computeTorsoAnchor,
  nextSwingState,
  sensitivityToThreshold,
  DEFAULT_SWING_DETECTION_CONFIG,
  INITIAL_SWING_COUNTERS,
} from '../swing-detection';
import type { WristMotionResult } from '../swing-detection';
import type { PoseFrame, JointName } from '@/src/types/pose';

/** Helper to create a PoseFrame with specified joint overrides. */
const makePoseFrame = (
  timestamp: number,
  overrides: Partial<Record<JointName, { x: number; y: number; confidence: number }>> = {},
): PoseFrame => {
  const defaultJoint = { x: 0.5, y: 0.5, confidence: 0.9 };
  const jointNames: JointName[] = [
    'nose', 'neck', 'leftShoulder', 'rightShoulder',
    'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
    'leftHip', 'rightHip', 'leftKnee', 'rightKnee',
    'leftAnkle', 'rightAnkle',
  ];

  const joints = {} as Record<JointName, { x: number; y: number; confidence: number }>;
  for (const name of jointNames) {
    joints[name] = { ...defaultJoint };
  }
  for (const [name, value] of Object.entries(overrides)) {
    joints[name as JointName] = value!;
  }

  return { timestamp, joints };
};

/** Helper to create a WristMotionResult for state machine tests. */
const motion = (velocity: number, upwardFraction: number = 1.0): WristMotionResult => ({
  velocity,
  upwardFraction,
});

describe('computeTorsoAnchor', () => {
  it('returns midpoint of both shoulders when both are valid', () => {
    const pose = makePoseFrame(0, {
      leftShoulder: { x: 0.3, y: 0.4, confidence: 0.9 },
      rightShoulder: { x: 0.7, y: 0.6, confidence: 0.9 },
    });
    const anchor = computeTorsoAnchor(pose);
    expect(anchor).toEqual({ x: 0.5, y: 0.5 });
  });

  it('returns single shoulder when only left is valid', () => {
    const pose = makePoseFrame(0, {
      leftShoulder: { x: 0.3, y: 0.4, confidence: 0.9 },
      rightShoulder: { x: 0.7, y: 0.6, confidence: 0.1 },
    });
    const anchor = computeTorsoAnchor(pose);
    expect(anchor).toEqual({ x: 0.3, y: 0.4 });
  });

  it('returns single shoulder when only right is valid', () => {
    const pose = makePoseFrame(0, {
      leftShoulder: { x: 0.3, y: 0.4, confidence: 0.1 },
      rightShoulder: { x: 0.7, y: 0.6, confidence: 0.9 },
    });
    const anchor = computeTorsoAnchor(pose);
    expect(anchor).toEqual({ x: 0.7, y: 0.6 });
  });

  it('falls back to hip midpoint when shoulders are low confidence', () => {
    const pose = makePoseFrame(0, {
      leftShoulder: { x: 0.3, y: 0.4, confidence: 0.1 },
      rightShoulder: { x: 0.7, y: 0.6, confidence: 0.1 },
      leftHip: { x: 0.4, y: 0.7, confidence: 0.9 },
      rightHip: { x: 0.6, y: 0.7, confidence: 0.9 },
    });
    const anchor = computeTorsoAnchor(pose);
    expect(anchor).toEqual({ x: 0.5, y: 0.7 });
  });

  it('returns null when no shoulders or hips are valid', () => {
    const pose = makePoseFrame(0, {
      leftShoulder: { x: 0.3, y: 0.4, confidence: 0.1 },
      rightShoulder: { x: 0.7, y: 0.6, confidence: 0.1 },
      leftHip: { x: 0.4, y: 0.7, confidence: 0.1 },
      rightHip: { x: 0.6, y: 0.7, confidence: 0.1 },
    });
    expect(computeTorsoAnchor(pose)).toBeNull();
  });
});

describe('computeBodyRelativeWristVelocity', () => {
  it('returns null when time delta is 0', () => {
    const pose = makePoseFrame(100);
    expect(computeBodyRelativeWristVelocity(pose, pose)).toBeNull();
  });

  it('returns null when time delta is negative', () => {
    const prev = makePoseFrame(200);
    const curr = makePoseFrame(100);
    expect(computeBodyRelativeWristVelocity(prev, curr)).toBeNull();
  });

  it('returns null when no torso anchor available', () => {
    const prev = makePoseFrame(0, {
      leftShoulder: { x: 0.3, y: 0.4, confidence: 0.1 },
      rightShoulder: { x: 0.7, y: 0.6, confidence: 0.1 },
      leftHip: { x: 0.4, y: 0.7, confidence: 0.1 },
      rightHip: { x: 0.6, y: 0.7, confidence: 0.1 },
    });
    const curr = makePoseFrame(100, {
      leftShoulder: { x: 0.3, y: 0.4, confidence: 0.1 },
      rightShoulder: { x: 0.7, y: 0.6, confidence: 0.1 },
      leftHip: { x: 0.4, y: 0.7, confidence: 0.1 },
      rightHip: { x: 0.6, y: 0.7, confidence: 0.1 },
    });
    expect(computeBodyRelativeWristVelocity(prev, curr)).toBeNull();
  });

  it('returns null when no wrists have sufficient confidence', () => {
    const prev = makePoseFrame(0, {
      leftWrist: { x: 0.3, y: 0.5, confidence: 0.1 },
      rightWrist: { x: 0.7, y: 0.5, confidence: 0.1 },
    });
    const curr = makePoseFrame(100, {
      leftWrist: { x: 0.5, y: 0.5, confidence: 0.1 },
      rightWrist: { x: 0.9, y: 0.5, confidence: 0.1 },
    });
    expect(computeBodyRelativeWristVelocity(prev, curr)).toBeNull();
  });

  it('cancels out uniform camera pan (body-relative = near zero)', () => {
    // Simulate camera pan: everything shifts by +0.1 in x
    const panDelta = 0.1;
    const prev = makePoseFrame(0, {
      leftShoulder: { x: 0.3, y: 0.4, confidence: 0.9 },
      rightShoulder: { x: 0.7, y: 0.4, confidence: 0.9 },
      leftWrist: { x: 0.3, y: 0.6, confidence: 0.9 },
      rightWrist: { x: 0.7, y: 0.6, confidence: 0.9 },
    });
    const curr = makePoseFrame(1000, {
      leftShoulder: { x: 0.3 + panDelta, y: 0.4, confidence: 0.9 },
      rightShoulder: { x: 0.7 + panDelta, y: 0.4, confidence: 0.9 },
      leftWrist: { x: 0.3 + panDelta, y: 0.6, confidence: 0.9 },
      rightWrist: { x: 0.7 + panDelta, y: 0.6, confidence: 0.9 },
    });

    const result = computeBodyRelativeWristVelocity(prev, curr);
    expect(result).not.toBeNull();
    expect(result!.velocity).toBeCloseTo(0, 5);
  });

  it('detects real wrist motion relative to torso', () => {
    // Shoulders stay still, wrists move up by 0.3
    const prev = makePoseFrame(0, {
      leftShoulder: { x: 0.3, y: 0.4, confidence: 0.9 },
      rightShoulder: { x: 0.7, y: 0.4, confidence: 0.9 },
      leftWrist: { x: 0.3, y: 0.6, confidence: 0.9 },
      rightWrist: { x: 0.7, y: 0.6, confidence: 0.9 },
    });
    const curr = makePoseFrame(1000, {
      leftShoulder: { x: 0.3, y: 0.4, confidence: 0.9 },
      rightShoulder: { x: 0.7, y: 0.4, confidence: 0.9 },
      leftWrist: { x: 0.3, y: 0.3, confidence: 0.9 },
      rightWrist: { x: 0.7, y: 0.3, confidence: 0.9 },
    });

    const result = computeBodyRelativeWristVelocity(prev, curr);
    expect(result).not.toBeNull();
    // Wrist moved 0.3 in Y over 1s
    expect(result!.velocity).toBeCloseTo(0.3);
    // Purely upward motion
    expect(result!.upwardFraction).toBeCloseTo(1.0);
  });

  it('computes velocity from a single valid wrist', () => {
    const prev = makePoseFrame(0, {
      leftShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      rightShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      leftWrist: { x: 0.5, y: 0.6, confidence: 0.9 },
      rightWrist: { x: 0.5, y: 0.5, confidence: 0.1 }, // low confidence
    });
    const curr = makePoseFrame(1000, {
      leftShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      rightShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      leftWrist: { x: 0.5, y: 0.3, confidence: 0.9 }, // moved up 0.3
      rightWrist: { x: 0.5, y: 0.5, confidence: 0.1 },
    });

    const result = computeBodyRelativeWristVelocity(prev, curr);
    expect(result).not.toBeNull();
    expect(result!.velocity).toBeCloseTo(0.3);
  });

  it('returns upwardFraction=0 for downward motion', () => {
    const prev = makePoseFrame(0, {
      leftShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      rightShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      leftWrist: { x: 0.5, y: 0.3, confidence: 0.9 },
      rightWrist: { x: 0.5, y: 0.3, confidence: 0.9 },
    });
    const curr = makePoseFrame(1000, {
      leftShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      rightShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      leftWrist: { x: 0.5, y: 0.6, confidence: 0.9 }, // moved DOWN
      rightWrist: { x: 0.5, y: 0.6, confidence: 0.9 },
    });

    const result = computeBodyRelativeWristVelocity(prev, curr);
    expect(result).not.toBeNull();
    expect(result!.upwardFraction).toBe(0);
  });

  it('scales velocity by time delta', () => {
    const prev = makePoseFrame(0, {
      leftShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      rightShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      leftWrist: { x: 0.5, y: 0.6, confidence: 0.9 },
      rightWrist: { x: 0.5, y: 0.5, confidence: 0.1 },
    });
    const curr = makePoseFrame(100, {
      leftShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      rightShoulder: { x: 0.5, y: 0.3, confidence: 0.9 },
      leftWrist: { x: 0.5, y: 0.55, confidence: 0.9 }, // moved 0.05 in 0.1s
      rightWrist: { x: 0.5, y: 0.5, confidence: 0.1 },
    });

    const result = computeBodyRelativeWristVelocity(prev, curr);
    expect(result).not.toBeNull();
    // 0.05 / 0.1s = 0.5/s
    expect(result!.velocity).toBeCloseTo(0.5);
  });
});

describe('nextSwingState', () => {
  const config = DEFAULT_SWING_DETECTION_CONFIG;
  const counters = INITIAL_SWING_COUNTERS;

  describe('null motion (wrists/anchor lost)', () => {
    it('preserves state and counters when motion is null', () => {
      const detectingCounters = { ...counters, recentHits: [true, true] };
      const result = nextSwingState('detecting', null, 200, config, detectingCounters);
      expect(result.state).toBe('detecting');
      expect(result.event).toBeNull();
      expect(result.counters.recentHits).toEqual([true, true]);
    });

    it('preserves recording state when wrists are lost mid-swing', () => {
      const recordingCounters = { ...counters, swingStartTimestamp: 1000, cooldownCount: 1 };
      const result = nextSwingState('recording', null, 1500, config, recordingCounters);
      expect(result.state).toBe('recording');
      expect(result.event).toBeNull();
      expect(result.counters.cooldownCount).toBe(1);
    });

    it('preserves armed state when wrists are lost', () => {
      const result = nextSwingState('armed', null, 100, config, counters);
      expect(result.state).toBe('armed');
      expect(result.event).toBeNull();
    });
  });

  describe('idle state', () => {
    it('stays idle regardless of velocity', () => {
      const result = nextSwingState('idle', motion(1.0), 100, config, counters);
      expect(result.state).toBe('idle');
      expect(result.event).toBeNull();
    });
  });

  describe('armed state', () => {
    it('stays armed when velocity is below initial threshold', () => {
      // Initial threshold = 0.12 * 1.5 = 0.18
      const result = nextSwingState('armed', motion(0.10), 100, config, counters);
      expect(result.state).toBe('armed');
      expect(result.event).toBeNull();
    });

    it('stays armed when velocity is high but direction is wrong', () => {
      // High velocity but no upward motion
      const result = nextSwingState('armed', motion(0.30, 0.0), 100, config, counters);
      expect(result.state).toBe('armed');
    });

    it('transitions to detecting when velocity exceeds initial threshold with upward motion', () => {
      // initialThreshold = 0.12 * 1.5 = 0.18, and upward fraction >= 0.3
      const result = nextSwingState('armed', motion(0.20, 0.5), 100, config, counters);
      expect(result.state).toBe('detecting');
      expect(result.event).toBeNull();
      expect(result.counters.recentHits).toEqual([true]);
    });

    it('requires higher velocity than detecting state (initial trigger multiplier)', () => {
      // 0.15 is above base threshold (0.12) but below initial (0.18)
      const result = nextSwingState('armed', motion(0.15, 1.0), 100, config, counters);
      expect(result.state).toBe('armed');
    });
  });

  describe('detecting state (sliding window)', () => {
    it('accumulates hits in the sliding window', () => {
      const detectingCounters = { ...counters, recentHits: [true] };
      const result = nextSwingState('detecting', motion(0.20, 0.5), 200, config, detectingCounters);
      expect(result.state).toBe('detecting');
      expect(result.counters.recentHits).toEqual([true, true]);
    });

    it('transitions to recording when enough hits in window (3 of 5)', () => {
      const detectingCounters = { ...counters, recentHits: [true, true] };
      const result = nextSwingState('detecting', motion(0.20, 0.5), 300, config, detectingCounters);
      expect(result.state).toBe('recording');
      expect(result.event).toEqual({ type: 'swingStarted', timestamp: 300 });
      expect(result.counters.swingStartTimestamp).toBe(300);
    });

    it('tolerates a miss in the window without cancelling', () => {
      // 2 hits, then a miss — should still be detecting
      const detectingCounters = { ...counters, recentHits: [true, true] };
      const result = nextSwingState('detecting', motion(0.01, 0.0), 200, config, detectingCounters);
      expect(result.state).toBe('detecting');
      expect(result.counters.recentHits).toEqual([true, true, false]);
    });

    it('cancels back to armed when window is full with too few hits', () => {
      // 4 misses and 1 hit = full window of 5 with only 1 true → cancel
      const detectingCounters = { ...counters, recentHits: [true, false, false, false] };
      const result = nextSwingState('detecting', motion(0.01, 0.0), 200, config, detectingCounters);
      expect(result.state).toBe('armed');
      expect(result.counters.recentHits).toEqual([]);
    });

    it('keeps detecting when window has >= 2 hits but not enough to confirm', () => {
      // 4 items + miss = full window of 5 with 2 hits — not enough to confirm, but >= 2 so don't cancel
      const detectingCounters = { ...counters, recentHits: [true, false, true, false] };
      const result = nextSwingState('detecting', motion(0.01, 0.0), 200, config, detectingCounters);
      expect(result.state).toBe('detecting');
      expect(result.counters.recentHits).toEqual([true, false, true, false, false]);
    });

    it('uses base threshold (not initial multiplier) in detecting state', () => {
      // 0.13 is above base (0.12) but below initial (0.18)
      const detectingCounters = { ...counters, recentHits: [true, true] };
      const result = nextSwingState('detecting', motion(0.13, 1.0), 200, config, detectingCounters);
      expect(result.state).toBe('recording');
    });

    it('requires upward fraction during detecting', () => {
      const detectingCounters = { ...counters, recentHits: [true, true] };
      // High velocity but pure downward motion
      const result = nextSwingState('detecting', motion(0.30, 0.0), 200, config, detectingCounters);
      // The frame is a miss because direction check fails
      expect(result.counters.recentHits).toContain(false);
    });
  });

  describe('recording state', () => {
    const recordingCounters = { ...counters, swingStartTimestamp: 1000 };

    it('stays recording while velocity is high (resets cooldown, no direction check)', () => {
      const withCooldown = { ...recordingCounters, cooldownCount: 2 };
      // Downward motion (upwardFraction=0) still counts during recording
      const result = nextSwingState('recording', motion(0.2, 0.0), 1500, config, withCooldown);
      expect(result.state).toBe('recording');
      expect(result.counters.cooldownCount).toBe(0);
    });

    it('increments cooldown count when velocity drops', () => {
      const result = nextSwingState('recording', motion(0.01), 1500, config, recordingCounters);
      expect(result.state).toBe('recording');
      expect(result.counters.cooldownCount).toBe(1);
    });

    it('transitions to cooldown and emits swingEnded after enough low-velocity frames', () => {
      const almostDone = { ...recordingCounters, cooldownCount: config.cooldownFrames - 1 };
      const result = nextSwingState('recording', motion(0.01), 2000, config, almostDone);
      expect(result.state).toBe('cooldown');
      expect(result.event).toEqual({
        type: 'swingEnded',
        timestamp: 2000,
        durationMs: 1000,
      });
    });

    it('cancels swing if duration is below minimum', () => {
      const shortSwing = { ...recordingCounters, cooldownCount: config.cooldownFrames - 1 };
      // Timestamp only 200ms after start (below 500ms minimum)
      const result = nextSwingState('recording', motion(0.01), 1200, config, shortSwing);
      expect(result.state).toBe('armed');
      expect(result.event).toEqual({
        type: 'swingCancelled',
        reason: 'too_short',
      });
    });
  });

  describe('cooldown state', () => {
    it('transitions back to armed', () => {
      const result = nextSwingState('cooldown', motion(0.01), 3000, config, counters);
      expect(result.state).toBe('armed');
      expect(result.event).toBeNull();
    });
  });
});

describe('sensitivityToThreshold', () => {
  it('returns 0.30 at sensitivity 0 (least sensitive)', () => {
    expect(sensitivityToThreshold(0)).toBeCloseTo(0.30);
  });

  it('returns 0.05 at sensitivity 1 (most sensitive)', () => {
    expect(sensitivityToThreshold(1)).toBeCloseTo(0.05);
  });

  it('returns 0.175 at sensitivity 0.5 (middle)', () => {
    expect(sensitivityToThreshold(0.5)).toBeCloseTo(0.175);
  });

  it('clamps values below 0', () => {
    expect(sensitivityToThreshold(-0.5)).toBeCloseTo(0.30);
  });

  it('clamps values above 1', () => {
    expect(sensitivityToThreshold(1.5)).toBeCloseTo(0.05);
  });
});
