import { describe, it, expect } from 'vitest';
import {
  computeShoulderDiff,
  startRotationTracking,
  updateRotationTracking,
  BACKSWING_ROTATION_THRESHOLD,
  FOLLOW_THROUGH_ROTATION_THRESHOLD,
  ROTATION_TIMEOUT_MS,
  type RotationTrackingState,
  type ShoulderRotationSample,
} from '../shoulder-rotation';

// ============================================
// HELPERS
// ============================================

/** Creates a 72-element pose array with all zeros. */
const emptyPose = (): number[] => new Array(72).fill(0);

/**
 * Creates a pose array with specific shoulder values.
 * Joint indices: leftShoulder=2 (offset 6), rightShoulder=3 (offset 9), stride=3.
 */
const poseWithShoulders = (
  leftX: number,
  leftConf: number,
  rightX: number,
  rightConf: number,
): number[] => {
  const pose = emptyPose();
  // leftShoulder: index 2, offset = 6
  pose[6] = leftX;
  pose[7] = 0; // y
  pose[8] = leftConf;
  // rightShoulder: index 3, offset = 9
  pose[9] = rightX;
  pose[10] = 0; // y
  pose[11] = rightConf;
  return pose;
};

/** Creates a valid shoulder sample with a specific diff. */
const validSample = (diff: number): ShoulderRotationSample => ({ diff, valid: true });

/** Creates an invalid shoulder sample. */
const invalidSample = (): ShoulderRotationSample => ({ diff: 0, valid: false });

// ============================================
// computeShoulderDiff
// ============================================

describe('computeShoulderDiff', () => {
  it('returns correct positive diff when left > right', () => {
    const pose = poseWithShoulders(0.6, 0.9, 0.4, 0.9);
    const result = computeShoulderDiff(pose);
    expect(result.diff).toBeCloseTo(0.2);
    expect(result.valid).toBe(true);
  });

  it('returns correct negative diff when left < right', () => {
    const pose = poseWithShoulders(0.3, 0.9, 0.7, 0.9);
    const result = computeShoulderDiff(pose);
    expect(result.diff).toBeCloseTo(-0.4);
    expect(result.valid).toBe(true);
  });

  it('returns near-zero diff when shoulders are stacked (address position)', () => {
    const pose = poseWithShoulders(0.50, 0.9, 0.49, 0.9);
    const result = computeShoulderDiff(pose);
    expect(result.diff).toBeCloseTo(0.01);
    expect(result.valid).toBe(true);
  });

  it('returns valid=false when left shoulder confidence is too low', () => {
    const pose = poseWithShoulders(0.5, 0.1, 0.5, 0.9);
    const result = computeShoulderDiff(pose);
    expect(result.valid).toBe(false);
  });

  it('returns valid=false when right shoulder confidence is too low', () => {
    const pose = poseWithShoulders(0.5, 0.9, 0.5, 0.2);
    const result = computeShoulderDiff(pose);
    expect(result.valid).toBe(false);
  });

  it('respects custom minConfidence threshold', () => {
    const pose = poseWithShoulders(0.5, 0.5, 0.5, 0.5);
    // Default threshold (0.3) — should be valid
    expect(computeShoulderDiff(pose).valid).toBe(true);
    // Higher threshold — should be invalid
    expect(computeShoulderDiff(pose, 0.6).valid).toBe(false);
  });
});

// ============================================
// startRotationTracking
// ============================================

describe('startRotationTracking', () => {
  it('creates state with given baseline and no detections', () => {
    const state = startRotationTracking(0.02);
    expect(state.baselineDiff).toBe(0.02);
    expect(state.backswingDetected).toBe(false);
    expect(state.backswingSign).toBe(0);
    expect(state.backswingTimestamp).toBeNull();
    expect(state.followThroughDetected).toBe(false);
    expect(state.peakTimestamp).toBeNull();
    expect(state.followThroughTimestamp).toBeNull();
  });
});

// ============================================
// updateRotationTracking
// ============================================

