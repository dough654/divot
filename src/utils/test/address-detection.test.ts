import { describe, it, expect } from 'vitest';
import {
  checkAddressGeometry,
  computeBodyStillness,
  nextAddressState,
  smoothPoseFrame,
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

  it('returns false when wrist confidence is below 0.3 threshold', () => {
    const pose = makeAddressPose();
    pose.joints.leftWrist = { x: 0.48, y: 0.55, confidence: 0.29 };
    pose.joints.rightWrist = { x: 0.52, y: 0.55, confidence: 0.29 };
    expect(checkAddressGeometry(pose, config)).toBe(false);
  });

  it('passes when wrist confidence meets 0.3 threshold', () => {
    const pose = makeAddressPose();
    pose.joints.leftWrist = { x: 0.48, y: 0.55, confidence: 0.3 };
    pose.joints.rightWrist = { x: 0.52, y: 0.55, confidence: 0.3 };
    expect(checkAddressGeometry(pose, config)).toBe(true);
  });

  it('degrades gracefully when hips are not visible', () => {
    const pose = makeAddressPose();
    // Hips invisible — skip hip check, pass on wrist proximity alone
    pose.joints.leftHip = { x: 0.0, y: 0.0, confidence: 0.0 };
    pose.joints.rightHip = { x: 1.0, y: 1.0, confidence: 0.0 };
    expect(checkAddressGeometry(pose, config)).toBe(true);
  });

  it('fails when hips are visible and wrists are far above hip height', () => {
    const pose = makeAddressPose();
    // Wrists way above hips — fails the vertical check
    pose.joints.leftWrist = { x: 0.48, y: 0.1, confidence: 0.9 };
    pose.joints.rightWrist = { x: 0.52, y: 0.1, confidence: 0.9 };
    // Hips at normal height — visible
    pose.joints.leftHip = { x: 0.45, y: 0.58, confidence: 0.9 };
    pose.joints.rightHip = { x: 0.55, y: 0.58, confidence: 0.9 };
    expect(checkAddressGeometry(pose, config)).toBe(false);
  });

  it('passes when wrists are above hips but hips are invisible', () => {
    const pose = makeAddressPose();
    // Wrists way above where hips would be
    pose.joints.leftWrist = { x: 0.48, y: 0.1, confidence: 0.9 };
    pose.joints.rightWrist = { x: 0.52, y: 0.1, confidence: 0.9 };
    // Hips invisible — hip check skipped
    pose.joints.leftHip = { x: 0.45, y: 0.58, confidence: 0.1 };
    pose.joints.rightHip = { x: 0.55, y: 0.58, confidence: 0.1 };
    expect(checkAddressGeometry(pose, config)).toBe(true);
  });

  it('passes when wrists are within vertical threshold of hips', () => {
    const pose = makeAddressPose();
    // Wrists at 0.55, hips at 0.58 — delta 0.03, within 0.25 threshold
    expect(checkAddressGeometry(pose, config)).toBe(true);
  });
});

