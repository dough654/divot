import { describe, it, expect } from 'vitest';
import {
  checkAddressGeometry,
  computeBodyStillness,
  nextAddressState,
  DEFAULT_ADDRESS_CONFIG,
  INITIAL_ADDRESS_COUNTERS,
} from '../address-detection';
import type { PoseFrame, JointName, JointPosition, AddressDetectionConfig } from '@/src/types/pose';

/** Creates a PoseFrame with all joints at the same position/confidence. */
const makeUniformPose = (x: number, y: number, confidence: number, timestamp = 0): PoseFrame => {
  const jointNames: JointName[] = [
    'nose', 'neck', 'leftShoulder', 'rightShoulder',
    'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
    'leftHip', 'rightHip', 'leftKnee', 'rightKnee',
    'leftAnkle', 'rightAnkle',
  ];

  const joints = {} as Record<JointName, JointPosition>;
  for (const name of jointNames) {
    joints[name] = { x, y, confidence };
  }

  return { timestamp, joints };
};

/** Creates a valid address pose: wrists close together, near hip level. */
const makeAddressPose = (timestamp = 0): PoseFrame => {
  const base = makeUniformPose(0.5, 0.5, 0.9, timestamp);

  // Position wrists close together, near hips
  base.joints.leftWrist = { x: 0.48, y: 0.55, confidence: 0.9 };
  base.joints.rightWrist = { x: 0.52, y: 0.55, confidence: 0.9 };
  base.joints.leftHip = { x: 0.45, y: 0.58, confidence: 0.9 };
  base.joints.rightHip = { x: 0.55, y: 0.58, confidence: 0.9 };

  return base;
};

describe('checkAddressGeometry', () => {
  const config = DEFAULT_ADDRESS_CONFIG;

  it('returns true for a valid address pose', () => {
    const pose = makeAddressPose();
    expect(checkAddressGeometry(pose, config)).toBe(true);
  });

  it('returns false when wrists are too far apart', () => {
    const pose = makeAddressPose();
    pose.joints.leftWrist = { x: 0.2, y: 0.55, confidence: 0.9 };
    pose.joints.rightWrist = { x: 0.8, y: 0.55, confidence: 0.9 };
    expect(checkAddressGeometry(pose, config)).toBe(false);
  });

  it('returns false when a wrist has very low confidence (0.05)', () => {
    const pose = makeAddressPose();
    pose.joints.leftWrist = { x: 0.48, y: 0.55, confidence: 0.05 };
    expect(checkAddressGeometry(pose, config)).toBe(false);
  });

  it('passes with low but non-zero wrist confidence (0.15)', () => {
    const pose = makeAddressPose();
    pose.joints.leftWrist = { x: 0.48, y: 0.55, confidence: 0.15 };
    pose.joints.rightWrist = { x: 0.52, y: 0.55, confidence: 0.15 };
    expect(checkAddressGeometry(pose, config)).toBe(true);
  });

  it('passes regardless of hip confidence or position', () => {
    const pose = makeAddressPose();
    // Hips at crazy positions — geometry only cares about wrists
    pose.joints.leftHip = { x: 0.0, y: 0.0, confidence: 0.0 };
    pose.joints.rightHip = { x: 1.0, y: 1.0, confidence: 0.0 };
    expect(checkAddressGeometry(pose, config)).toBe(true);
  });

  it('passes with wrists at any Y position as long as they are close', () => {
    const pose = makeAddressPose();
    // Wrists way above hips — still passes (no hip check)
    pose.joints.leftWrist = { x: 0.48, y: 0.1, confidence: 0.9 };
    pose.joints.rightWrist = { x: 0.52, y: 0.1, confidence: 0.9 };
    expect(checkAddressGeometry(pose, config)).toBe(true);
  });
});

describe('computeBodyStillness', () => {
  it('returns near-zero for identical poses', () => {
    const pose = makeAddressPose(0);
    const result = computeBodyStillness(pose, pose);
    expect(result).toBe(0);
  });

  it('returns a positive value for moved joints', () => {
    const prev = makeUniformPose(0.5, 0.5, 0.9, 0);
    const curr = makeUniformPose(0.6, 0.6, 0.9, 100);
    const result = computeBodyStillness(prev, curr);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
  });

  it('returns null when fewer than 2 joints are visible', () => {
    // All joints at confidence 0.05 — below the 0.1 threshold
    const prev = makeUniformPose(0.5, 0.5, 0.05, 0);
    const curr = makeUniformPose(0.5, 0.5, 0.05, 100);
    const result = computeBodyStillness(prev, curr);
    expect(result).toBeNull();
  });

  it('ignores low-confidence joints in both frames', () => {
    const prev = makeAddressPose(0);
    const curr = makeAddressPose(100);

    // Make nose very low confidence in current frame so it's excluded
    curr.joints.nose = { x: 0.9, y: 0.9, confidence: 0.05 };

    // Should still work (enough visible joints) but nose movement is excluded
    const result = computeBodyStillness(prev, curr);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0, 3);
  });

  it('returns higher value when body moves more', () => {
    const prev = makeUniformPose(0.5, 0.5, 0.9, 0);
    const smallMove = makeUniformPose(0.51, 0.51, 0.9, 100);
    const bigMove = makeUniformPose(0.7, 0.7, 0.9, 100);

    const small = computeBodyStillness(prev, smallMove)!;
    const big = computeBodyStillness(prev, bigMove)!;

    expect(big).toBeGreaterThan(small);
  });
});

