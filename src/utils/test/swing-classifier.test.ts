import { describe, it, expect, beforeAll } from 'vitest';
import {
  classifyWindow,
  compileWeights,
  extractClassifierFeatures,
  type CompiledWeights,
} from '../swing-classifier';
import { SWING_CLASSIFIER_WEIGHTS } from '../swing-classifier-weights';
import {
  SWING_PHASES,
  DEFAULT_CLASSIFIER_CONFIG,
} from '../../types/swing-classifier';

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

  describe('extractClassifierFeatures', () => {
    it('should extract 16 features from 42-element pose data', () => {
      const poseData = new Array(42).fill(0);
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
      const poseData = new Array(42).fill(0);
      // Set left shoulder with low confidence
      poseData[6] = 0.5; // x
      poseData[7] = 0.6; // y
      poseData[8] = 0.1; // conf < 0.3 threshold

      const features = extractClassifierFeatures(poseData);
      expect(features[0]).toBe(0);
      expect(features[1]).toBe(0);
    });

    it('should extract all 8 joints correctly', () => {
      const poseData = new Array(42).fill(0);
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
