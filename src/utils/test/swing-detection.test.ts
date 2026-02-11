import { describe, it, expect } from 'vitest';
import {
  computeWristVelocity,
  nextSwingState,
  sensitivityToThreshold,
  DEFAULT_SWING_DETECTION_CONFIG,
  INITIAL_SWING_COUNTERS,
} from '../swing-detection';
import type { PoseFrame, JointName } from '@/src/types/pose';

/** Helper to create a PoseFrame with specified wrist positions. */
const makePoseFrame = (
  timestamp: number,
  leftWrist: { x: number; y: number; confidence: number },
  rightWrist: { x: number; y: number; confidence: number },
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
  joints.leftWrist = leftWrist;
  joints.rightWrist = rightWrist;

  return { timestamp, joints };
};

describe('computeWristVelocity', () => {
  it('returns 0 when time delta is 0', () => {
    const pose = makePoseFrame(100, { x: 0.3, y: 0.5, confidence: 0.9 }, { x: 0.7, y: 0.5, confidence: 0.9 });
    expect(computeWristVelocity(pose, pose)).toBe(0);
  });

  it('returns 0 when time delta is negative', () => {
    const prev = makePoseFrame(200, { x: 0.3, y: 0.5, confidence: 0.9 }, { x: 0.7, y: 0.5, confidence: 0.9 });
    const curr = makePoseFrame(100, { x: 0.4, y: 0.5, confidence: 0.9 }, { x: 0.8, y: 0.5, confidence: 0.9 });
    expect(computeWristVelocity(prev, curr)).toBe(0);
  });

  it('returns 0 when no wrists have sufficient confidence', () => {
    const prev = makePoseFrame(0, { x: 0.3, y: 0.5, confidence: 0.1 }, { x: 0.7, y: 0.5, confidence: 0.1 });
    const curr = makePoseFrame(100, { x: 0.5, y: 0.5, confidence: 0.1 }, { x: 0.9, y: 0.5, confidence: 0.1 });
    expect(computeWristVelocity(prev, curr)).toBe(0);
  });

  it('computes velocity from a single valid wrist', () => {
    const prev = makePoseFrame(0, { x: 0.0, y: 0.0, confidence: 0.9 }, { x: 0.5, y: 0.5, confidence: 0.1 });
    const curr = makePoseFrame(1000, { x: 0.3, y: 0.4, confidence: 0.9 }, { x: 0.5, y: 0.5, confidence: 0.1 });
    // Distance = sqrt(0.09 + 0.16) = 0.5, time = 1s → velocity = 0.5
    expect(computeWristVelocity(prev, curr)).toBe(0.5);
  });

  it('averages velocity from both valid wrists', () => {
    const prev = makePoseFrame(0,
      { x: 0.0, y: 0.0, confidence: 0.9 },
      { x: 1.0, y: 0.0, confidence: 0.9 },
    );
    const curr = makePoseFrame(1000,
      { x: 0.3, y: 0.4, confidence: 0.9 }, // distance = 0.5
      { x: 0.7, y: 0.0, confidence: 0.9 }, // distance = 0.3
    );
    // Average = (0.5 + 0.3) / 2 = 0.4, time = 1s → velocity = 0.4
    expect(computeWristVelocity(prev, curr)).toBeCloseTo(0.4);
  });

  it('scales velocity by time delta (faster frame rate = lower displacement)', () => {
    const prev = makePoseFrame(0, { x: 0.0, y: 0.0, confidence: 0.9 }, { x: 0.5, y: 0.5, confidence: 0.1 });
    const curr = makePoseFrame(100, { x: 0.05, y: 0.0, confidence: 0.9 }, { x: 0.5, y: 0.5, confidence: 0.1 });
    // Distance = 0.05, time = 0.1s → velocity = 0.5/s
    expect(computeWristVelocity(prev, curr)).toBeCloseTo(0.5);
  });
});

describe('nextSwingState', () => {
  const config = DEFAULT_SWING_DETECTION_CONFIG;
  const counters = INITIAL_SWING_COUNTERS;

  describe('idle state', () => {
    it('stays idle regardless of velocity', () => {
      const result = nextSwingState('idle', 1.0, 100, config, counters);
      expect(result.state).toBe('idle');
      expect(result.event).toBeNull();
    });
  });

  describe('armed state', () => {
    it('stays armed when velocity is below threshold', () => {
      const result = nextSwingState('armed', 0.01, 100, config, counters);
      expect(result.state).toBe('armed');
      expect(result.event).toBeNull();
    });

    it('transitions to detecting when velocity exceeds threshold', () => {
      const result = nextSwingState('armed', 0.2, 100, config, counters);
      expect(result.state).toBe('detecting');
      expect(result.event).toBeNull();
      expect(result.counters.confirmationCount).toBe(1);
    });
  });

  describe('detecting state', () => {
    it('increments confirmation count while velocity stays high', () => {
      const detectingCounters = { ...counters, confirmationCount: 1 };
      const result = nextSwingState('detecting', 0.2, 200, config, detectingCounters);
      expect(result.state).toBe('detecting');
      expect(result.counters.confirmationCount).toBe(2);
    });

    it('transitions to recording and emits swingStarted after enough confirmation frames', () => {
      const detectingCounters = { ...counters, confirmationCount: config.confirmationFrames - 1 };
      const result = nextSwingState('detecting', 0.2, 300, config, detectingCounters);
      expect(result.state).toBe('recording');
      expect(result.event).toEqual({ type: 'swingStarted', timestamp: 300 });
      expect(result.counters.swingStartTimestamp).toBe(300);
    });

    it('falls back to armed when velocity drops', () => {
      const detectingCounters = { ...counters, confirmationCount: 2 };
      const result = nextSwingState('detecting', 0.01, 200, config, detectingCounters);
      expect(result.state).toBe('armed');
      expect(result.event).toBeNull();
      expect(result.counters.confirmationCount).toBe(0);
    });
  });

  describe('recording state', () => {
    const recordingCounters = { ...counters, swingStartTimestamp: 1000 };

    it('stays recording while velocity is high (resets cooldown)', () => {
      const withCooldown = { ...recordingCounters, cooldownCount: 2 };
      const result = nextSwingState('recording', 0.2, 1500, config, withCooldown);
      expect(result.state).toBe('recording');
      expect(result.counters.cooldownCount).toBe(0);
    });

    it('increments cooldown count when velocity drops', () => {
      const result = nextSwingState('recording', 0.01, 1500, config, recordingCounters);
      expect(result.state).toBe('recording');
      expect(result.counters.cooldownCount).toBe(1);
    });

    it('transitions to cooldown and emits swingEnded after enough low-velocity frames', () => {
      const almostDone = { ...recordingCounters, cooldownCount: config.cooldownFrames - 1 };
      const result = nextSwingState('recording', 0.01, 2000, config, almostDone);
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
      const result = nextSwingState('recording', 0.01, 1200, config, shortSwing);
      expect(result.state).toBe('armed');
      expect(result.event).toEqual({
        type: 'swingCancelled',
        reason: 'too_short',
      });
    });
  });

  describe('cooldown state', () => {
    it('transitions back to armed', () => {
      const result = nextSwingState('cooldown', 0.01, 3000, config, counters);
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