describe('updateRotationTracking', () => {
  const baseline = 0.01; // near-zero at address
  const baseState = startRotationTracking(baseline);
  const t0 = 1000;

  describe('Phase 1 — backswing detection', () => {
    it('does not detect backswing when delta is below threshold', () => {
      const smallDelta = baseline + BACKSWING_ROTATION_THRESHOLD * 0.5;
      const result = updateRotationTracking(baseState, validSample(smallDelta), t0);
      expect(result.state.backswingDetected).toBe(false);
      expect(result.swingConfirmed).toBe(false);
    });

    it('detects backswing when delta exceeds threshold (positive direction)', () => {
      const largeDelta = baseline + BACKSWING_ROTATION_THRESHOLD + 0.01;
      const result = updateRotationTracking(baseState, validSample(largeDelta), t0);
      expect(result.state.backswingDetected).toBe(true);
      expect(result.state.backswingSign).toBe(1);
      expect(result.state.backswingTimestamp).toBe(t0);
      expect(result.swingConfirmed).toBe(false);
    });

    it('detects backswing when delta exceeds threshold (negative direction)', () => {
      const largeDelta = baseline - BACKSWING_ROTATION_THRESHOLD - 0.01;
      const result = updateRotationTracking(baseState, validSample(largeDelta), t0);
      expect(result.state.backswingDetected).toBe(true);
      expect(result.state.backswingSign).toBe(-1);
      expect(result.state.backswingTimestamp).toBe(t0);
      expect(result.swingConfirmed).toBe(false);
    });

    it('detects backswing at exactly the threshold', () => {
      const exactDelta = baseline + BACKSWING_ROTATION_THRESHOLD;
      const result = updateRotationTracking(baseState, validSample(exactDelta), t0);
      expect(result.state.backswingDetected).toBe(true);
    });
  });

  describe('Phase 2 — follow-through detection', () => {
    // State after backswing detected in positive direction
    const afterBackswing: RotationTrackingState = {
      baselineDiff: baseline,
      backswingDetected: true,
      backswingSign: 1,
      backswingTimestamp: t0,
      followThroughDetected: false,
      peakAbsDelta: 0.12,
      peakTimestamp: t0,
      followThroughDelta: 0,
      followThroughTimestamp: null,
      takeawayTimestamp: t0 - 50,
      impactTimestamp: null,
    };

    it('does not detect follow-through when delta is on same side as backswing', () => {
      // Same positive side
      const sameSide = baseline + 0.05;
      const result = updateRotationTracking(afterBackswing, validSample(sameSide), t0 + 500);
      expect(result.state.followThroughDetected).toBe(false);
      expect(result.swingConfirmed).toBe(false);
    });

    it('does not detect follow-through when delta returns to baseline (practice backswing)', () => {
      const result = updateRotationTracking(afterBackswing, validSample(baseline), t0 + 500);
      expect(result.state.followThroughDetected).toBe(false);
      expect(result.swingConfirmed).toBe(false);
    });

    it('does not detect follow-through when opposite side delta is below threshold', () => {
      const smallOpposite = baseline - FOLLOW_THROUGH_ROTATION_THRESHOLD * 0.5;
      const result = updateRotationTracking(afterBackswing, validSample(smallOpposite), t0 + 500);
      expect(result.state.followThroughDetected).toBe(false);
      expect(result.swingConfirmed).toBe(false);
    });

    it('detects follow-through when delta crosses to opposite side above threshold', () => {
      const oppositeAbove = baseline - FOLLOW_THROUGH_ROTATION_THRESHOLD - 0.01;
      const result = updateRotationTracking(afterBackswing, validSample(oppositeAbove), t0 + 500);
      expect(result.state.followThroughDetected).toBe(true);
      expect(result.swingConfirmed).toBe(true);
    });

    it('detects follow-through for negative backswing crossing to positive', () => {
      const negBackswing: RotationTrackingState = {
        ...afterBackswing,
        backswingSign: -1,
      };
      const positiveFollow = baseline + FOLLOW_THROUGH_ROTATION_THRESHOLD + 0.01;
      const result = updateRotationTracking(negBackswing, validSample(positiveFollow), t0 + 500);
      expect(result.state.followThroughDetected).toBe(true);
      expect(result.swingConfirmed).toBe(true);
    });
  });

  describe('full swing sequences', () => {
    it('confirms a full swing: baseline → backswing → follow-through', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Frame 1: still at address
      const r1 = updateRotationTracking(state, validSample(baseline + 0.02), t);
      expect(r1.swingConfirmed).toBe(false);
      state = r1.state;
      t += 100;

      // Frame 2: backswing rotation (positive)
      const r2 = updateRotationTracking(state, validSample(baseline + 0.12), t);
      expect(r2.state.backswingDetected).toBe(true);
      expect(r2.state.backswingSign).toBe(1);
      expect(r2.swingConfirmed).toBe(false);
      state = r2.state;
      t += 100;

      // Frame 3: peak of backswing
      const r3 = updateRotationTracking(state, validSample(baseline + 0.15), t);
      expect(r3.swingConfirmed).toBe(false);
      state = r3.state;
      t += 100;

      // Frame 4: returning through zero
      const r4 = updateRotationTracking(state, validSample(baseline - 0.02), t);
      expect(r4.swingConfirmed).toBe(false);
      state = r4.state;
      t += 100;

      // Frame 5: follow-through in opposite direction
      const r5 = updateRotationTracking(state, validSample(baseline - 0.10), t);
      expect(r5.swingConfirmed).toBe(true);
      expect(r5.state.followThroughDetected).toBe(true);
    });

    it('rejects a practice backswing: baseline → deviation → return to baseline', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Backswing
      const r1 = updateRotationTracking(state, validSample(baseline + 0.12), t);
      expect(r1.state.backswingDetected).toBe(true);
      state = r1.state;
      t += 100;

      // Return to baseline (no follow-through)
      const r2 = updateRotationTracking(state, validSample(baseline + 0.03), t);
      expect(r2.swingConfirmed).toBe(false);
      state = r2.state;
      t += 100;

      // Back at baseline
      const r3 = updateRotationTracking(state, validSample(baseline), t);
      expect(r3.swingConfirmed).toBe(false);
      expect(r3.state.followThroughDetected).toBe(false);
    });
  });

  describe('timeout', () => {
    it('resets tracking after ROTATION_TIMEOUT_MS with no follow-through', () => {
      const afterBackswing: RotationTrackingState = {
        baselineDiff: baseline,
        backswingDetected: true,
        backswingSign: 1,
        backswingTimestamp: t0,
        followThroughDetected: false,
        peakAbsDelta: 0.12,
        peakTimestamp: t0,
        followThroughDelta: 0,
        followThroughTimestamp: null,
        takeawayTimestamp: t0 - 50,
        impactTimestamp: null,
      };

      const expired = t0 + ROTATION_TIMEOUT_MS;
      const result = updateRotationTracking(afterBackswing, validSample(baseline + 0.05), expired);
      expect(result.state.backswingDetected).toBe(false);
      expect(result.state.backswingTimestamp).toBeNull();
      expect(result.swingConfirmed).toBe(false);
    });

    it('does not reset before ROTATION_TIMEOUT_MS', () => {
      const afterBackswing: RotationTrackingState = {
        baselineDiff: baseline,
        backswingDetected: true,
        backswingSign: 1,
        backswingTimestamp: t0,
        followThroughDetected: false,
        peakAbsDelta: 0.12,
        peakTimestamp: t0,
        followThroughDelta: 0,
        followThroughTimestamp: null,
        takeawayTimestamp: t0 - 50,
        impactTimestamp: null,
      };

      const notExpired = t0 + ROTATION_TIMEOUT_MS - 1;
      const result = updateRotationTracking(afterBackswing, validSample(baseline + 0.05), notExpired);
      expect(result.state.backswingDetected).toBe(true);
    });
  });

  describe('invalid samples', () => {
    it('does not change state on invalid sample (no backswing yet)', () => {
      const result = updateRotationTracking(baseState, invalidSample(), t0);
      expect(result.state).toBe(baseState);
      expect(result.swingConfirmed).toBe(false);
    });

    it('does not change state on invalid sample (backswing detected)', () => {
      const afterBackswing: RotationTrackingState = {
        baselineDiff: baseline,
        backswingDetected: true,
        backswingSign: 1,
        backswingTimestamp: t0,
        followThroughDetected: false,
        peakAbsDelta: 0.12,
        peakTimestamp: t0,
        followThroughDelta: 0,
        followThroughTimestamp: null,
        takeawayTimestamp: t0 - 50,
        impactTimestamp: null,
      };
      const result = updateRotationTracking(afterBackswing, invalidSample(), t0 + 100);
      expect(result.state).toBe(afterBackswing);
      expect(result.swingConfirmed).toBe(false);
    });
  });

  describe('telemetry fields — peakAbsDelta and followThroughDelta', () => {
    it('tracks peak absolute delta across backswing frames', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Pre-backswing: below threshold, peak stays 0
      const r1 = updateRotationTracking(state, validSample(baseline + 0.03), t);
      expect(r1.state.peakAbsDelta).toBe(0);
      state = r1.state;
      t += 100;

      // Backswing detection — peak set to current absDelta
      const r2 = updateRotationTracking(state, validSample(baseline + 0.12), t);
      expect(r2.state.peakAbsDelta).toBeCloseTo(0.12);
      state = r2.state;
      t += 100;

      // Same direction, smaller delta — peak should NOT decrease
      const r3 = updateRotationTracking(state, validSample(baseline + 0.05), t);
      expect(r3.state.peakAbsDelta).toBeCloseTo(0.12);
    });

    it('captures followThroughDelta at the moment follow-through is confirmed', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Backswing
      const r1 = updateRotationTracking(state, validSample(baseline + 0.15), t);
      expect(r1.state.backswingDetected).toBe(true);
      expect(r1.state.followThroughDelta).toBe(0);
      state = r1.state;
      t += 100;

      // Follow-through confirmation at |delta| = 0.10
      const followDiff = baseline - 0.10;
      const r2 = updateRotationTracking(state, validSample(followDiff), t);
      expect(r2.swingConfirmed).toBe(true);
      expect(r2.state.followThroughDelta).toBeCloseTo(0.10);
      // peakAbsDelta should be the backswing peak (0.15 > 0.10)
      expect(r2.state.peakAbsDelta).toBeCloseTo(0.15);
    });

    it('resets both fields when tracking restarts', () => {
      const state = startRotationTracking(0.05);
      expect(state.peakAbsDelta).toBe(0);
      expect(state.followThroughDelta).toBe(0);
    });
  });

  describe('post-confirmation', () => {
    it('stays confirmed on subsequent calls', () => {
      const confirmed: RotationTrackingState = {
        baselineDiff: baseline,
        backswingDetected: true,
        backswingSign: 1,
        backswingTimestamp: t0,
        followThroughDetected: true,
        peakAbsDelta: 0.15,
        peakTimestamp: t0 + 500,
        followThroughDelta: 0.10,
        followThroughTimestamp: t0 + 800,
        takeawayTimestamp: t0 - 50,
        impactTimestamp: t0 + 700,
      };

      const r1 = updateRotationTracking(confirmed, validSample(baseline + 0.05), t0 + 100);
      expect(r1.swingConfirmed).toBe(true);

      const r2 = updateRotationTracking(confirmed, invalidSample(), t0 + 200);
      expect(r2.swingConfirmed).toBe(true);
    });
  });

  describe('tempo timestamps — peakTimestamp and followThroughTimestamp', () => {
    it('sets peakTimestamp when peakAbsDelta increases during backswing', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Pre-backswing: below threshold, peakTimestamp stays null
      const r1 = updateRotationTracking(state, validSample(baseline + 0.03), t);
      expect(r1.state.peakTimestamp).toBeNull();
      state = r1.state;
      t += 100;

      // Backswing detection — peakTimestamp set
      const r2 = updateRotationTracking(state, validSample(baseline + 0.12), t);
      expect(r2.state.peakTimestamp).toBe(t);
      state = r2.state;
      t += 100;

      // Higher peak — timestamp should update
      const r3 = updateRotationTracking(state, validSample(baseline + 0.18), t);
      expect(r3.state.peakTimestamp).toBe(t);
      state = r3.state;
      t += 100;

      // Smaller delta (still backswing direction) — timestamp should NOT change
      const r4 = updateRotationTracking(state, validSample(baseline + 0.10), t);
      expect(r4.state.peakTimestamp).toBe(t - 100); // still the previous timestamp
    });

    it('sets followThroughTimestamp when follow-through is confirmed', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Backswing
      const r1 = updateRotationTracking(state, validSample(baseline + 0.15), t);
      expect(r1.state.followThroughTimestamp).toBeNull();
      state = r1.state;
      t += 500;

      // Peak of backswing
      const r2 = updateRotationTracking(state, validSample(baseline + 0.19), t);
      expect(r2.state.followThroughTimestamp).toBeNull();
      state = r2.state;
      t += 300;

      // Follow-through confirmation
      const r3 = updateRotationTracking(state, validSample(baseline - 0.10), t);
      expect(r3.swingConfirmed).toBe(true);
      expect(r3.state.followThroughTimestamp).toBe(t);
    });

    it('carries timestamps through full backswing → follow-through sequence', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Backswing detected at t0+100
      t += 100;
      const r1 = updateRotationTracking(state, validSample(baseline + 0.12), t);
      expect(r1.state.backswingTimestamp).toBe(t);
      state = r1.state;

      // Peak at t0+400
      t += 300;
      const r2 = updateRotationTracking(state, validSample(baseline + 0.18), t);
      expect(r2.state.peakTimestamp).toBe(t);
      const peakTime = t;
      state = r2.state;

      // Returning through zero
      t += 100;
      const r3 = updateRotationTracking(state, validSample(baseline - 0.02), t);
      expect(r3.state.peakTimestamp).toBe(peakTime); // unchanged
      state = r3.state;

      // Follow-through at t0+600
      t += 100;
      const r4 = updateRotationTracking(state, validSample(baseline - 0.10), t);
      expect(r4.swingConfirmed).toBe(true);
      expect(r4.state.backswingTimestamp).toBe(t0 + 100);
      expect(r4.state.peakTimestamp).toBe(peakTime);
      expect(r4.state.followThroughTimestamp).toBe(t);
    });

    it('resets timestamps when tracking restarts', () => {
      const state = startRotationTracking(0.05);
      expect(state.peakTimestamp).toBeNull();
      expect(state.followThroughTimestamp).toBeNull();
    });

    it('does not update peakTimestamp during follow-through phase', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Backswing detected (positive direction)
      t += 100;
      const r1 = updateRotationTracking(state, validSample(baseline + 0.12), t);
      expect(r1.state.backswingDetected).toBe(true);
      state = r1.state;

      // Peak of backswing at 0.15
      t += 200;
      const r2 = updateRotationTracking(state, validSample(baseline + 0.15), t);
      const peakTime = t;
      expect(r2.state.peakAbsDelta).toBeCloseTo(0.15);
      expect(r2.state.peakTimestamp).toBe(peakTime);
      state = r2.state;

      // Returning through zero
      t += 100;
      const r3 = updateRotationTracking(state, validSample(baseline - 0.02), t);
      state = r3.state;

      // Follow-through with LARGER absDelta than backswing peak (0.20 > 0.15)
      // Peak should NOT be overwritten — it should stay at backswing value
      t += 100;
      const r4 = updateRotationTracking(state, validSample(baseline - 0.20), t);
      expect(r4.swingConfirmed).toBe(true);
      expect(r4.state.peakAbsDelta).toBeCloseTo(0.15); // backswing peak preserved
      expect(r4.state.peakTimestamp).toBe(peakTime); // backswing timestamp preserved
      expect(r4.state.followThroughDelta).toBeCloseTo(0.20);
      expect(r4.state.followThroughTimestamp).toBe(t);
    });

    it('sets takeawayTimestamp when delta first exceeds low threshold', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Very small delta (below takeaway threshold 0.03) — no takeaway
      const r1 = updateRotationTracking(state, validSample(baseline + 0.02), t);
      expect(r1.state.takeawayTimestamp).toBeNull();
      state = r1.state;
      t += 100;

      // Crosses takeaway threshold — takeaway captured
      const r2 = updateRotationTracking(state, validSample(baseline + 0.04), t);
      expect(r2.state.takeawayTimestamp).toBe(t);
      const takeawayTime = t;
      state = r2.state;
      t += 100;

      // Larger delta — takeaway should NOT update (first crossing only)
      const r3 = updateRotationTracking(state, validSample(baseline + 0.12), t);
      expect(r3.state.takeawayTimestamp).toBe(takeawayTime);
    });

    it('sets impactTimestamp when delta crosses zero after backswing', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Backswing (positive direction)
      const r1 = updateRotationTracking(state, validSample(baseline + 0.12), t);
      expect(r1.state.impactTimestamp).toBeNull();
      state = r1.state;
      t += 300;

      // Peak
      const r2 = updateRotationTracking(state, validSample(baseline + 0.18), t);
      expect(r2.state.impactTimestamp).toBeNull();
      state = r2.state;
      t += 200;

      // Still positive — not yet crossed zero
      const r3 = updateRotationTracking(state, validSample(baseline + 0.03), t);
      expect(r3.state.impactTimestamp).toBeNull();
      state = r3.state;
      t += 50;

      // Crosses zero (delta goes negative) — impact captured
      const r4 = updateRotationTracking(state, validSample(baseline - 0.01), t);
      expect(r4.state.impactTimestamp).toBe(t);
      const impactTime = t;
      state = r4.state;
      t += 50;

      // Further into follow-through — impact should NOT update (first crossing only)
      const r5 = updateRotationTracking(state, validSample(baseline - 0.10), t);
      expect(r5.state.impactTimestamp).toBe(impactTime);
    });

    it('carries takeaway and impact through full swing sequence', () => {
      let state = startRotationTracking(baseline);
      let t = t0;

      // Takeaway (low threshold crossed)
      t += 50;
      const r1 = updateRotationTracking(state, validSample(baseline + 0.04), t);
      const takeawayTime = t;
      state = r1.state;

      // Backswing detected
      t += 100;
      const r2 = updateRotationTracking(state, validSample(baseline + 0.12), t);
      state = r2.state;

      // Peak
      t += 300;
      const r3 = updateRotationTracking(state, validSample(baseline + 0.18), t);
      const peakTime = t;
      state = r3.state;

      // Impact (zero crossing)
      t += 150;
      const r4 = updateRotationTracking(state, validSample(baseline - 0.01), t);
      const impactTime = t;
      state = r4.state;

      // Follow-through confirmed
      t += 50;
      const r5 = updateRotationTracking(state, validSample(baseline - 0.10), t);
      expect(r5.swingConfirmed).toBe(true);
      expect(r5.state.takeawayTimestamp).toBe(takeawayTime);
      expect(r5.state.peakTimestamp).toBe(peakTime);
      expect(r5.state.impactTimestamp).toBe(impactTime);
    });

    it('freezes peak at backswing maximum on follow-through confirmation', () => {
      // Fast swing: backswing detection frame is also peak frame,
      // follow-through has larger absDelta
      let state = startRotationTracking(baseline);
      let t = t0;

      // Backswing detected at exactly threshold — this is also the peak so far
      t += 100;
      const r1 = updateRotationTracking(state, validSample(baseline + 0.09), t);
      expect(r1.state.backswingDetected).toBe(true);
      expect(r1.state.peakAbsDelta).toBeCloseTo(0.09);
      const backswingPeakTime = t;
      state = r1.state;

      // Immediate follow-through with larger magnitude
      t += 50;
      const r2 = updateRotationTracking(state, validSample(baseline - 0.12), t);
      expect(r2.swingConfirmed).toBe(true);
      // Peak should be the backswing value, not the follow-through value
      expect(r2.state.peakAbsDelta).toBeCloseTo(0.09);
      expect(r2.state.peakTimestamp).toBe(backswingPeakTime);
    });
  });
});