describe('nextAddressState', () => {
  const config: AddressDetectionConfig = {
    ...DEFAULT_ADDRESS_CONFIG,
    confirmationPolls: 3, // Smaller values for easier testing
    exitPolls: 2,
  };

  it('stays in watching when criteria not met', () => {
    const result = nextAddressState('watching', false, false, INITIAL_ADDRESS_COUNTERS, config);
    expect(result.state).toBe('watching');
    expect(result.event).toBeNull();
    expect(result.counters.confirmationCount).toBe(0);
  });

  it('transitions from watching to confirming when criteria met', () => {
    const result = nextAddressState('watching', true, true, INITIAL_ADDRESS_COUNTERS, config);
    expect(result.state).toBe('confirming');
    expect(result.event).toBeNull();
    expect(result.counters.confirmationCount).toBe(1);
  });

  it('transitions from confirming to in-address after enough polls', () => {
    let counters = INITIAL_ADDRESS_COUNTERS;

    // Poll 1: watching → confirming
    const r1 = nextAddressState('watching', true, true, counters, config);
    expect(r1.state).toBe('confirming');

    // Poll 2: confirming, count=2
    const r2 = nextAddressState(r1.state, true, true, r1.counters, config);
    expect(r2.state).toBe('confirming');
    expect(r2.counters.confirmationCount).toBe(2);

    // Poll 3: confirming → in-address (3 >= confirmationPolls)
    const r3 = nextAddressState(r2.state, true, true, r2.counters, config);
    expect(r3.state).toBe('in-address');
    expect(r3.event).toEqual({ type: 'addressEntered' });
  });

  it('tolerates up to 4 missed polls during confirming', () => {
    const counters = { confirmationCount: 2, missCount: 0, exitCount: 0 };
    // Misses 1-4 — stays confirming
    let state = nextAddressState('confirming', false, true, counters, config);
    expect(state.state).toBe('confirming');
    expect(state.counters.missCount).toBe(1);

    state = nextAddressState(state.state, false, false, state.counters, config);
    expect(state.state).toBe('confirming');
    expect(state.counters.missCount).toBe(2);

    state = nextAddressState(state.state, false, false, state.counters, config);
    expect(state.state).toBe('confirming');
    expect(state.counters.missCount).toBe(3);

    state = nextAddressState(state.state, false, false, state.counters, config);
    expect(state.state).toBe('confirming');
    expect(state.counters.missCount).toBe(4);

    // 5th miss — resets to watching
    state = nextAddressState(state.state, false, false, state.counters, config);
    expect(state.state).toBe('watching');
    expect(state.counters.confirmationCount).toBe(0);
  });

  it('resets miss counter on good poll during confirming', () => {
    const counters = { confirmationCount: 2, missCount: 1, exitCount: 0 };
    const result = nextAddressState('confirming', true, true, counters, config);
    expect(result.state).toBe('in-address'); // 3rd good poll hits threshold
    expect(result.counters.missCount).toBe(0);
  });

  it('stays in-address when criteria remain met', () => {
    const result = nextAddressState('in-address', true, true, INITIAL_ADDRESS_COUNTERS, config);
    expect(result.state).toBe('in-address');
    expect(result.event).toBeNull();
    expect(result.counters.exitCount).toBe(0);
  });

  it('increments exit counter when criteria break in in-address', () => {
    const result = nextAddressState('in-address', false, false, INITIAL_ADDRESS_COUNTERS, config);
    expect(result.state).toBe('in-address');
    expect(result.counters.exitCount).toBe(1);
  });

  it('exits address after enough broken polls', () => {
    const counters = { confirmationCount: 0, missCount: 0, exitCount: 1 };
    const result = nextAddressState('in-address', false, false, counters, config);
    expect(result.state).toBe('watching');
    expect(result.event).toEqual({ type: 'addressExited' });
  });

  it('resets exit counter when criteria are met again in in-address', () => {
    const counters = { confirmationCount: 0, missCount: 0, exitCount: 1 };
    const result = nextAddressState('in-address', true, true, counters, config);
    expect(result.state).toBe('in-address');
    expect(result.counters.exitCount).toBe(0);
  });

  it('treats null stillness as criteria not met', () => {
    const result = nextAddressState('watching', true, null, INITIAL_ADDRESS_COUNTERS, config);
    expect(result.state).toBe('watching');
    expect(result.counters.confirmationCount).toBe(0);
  });

  it('full cycle: watching → confirming → in-address → watching', () => {
    let state = nextAddressState('watching', true, true, INITIAL_ADDRESS_COUNTERS, config);
    state = nextAddressState(state.state, true, true, state.counters, config);
    state = nextAddressState(state.state, true, true, state.counters, config);
    expect(state.state).toBe('in-address');
    expect(state.event?.type).toBe('addressEntered');

    // Break criteria
    state = nextAddressState(state.state, false, false, state.counters, config);
    expect(state.state).toBe('in-address'); // Not yet exited
    state = nextAddressState(state.state, false, false, state.counters, config);
    expect(state.state).toBe('watching');
    expect(state.event?.type).toBe('addressExited');
  });
});
