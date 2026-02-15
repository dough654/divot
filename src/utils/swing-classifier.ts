/**
 * Pure 1D CNN forward pass for swing phase classification.
 *
 * Implements the same architecture as the PyTorch training model:
 *   Conv1D(16->32, k=5) + ReLU + BatchNorm
 *   Conv1D(32->64, k=5) + ReLU + BatchNorm
 *   Conv1D(64->64, k=3) + ReLU + BatchNorm
 *   GlobalAveragePooling1D
 *   Dense(64->32) + ReLU + Dropout(0.3) [dropout disabled at inference]
 *   Dense(32->7) + Softmax
 *
 * All operations use Float32Array for performance. No external ML runtime needed.
 * ~16K params, <0.5ms inference on modern mobile devices.
 *
 * @module
 */

import type {
  ClassifierOutput,
  SwingClassifierConfig,
  SwingPhase,
} from '@/src/types/swing-classifier';
import {
  SWING_PHASES,
  DEFAULT_CLASSIFIER_CONFIG,
} from '@/src/types/swing-classifier';

// ============================================
// WEIGHT TYPES
// ============================================

/** Model weights loaded from the exported weights file. */
export type ModelWeights = {
  // Conv1D layers: weight shape (out_channels, in_channels, kernel_size)
  readonly conv1_weight: readonly number[][];
  readonly conv1_bias: readonly number[];
  readonly bn1_weight: readonly number[];
  readonly bn1_bias: readonly number[];
  readonly bn1_running_mean: readonly number[];
  readonly bn1_running_var: readonly number[];

  readonly conv2_weight: readonly number[][];
  readonly conv2_bias: readonly number[];
  readonly bn2_weight: readonly number[];
  readonly bn2_bias: readonly number[];
  readonly bn2_running_mean: readonly number[];
  readonly bn2_running_var: readonly number[];

  readonly conv3_weight: readonly number[][];
  readonly conv3_bias: readonly number[];
  readonly bn3_weight: readonly number[];
  readonly bn3_bias: readonly number[];
  readonly bn3_running_mean: readonly number[];
  readonly bn3_running_var: readonly number[];

  // Dense layers
  readonly fc1_weight: readonly number[][];
  readonly fc1_bias: readonly number[];
  readonly fc2_weight: readonly number[][];
  readonly fc2_bias: readonly number[];
};

// ============================================
// LOW-LEVEL OPS
// ============================================

const BN_EPSILON = 1e-5;

/**
 * 1D convolution with same-padding.
 *
 * @param input - Shape: (channels, length)
 * @param weight - Shape: (out_channels, in_channels, kernel_size), flattened row-major
 * @param bias - Shape: (out_channels,)
 * @param outChannels - Number of output channels
 * @param inChannels - Number of input channels
 * @param kernelSize - Convolution kernel size
 * @returns Shape: (out_channels, length)
 */
const conv1d = (
  input: Float32Array,
  weight: Float32Array,
  bias: Float32Array,
  outChannels: number,
  inChannels: number,
  kernelSize: number,
  length: number,
): Float32Array => {
  const padding = Math.floor(kernelSize / 2);
  const output = new Float32Array(outChannels * length);

  for (let oc = 0; oc < outChannels; oc++) {
    for (let t = 0; t < length; t++) {
      let sum = bias[oc];
      for (let ic = 0; ic < inChannels; ic++) {
        for (let k = 0; k < kernelSize; k++) {
          const inputIdx = t + k - padding;
          if (inputIdx >= 0 && inputIdx < length) {
            // weight layout: [oc][ic][k] row-major
            const weightIdx = oc * inChannels * kernelSize + ic * kernelSize + k;
            sum += weight[weightIdx] * input[ic * length + inputIdx];
          }
        }
      }
      output[oc * length + t] = sum;
    }
  }

  return output;
};

/**
 * Batch normalization (inference mode — uses running stats).
 *
 * @param input - Shape: (channels, length)
 * @param gamma - BN weight, shape: (channels,)
 * @param beta - BN bias, shape: (channels,)
 * @param runningMean - Shape: (channels,)
 * @param runningVar - Shape: (channels,)
 * @param channels - Number of channels
 * @param length - Sequence length
 */
const batchNorm1d = (
  input: Float32Array,
  gamma: Float32Array,
  beta: Float32Array,
  runningMean: Float32Array,
  runningVar: Float32Array,
  channels: number,
  length: number,
): void => {
  // In-place for efficiency
  for (let c = 0; c < channels; c++) {
    const mean = runningMean[c];
    const invStd = 1.0 / Math.sqrt(runningVar[c] + BN_EPSILON);
    const scale = gamma[c] * invStd;
    const shift = beta[c] - mean * scale;

    const offset = c * length;
    for (let t = 0; t < length; t++) {
      input[offset + t] = input[offset + t] * scale + shift;
    }
  }
};

