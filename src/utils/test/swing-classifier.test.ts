import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  classifyWindow,
  compileWeights,
  extractClassifierFeatures,
  type CompiledWeights,
} from '../swing-classifier';
import { SWING_CLASSIFIER_WEIGHTS, WEIGHTS_ARE_TRAINED } from '../swing-classifier-weights';
import {
  SWING_PHASES,
  DEFAULT_CLASSIFIER_CONFIG,
  type ClassifierOutput,
  type SwingPhase,
} from '../../types/swing-classifier';
import { nextState, type StateMachineState } from '../../hooks/use-swing-classifier';

describe('swing-classifier', () => {
  let compiled: CompiledWeights;

  beforeAll(() => {
    compiled = compileWeights(SWING_CLASSIFIER_WEIGHTS);
  });

  describe('compileWeights', () => {
    it('should produce Float32Arrays for all weight groups', () => {
      expect(compiled.conv1W).toBeInstanceOf(Float32Array);
      expect(compiled.conv1B).toBeInstanceOf(Float32Array);
      expect(compiled.bn1G).toBeInstanceOf(Float32Array);
      expect(compiled.fc1W).toBeInstanceOf(Float32Array);
      expect(compiled.fc2W).toBeInstanceOf(Float32Array);
    });

    it('should have correct weight dimensions', () => {
      // Conv1: (32, 16, 5) = 2560 weights
      expect(compiled.conv1W.length).toBe(32 * 16 * 5);
      expect(compiled.conv1B.length).toBe(32);

      // Conv2: (64, 32, 5) = 10240 weights
      expect(compiled.conv2W.length).toBe(64 * 32 * 5);
      expect(compiled.conv2B.length).toBe(64);

      // Conv3: (64, 64, 3) = 12288 weights
      expect(compiled.conv3W.length).toBe(64 * 64 * 3);
      expect(compiled.conv3B.length).toBe(64);

      // FC1: (32, 64) = 2048 weights
      expect(compiled.fc1W.length).toBe(32 * 64);
      expect(compiled.fc1B.length).toBe(32);

      // FC2: (7, 32) = 224 weights
      expect(compiled.fc2W.length).toBe(7 * 32);
      expect(compiled.fc2B.length).toBe(7);
    });

    it('should have correct batch norm dimensions', () => {
      expect(compiled.bn1G.length).toBe(32);
      expect(compiled.bn1B.length).toBe(32);
      expect(compiled.bn1M.length).toBe(32);
      expect(compiled.bn1V.length).toBe(32);

      expect(compiled.bn2G.length).toBe(64);
      expect(compiled.bn3G.length).toBe(64);
    });
  });

  describe('classifyWindow', () => {
    it('should return a valid ClassifierOutput for zeros input', () => {
      const window = new Float32Array(30 * 16); // all zeros
      const result = classifyWindow(window, compiled);

      expect(SWING_PHASES).toContain(result.phase);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.probabilities).toHaveLength(7);
    });

    it('should produce probabilities that sum to ~1', () => {
      const window = new Float32Array(30 * 16);
      // Fill with some non-zero data
      for (let i = 0; i < window.length; i++) {
        window[i] = Math.sin(i * 0.1) * 0.5;
      }

      const result = classifyWindow(window, compiled);
      const sum = result.probabilities.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 4);
    });

    it('should accept 2D array input', () => {
      const window: number[][] = [];
      for (let t = 0; t < 30; t++) {
        window.push(Array(16).fill(0));
      }

      const result = classifyWindow(window, compiled);
      expect(SWING_PHASES).toContain(result.phase);
      expect(result.probabilities).toHaveLength(7);
    });

    it('should produce consistent output for the same input', () => {
      const window = new Float32Array(30 * 16);
      for (let i = 0; i < window.length; i++) {
        window[i] = (i % 17) * 0.01;
      }

      const result1 = classifyWindow(window, compiled);
      const result2 = classifyWindow(window, compiled);

      expect(result1.phase).toBe(result2.phase);
      expect(result1.confidence).toBeCloseTo(result2.confidence, 6);
      for (let i = 0; i < 7; i++) {
        expect(result1.probabilities[i]).toBeCloseTo(result2.probabilities[i], 6);
      }
    });

    it('should handle extreme input values without NaN', () => {
      const window = new Float32Array(30 * 16);
      window.fill(100); // Large values

      const result = classifyWindow(window, compiled);
      expect(Number.isFinite(result.confidence)).toBe(true);
      for (const p of result.probabilities) {
        expect(Number.isFinite(p)).toBe(true);
      }
    });

    it('should respect custom config', () => {
      // This verifies the config is passed through (won't produce valid results
      // with mismatched config, but shouldn't crash)
      const window = new Float32Array(30 * 16);
      const result = classifyWindow(window, compiled, DEFAULT_CLASSIFIER_CONFIG);
      expect(result.probabilities).toHaveLength(DEFAULT_CLASSIFIER_CONFIG.numClasses);
    });
  });

  describe('PyTorch reference validation', () => {
    // Load reference data from the export step (PyTorch's output for a known input)
    const referenceData = JSON.parse(
      readFileSync(join(__dirname, 'swing-classifier-reference.json'), 'utf-8'),
    ) as {
      input: number[][];
      expected_logits: number[];
      expected_probs: number[];
      expected_class: number;
      phases: string[];
    };

    it('should confirm weights are trained', () => {
      expect(WEIGHTS_ARE_TRAINED).toBe(true);
    });

    it('should match PyTorch predicted class', () => {
      const result = classifyWindow(referenceData.input, compiled);
      const expectedPhase = referenceData.phases[referenceData.expected_class];
      expect(result.phase).toBe(expectedPhase);
    });

    it('should produce probabilities close to PyTorch reference', () => {
      const result = classifyWindow(referenceData.input, compiled);

      for (let i = 0; i < referenceData.expected_probs.length; i++) {
        const expected = referenceData.expected_probs[i];
        const actual = result.probabilities[i];
        // Use absolute tolerance for small values, relative for large
        if (expected > 0.01) {
          expect(actual).toBeCloseTo(expected, 2);
        } else {
          expect(actual).toBeLessThan(0.05);
        }
      }
    });
  });

  describe('extractClassifierFeatures', () => {
    it('should extract 16 features from 72-element pose data', () => {
      const poseData = new Array(72).fill(0);
      // Set left shoulder (idx 2): x=0.5, y=0.6, conf=0.9
      poseData[6] = 0.5;
      poseData[7] = 0.6;
      poseData[8] = 0.9;

      const features = extractClassifierFeatures(poseData);
      expect(features.length).toBe(16);
      // Left shoulder is classifier joint index 0
      expect(features[0]).toBeCloseTo(0.5);
      expect(features[1]).toBeCloseTo(0.6);
    });

    it('should zero out low-confidence joints', () => {
      const poseData = new Array(72).fill(0);
      // Set left shoulder with low confidence
      poseData[6] = 0.5; // x
      poseData[7] = 0.6; // y
      poseData[8] = 0.1; // conf < 0.3 threshold

      const features = extractClassifierFeatures(poseData);
      expect(features[0]).toBe(0);
      expect(features[1]).toBe(0);
    });

    it('should extract all 8 joints correctly', () => {
      const poseData = new Array(72).fill(0);
      // Set all joints with high confidence
      // Joint indices in 14-joint model: 2,3,4,5,6,7,8,9
      for (let i = 2; i <= 9; i++) {
        poseData[i * 3] = i * 0.1;     // x
        poseData[i * 3 + 1] = i * 0.1 + 0.05; // y
        poseData[i * 3 + 2] = 0.95;    // conf
      }

      const features = extractClassifierFeatures(poseData);
      expect(features.length).toBe(16);

      // Verify each joint
      for (let j = 0; j < 8; j++) {
        const jointIdx = j + 2; // Our joint index
        expect(features[j * 2]).toBeCloseTo(jointIdx * 0.1);
        expect(features[j * 2 + 1]).toBeCloseTo(jointIdx * 0.1 + 0.05);
      }
    });

    it('should handle empty/null pose data gracefully', () => {
      const features = extractClassifierFeatures([]);
      expect(features.length).toBe(16);
      // All zeros
      for (let i = 0; i < 16; i++) {
        expect(features[i]).toBe(0);
      }
    });
  });
});