describe('computeBodyStillness', () => {
  it('returns near-zero for identical poses', () => {
    const pose = makeAddressPose(0);
    const result = computeBodyStillness(pose, pose);
    expect(result).toBe(0);
  });

  it('returns a positive value when joints move relative to torso', () => {
    const prev = makeUniformPose(0.5, 0.5, 0.9, 0);
    const curr = makeUniformPose(0.5, 0.5, 0.9, 100);
    // Move wrists relative to the torso (shoulders/hips stay put)
    curr.joints.leftWrist = { x: 0.7, y: 0.7, confidence: 0.9 };
    curr.joints.rightWrist = { x: 0.7, y: 0.7, confidence: 0.9 };
    const result = computeBodyStillness(prev, curr);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
  });

  it('returns null when fewer than 2 joints are visible', () => {
    // All joints at confidence 0.29 — below the 0.3 threshold
    const prev = makeUniformPose(0.5, 0.5, 0.29, 0);
    const curr = makeUniformPose(0.5, 0.5, 0.29, 100);
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

  it('returns higher displacement when limbs move more relative to torso', () => {
    const prev = makeUniformPose(0.5, 0.5, 0.9, 0);

    // Small wrist movement relative to torso
    const smallMove = makeUniformPose(0.5, 0.5, 0.9, 100);
    smallMove.joints.leftWrist = { x: 0.52, y: 0.52, confidence: 0.9 };
    smallMove.joints.rightWrist = { x: 0.52, y: 0.52, confidence: 0.9 };

    // Big wrist movement relative to torso
    const bigMove = makeUniformPose(0.5, 0.5, 0.9, 100);
    bigMove.joints.leftWrist = { x: 0.7, y: 0.7, confidence: 0.9 };
    bigMove.joints.rightWrist = { x: 0.7, y: 0.7, confidence: 0.9 };

    const small = computeBodyStillness(prev, smallMove)!;
    const big = computeBodyStillness(prev, bigMove)!;

    expect(big).toBeGreaterThan(small);
  });

  it('cancels uniform camera pan via torso anchor subtraction', () => {
    // All joints shift by the same amount (simulates camera pan)
    const prev = makeUniformPose(0.5, 0.5, 0.9, 0);
    const curr = makeUniformPose(0.7, 0.7, 0.9, 100);

    // The torso anchor (shoulder midpoint) shifts by 0.2 in both axes,
    // so per-joint displacement minus anchor shift = 0 for every joint.
    const result = computeBodyStillness(prev, curr);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0, 5);
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

describe('smoothPoseFrame', () => {
  it('returns raw positions on first frame (no previous)', () => {
    const pose = makeAddressPose(100);
    const result = smoothPoseFrame(pose, null);

    expect(result.timestamp).toBe(100);
    expect(result.joints.leftWrist.x).toBe(pose.joints.leftWrist.x);
    expect(result.joints.leftWrist.y).toBe(pose.joints.leftWrist.y);
    expect(result.joints.leftWrist.confidence).toBe(pose.joints.leftWrist.confidence);
  });

  it('EMA-blends positions when both frames have usable confidence', () => {
    const prev = makeUniformPose(0.5, 0.5, 0.9, 0);
    const curr = makeUniformPose(0.6, 0.6, 0.9, 100);
    const alpha = 0.4;

    const result = smoothPoseFrame(curr, prev, alpha);

    // EMA: prev + alpha * (curr - prev) = 0.5 + 0.4*(0.6-0.5) = 0.54
    expect(result.joints.nose.x).toBeCloseTo(0.54, 5);
    expect(result.joints.nose.y).toBeCloseTo(0.54, 5);
    // Confidence also blended: 0.9 + 0.4*(0.9-0.9) = 0.9
    expect(result.joints.nose.confidence).toBeCloseTo(0.9, 5);
  });

  it('carries forward previous position when current confidence is garbage', () => {
    const prev = makeUniformPose(0.5, 0.5, 0.6, 0);
    // Garbage current: confidence 0.0, position way off
    const curr = makeUniformPose(0.9, 0.9, 0.0, 100);

    const result = smoothPoseFrame(curr, prev);

    // Position should be the previous (carried forward)
    expect(result.joints.nose.x).toBe(0.5);
    expect(result.joints.nose.y).toBe(0.5);
    // Confidence decayed: 0.6 * 0.85 = 0.51
    expect(result.joints.nose.confidence).toBeCloseTo(0.51, 5);
  });

  it('decays confidence progressively over multiple garbage frames', () => {
    let smoothed = smoothPoseFrame(makeUniformPose(0.5, 0.5, 0.6, 0), null);
    const garbage = makeUniformPose(0.9, 0.9, 0.0, 100);

    // Frame 2: decay 1
    smoothed = smoothPoseFrame(garbage, smoothed);
    expect(smoothed.joints.nose.confidence).toBeCloseTo(0.6 * 0.85, 5);

    // Frame 3: decay 2
    smoothed = smoothPoseFrame(garbage, smoothed);
    expect(smoothed.joints.nose.confidence).toBeCloseTo(0.6 * 0.85 * 0.85, 5);

    // Frame 4: decay 3
    smoothed = smoothPoseFrame(garbage, smoothed);
    expect(smoothed.joints.nose.confidence).toBeCloseTo(0.6 * 0.85 ** 3, 5);

    // Position stays at the original carried-forward value
    expect(smoothed.joints.nose.x).toBe(0.5);
    expect(smoothed.joints.nose.y).toBe(0.5);
  });

  it('recovers by blending when good data returns after garbage frames', () => {
    // Start with good data
    let smoothed = smoothPoseFrame(makeUniformPose(0.5, 0.5, 0.6, 0), null);

    // Garbage frame — carry forward
    smoothed = smoothPoseFrame(makeUniformPose(0.9, 0.9, 0.0, 100), smoothed);
    expect(smoothed.joints.nose.x).toBe(0.5);

    // Good data returns at a new position
    smoothed = smoothPoseFrame(makeUniformPose(0.55, 0.55, 0.7, 200), smoothed);

    // Should EMA-blend: 0.5 + 0.4*(0.55 - 0.5) = 0.52
    expect(smoothed.joints.nose.x).toBeCloseTo(0.52, 5);
    // Confidence blended: decayed_prev + 0.4*(0.7 - decayed_prev)
    const decayedConf = 0.6 * 0.85;
    const expectedConf = decayedConf + 0.4 * (0.7 - decayedConf);
    expect(smoothed.joints.nose.confidence).toBeCloseTo(expectedConf, 5);
  });

  it('uses current raw when previous confidence is also garbage', () => {
    // Previous had garbage confidence
    const prev = makeUniformPose(0.3, 0.3, 0.02, 0);
    // Current also garbage
    const curr = makeUniformPose(0.9, 0.9, 0.0, 100);

    const result = smoothPoseFrame(curr, prev);

    // Previous conf < 0.05, so treated as no usable previous — use current raw
    expect(result.joints.nose.x).toBe(0.9);
    expect(result.joints.nose.confidence).toBe(0.0);
  });

  it('blends confidence when previous and current differ', () => {
    const prev = makeUniformPose(0.5, 0.5, 0.3, 0);
    const curr = makeUniformPose(0.5, 0.5, 0.7, 100);
    const alpha = 0.4;

    const result = smoothPoseFrame(curr, prev, alpha);

    // Confidence: 0.3 + 0.4*(0.7 - 0.3) = 0.46
    expect(result.joints.nose.confidence).toBeCloseTo(0.46, 5);
  });

  it('keeps timestamp from current frame', () => {
    const prev = makeUniformPose(0.5, 0.5, 0.9, 0);
    const curr = makeUniformPose(0.5, 0.5, 0.9, 500);

    const result = smoothPoseFrame(curr, prev);
    expect(result.timestamp).toBe(500);
  });
});