/** ReLU activation, in-place. */
const relu = (data: Float32Array): void => {
  for (let i = 0; i < data.length; i++) {
    if (data[i] < 0) data[i] = 0;
  }
};

/**
 * Global average pooling over the time dimension.
 *
 * @param input - Shape: (channels, length)
 * @param channels - Number of channels
 * @param length - Sequence length
 * @returns Shape: (channels,)
 */
const globalAvgPool1d = (
  input: Float32Array,
  channels: number,
  length: number,
): Float32Array => {
  const output = new Float32Array(channels);
  for (let c = 0; c < channels; c++) {
    let sum = 0;
    const offset = c * length;
    for (let t = 0; t < length; t++) {
      sum += input[offset + t];
    }
    output[c] = sum / length;
  }
  return output;
};

/**
 * Dense (fully connected) layer.
 *
 * @param input - Shape: (inFeatures,)
 * @param weight - Shape: (outFeatures, inFeatures), row-major
 * @param bias - Shape: (outFeatures,)
 * @param outFeatures - Number of output features
 * @param inFeatures - Number of input features
 * @returns Shape: (outFeatures,)
 */
const dense = (
  input: Float32Array,
  weight: Float32Array,
  bias: Float32Array,
  outFeatures: number,
  inFeatures: number,
): Float32Array => {
  const output = new Float32Array(outFeatures);
  for (let o = 0; o < outFeatures; o++) {
    let sum = bias[o];
    const weightOffset = o * inFeatures;
    for (let i = 0; i < inFeatures; i++) {
      sum += weight[weightOffset + i] * input[i];
    }
    output[o] = sum;
  }
  return output;
};

/** Softmax activation. Returns a new array. */
const softmax = (logits: Float32Array): Float32Array => {
  const maxVal = logits.reduce((a, b) => Math.max(a, b), -Infinity);
  const exps = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    exps[i] = Math.exp(logits[i] - maxVal);
    sum += exps[i];
  }
  for (let i = 0; i < logits.length; i++) {
    exps[i] /= sum;
  }
  return exps;
};

// ============================================
// WEIGHT FLATTENING
// ============================================

/** Flatten a nested number array to Float32Array (row-major). */
const flattenWeights = (nested: readonly number[] | readonly number[][]): Float32Array => {
  if (nested.length === 0) return new Float32Array(0);

  // 1D array
  if (typeof nested[0] === 'number') {
    return new Float32Array(nested as readonly number[]);
  }

  // 2D+ array — flatten recursively
  const flat: number[] = [];
  const stack: unknown[] = [nested];
  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      // Push in reverse order so we process left-to-right
      for (let i = item.length - 1; i >= 0; i--) {
        stack.push(item[i]);
      }
    } else {
      flat.push(item as number);
    }
  }
  return new Float32Array(flat);
};

// ============================================
// COMPILED MODEL
// ============================================

/** Pre-flattened weights for efficient inference. */
export type CompiledWeights = {
  conv1W: Float32Array; conv1B: Float32Array;
  bn1G: Float32Array; bn1B: Float32Array; bn1M: Float32Array; bn1V: Float32Array;
  conv2W: Float32Array; conv2B: Float32Array;
  bn2G: Float32Array; bn2B: Float32Array; bn2M: Float32Array; bn2V: Float32Array;
  conv3W: Float32Array; conv3B: Float32Array;
  bn3G: Float32Array; bn3B: Float32Array; bn3M: Float32Array; bn3V: Float32Array;
  fc1W: Float32Array; fc1B: Float32Array;
  fc2W: Float32Array; fc2B: Float32Array;
};

/**
 * Pre-flatten weights from the exported format into Float32Arrays.
 * Call once at startup, then pass the result to `classifyWindow`.
 */
export const compileWeights = (raw: ModelWeights): CompiledWeights => ({
  conv1W: flattenWeights(raw.conv1_weight), conv1B: flattenWeights(raw.conv1_bias),
  bn1G: flattenWeights(raw.bn1_weight), bn1B: flattenWeights(raw.bn1_bias),
  bn1M: flattenWeights(raw.bn1_running_mean), bn1V: flattenWeights(raw.bn1_running_var),
  conv2W: flattenWeights(raw.conv2_weight), conv2B: flattenWeights(raw.conv2_bias),
  bn2G: flattenWeights(raw.bn2_weight), bn2B: flattenWeights(raw.bn2_bias),
  bn2M: flattenWeights(raw.bn2_running_mean), bn2V: flattenWeights(raw.bn2_running_var),
  conv3W: flattenWeights(raw.conv3_weight), conv3B: flattenWeights(raw.conv3_bias),
  bn3G: flattenWeights(raw.bn3_weight), bn3B: flattenWeights(raw.bn3_bias),
  bn3M: flattenWeights(raw.bn3_running_mean), bn3V: flattenWeights(raw.bn3_running_var),
  fc1W: flattenWeights(raw.fc1_weight), fc1B: flattenWeights(raw.fc1_bias),
  fc2W: flattenWeights(raw.fc2_weight), fc2B: flattenWeights(raw.fc2_bias),
});