// ============================================
// STATE MACHINE TESTS
// ============================================

/** Helper to create a classifier prediction. */
const makePrediction = (phase: SwingPhase, confidence = 0.9): ClassifierOutput => ({
  phase,
  confidence,
  probabilities: SWING_PHASES.map(p => p === phase ? confidence : (1 - confidence) / 6),
});

/** Helper: feed N identical predictions into the state machine. */
const feedFrames = (
  initialState: StateMachineState,
  phase: SwingPhase,
  count: number,
  confidence = 0.9,
  startTimestamp = 1000,
): { state: StateMachineState; events: Array<ReturnType<typeof nextState>['event']> } => {
  let state = initialState;
  const events: Array<ReturnType<typeof nextState>['event']> = [];
  for (let i = 0; i < count; i++) {
    const result = nextState(state, makePrediction(phase, confidence), startTimestamp + i * 100);
    state = result.state;
    events.push(result.event);
  }
  return { state, events };
};

const FRESH_STATE: StateMachineState = {
  detectionState: 'idle',
  rawPhase: 'idle',
  confirmCount: 0,
  pendingState: 'idle',
  swingStartTimestamp: null,
  idleCount: 0,
};

describe('nextState (state machine)', () => {
  it('idle → address after 10 address frames', () => {
    const { state } = feedFrames(FRESH_STATE, 'address', 9);
    expect(state.detectionState).toBe('idle');

    const { state: after10 } = feedFrames(FRESH_STATE, 'address', 10);
    expect(after10.detectionState).toBe('address');
  });

  it('address → swinging after 2 backswing frames', () => {
    const { state: inAddress } = feedFrames(FRESH_STATE, 'address', 10);
    expect(inAddress.detectionState).toBe('address');

    const { state: after1 } = feedFrames(inAddress, 'backswing', 1);
    expect(after1.detectionState).toBe('address');

    const { state: after2, events } = feedFrames(inAddress, 'backswing', 2);
    expect(after2.detectionState).toBe('swinging');
    expect(events.some(e => e?.type === 'swingStarted')).toBe(true);
  });

  it('address → swinging works for ANY swing phase, not just backswing', () => {
    const { state: inAddress } = feedFrames(FRESH_STATE, 'address', 10);

    for (const phase of ['downswing', 'impact', 'follow_through', 'finish'] as SwingPhase[]) {
      const { state } = feedFrames(inAddress, phase, 2);
      expect(state.detectionState).toBe('swinging');
    }
  });

  it('stays swinging through phase changes (backswing → downswing → impact)', () => {
    const { state: inAddress } = feedFrames(FRESH_STATE, 'address', 10);
    let { state } = feedFrames(inAddress, 'backswing', 2);
    expect(state.detectionState).toBe('swinging');

    ({ state } = feedFrames(state, 'downswing', 3));
    expect(state.detectionState).toBe('swinging');

    ({ state } = feedFrames(state, 'impact', 2));
    expect(state.detectionState).toBe('swinging');

    ({ state } = feedFrames(state, 'follow_through', 5));
    expect(state.detectionState).toBe('swinging');

    ({ state } = feedFrames(state, 'finish', 3));
    expect(state.detectionState).toBe('swinging');
  });

  it('swinging → idle after 8 consecutive idle frames (emits swingEnded)', () => {
    const { state: inAddress } = feedFrames(FRESH_STATE, 'address', 10);
    const { state: swinging } = feedFrames(inAddress, 'backswing', 2, 0.9, 1000);
    expect(swinging.detectionState).toBe('swinging');

    // 7 idle frames — still swinging
    const { state: still7 } = feedFrames(swinging, 'idle', 7, 0.9, 2000);
    expect(still7.detectionState).toBe('swinging');

    // 8 idle frames — transitions to idle with swingEnded event
    const { state: after8, events } = feedFrames(swinging, 'idle', 8, 0.9, 2000);
    expect(after8.detectionState).toBe('idle');
    const endEvent = events.find(e => e?.type === 'swingEnded');
    expect(endEvent).toBeDefined();
    if (endEvent?.type === 'swingEnded') {
      expect(endEvent.durationMs).toBeGreaterThan(0);
    }
  });

  it('mid-swing idle frames (< 8) do not reset', () => {
    const { state: inAddress } = feedFrames(FRESH_STATE, 'address', 10);
    const { state: swinging } = feedFrames(inAddress, 'backswing', 2);

    // 5 idle frames then back to swinging — should stay swinging
    let { state } = feedFrames(swinging, 'idle', 5);
    expect(state.detectionState).toBe('swinging');

    ({ state } = feedFrames(state, 'downswing', 3));
    expect(state.detectionState).toBe('swinging');
  });

  it('timeout: 10 idle frames from address resets to idle (no swingEnded)', () => {
    const { state: inAddress } = feedFrames(FRESH_STATE, 'address', 10);
    expect(inAddress.detectionState).toBe('address');

    const { state: reset, events } = feedFrames(inAddress, 'idle', 10);
    expect(reset.detectionState).toBe('idle');
    // No swingEnded event — we never started swinging
    expect(events.every(e => e === null || e.type !== 'swingEnded')).toBe(true);
  });

  it('timeout: 10 idle frames from swinging emits swingEnded', () => {
    const { state: inAddress } = feedFrames(FRESH_STATE, 'address', 10);
    const { state: swinging } = feedFrames(inAddress, 'backswing', 2, 0.9, 1000);

    const { state: reset, events } = feedFrames(swinging, 'idle', 10, 0.9, 2000);
    expect(reset.detectionState).toBe('idle');
    const endEvent = events.find(e => e?.type === 'swingEnded');
    expect(endEvent).toBeDefined();
  });

  it('low confidence (< 0.3) does not trigger transitions', () => {
    // Try to go idle → address with low confidence
    const { state } = feedFrames(FRESH_STATE, 'address', 10, 0.2);
    expect(state.detectionState).toBe('idle');
  });

  it('swingStarted event emitted on address → swinging transition', () => {
    const { state: inAddress } = feedFrames(FRESH_STATE, 'address', 10);
    const { events } = feedFrames(inAddress, 'backswing', 2, 0.9, 5000);
    const startEvent = events.find(e => e?.type === 'swingStarted');
    expect(startEvent).toBeDefined();
    if (startEvent?.type === 'swingStarted') {
      expect(startEvent.timestamp).toBeGreaterThanOrEqual(5000);
    }
  });

  it('rawPhase tracks CNN output regardless of detection state', () => {
    const result = nextState(FRESH_STATE, makePrediction('backswing'), 1000);
    // Detection state stays idle (not enough frames for address first)
    expect(result.state.detectionState).toBe('idle');
    // But rawPhase reflects the CNN output
    expect(result.state.rawPhase).toBe('backswing');
  });
});