// ============================================
// FORWARD PASS
// ============================================

/**
 * Run the 1D CNN classifier on a single window of joint data.
 *
 * @param window - Input window, shape (windowSize, numFeatures) as a flat Float32Array
 *                 or 2D array. Row-major: [frame0_feat0, frame0_feat1, ..., frame1_feat0, ...]
 * @param weights - Pre-compiled model weights from `compileWeights()`
 * @param config - Classifier config (window size, feature count, class count)
 * @returns Classification result with phase, confidence, and probabilities
 */
export const classifyWindow = (
  window: Float32Array | readonly number[][],
  weights: CompiledWeights,
  config: SwingClassifierConfig = DEFAULT_CLASSIFIER_CONFIG,
): ClassifierOutput => {
  const { windowSize, numFeatures, numClasses } = config;

  // Convert 2D array to flat Float32Array if needed
  let flat: Float32Array;
  if (window instanceof Float32Array) {
    flat = window;
  } else {
    flat = new Float32Array(windowSize * numFeatures);
    for (let t = 0; t < windowSize; t++) {
      for (let f = 0; f < numFeatures; f++) {
        flat[t * numFeatures + f] = window[t][f];
      }
    }
  }

  // Transpose (seq_len, features) -> (features, seq_len) for Conv1D
  const transposed = new Float32Array(numFeatures * windowSize);
  for (let f = 0; f < numFeatures; f++) {
    for (let t = 0; t < windowSize; t++) {
      transposed[f * windowSize + t] = flat[t * numFeatures + f];
    }
  }

  // Conv1 + BN1 + ReLU: (16, 30) -> (32, 30)
  let x = conv1d(transposed, weights.conv1W, weights.conv1B, 32, numFeatures, 5, windowSize);
  batchNorm1d(x, weights.bn1G, weights.bn1B, weights.bn1M, weights.bn1V, 32, windowSize);
  relu(x);

  // Conv2 + BN2 + ReLU: (32, 30) -> (64, 30)
  x = conv1d(x, weights.conv2W, weights.conv2B, 64, 32, 5, windowSize);
  batchNorm1d(x, weights.bn2G, weights.bn2B, weights.bn2M, weights.bn2V, 64, windowSize);
  relu(x);

  // Conv3 + BN3 + ReLU: (64, 30) -> (64, 30)
  x = conv1d(x, weights.conv3W, weights.conv3B, 64, 64, 3, windowSize);
  batchNorm1d(x, weights.bn3G, weights.bn3B, weights.bn3M, weights.bn3V, 64, windowSize);
  relu(x);

  // Global average pooling: (64, 30) -> (64,)
  let pooled = globalAvgPool1d(x, 64, windowSize);

  // FC1 + ReLU: (64,) -> (32,)
  let fc1Out = dense(pooled, weights.fc1W, weights.fc1B, 32, 64);
  relu(fc1Out);
  // Dropout is skipped at inference

  // FC2: (32,) -> (7,)
  const logits = dense(fc1Out, weights.fc2W, weights.fc2B, numClasses, 32);

  // Softmax
  const probs = softmax(logits);

  // Find argmax
  let maxIdx = 0;
  let maxProb = probs[0];
  for (let i = 1; i < numClasses; i++) {
    if (probs[i] > maxProb) {
      maxProb = probs[i];
      maxIdx = i;
    }
  }

  return {
    phase: SWING_PHASES[maxIdx] as SwingPhase,
    confidence: maxProb,
    probabilities: Array.from(probs),
  };
};

/**
 * Extract classifier input features from a 14-joint pose frame.
 *
 * Takes the raw 42-element pose array (14 joints x [x, y, confidence])
 * and extracts x,y for the 8 classifier joints (shoulders, elbows, wrists, hips).
 *
 * @param poseData - Raw pose data, 42 doubles from native module
 * @param classifierJointIndices - Indices into the 14-joint array for the 8 classifier joints
 * @returns 16-element array [joint0_x, joint0_y, joint1_x, joint1_y, ...]
 */
export const extractClassifierFeatures = (
  poseData: readonly number[],
  classifierJointIndices: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9],
): Float32Array => {
  const features = new Float32Array(classifierJointIndices.length * 2);

  for (let i = 0; i < classifierJointIndices.length; i++) {
    const jointIdx = classifierJointIndices[i];
    const poseOffset = jointIdx * 3;
    const confidence = poseData[poseOffset + 2] ?? 0;

    if (confidence >= 0.3) {
      features[i * 2] = poseData[poseOffset] ?? 0;
      features[i * 2 + 1] = poseData[poseOffset + 1] ?? 0;
    }
    // Low confidence: leave as 0 (same as training preprocessing)
  }

  return features;
};
