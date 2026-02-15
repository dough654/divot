/**
 * Placeholder swing classifier weights.
 *
 * These are randomly initialized weights for development and testing.
 * Replace with real trained weights by running:
 *   cd scripts/train-swing-classifier && python export-weights.py --model ./models/best_model.pt --output ./exported
 *   cp ./exported/swing-classifier-weights.ts ../../src/utils/swing-classifier-weights.ts
 *
 * The classifier will produce random outputs with these placeholder weights.
 * This is intentional — it allows the full pipeline to be wired and tested
 * before training data is ready.
 */

/* eslint-disable */

import type { ModelWeights } from './swing-classifier';

/**
 * Whether these are real trained weights or placeholders.
 * Check this before trusting classifier output.
 */
export const WEIGHTS_ARE_TRAINED = false;

/** Placeholder model weights (randomly initialized, not trained). */
export const SWING_CLASSIFIER_WEIGHTS: ModelWeights = (() => {
  // Generate deterministic pseudo-random weights for reproducible testing.
  // Uses a simple LCG PRNG seeded to 42.
  let seed = 42;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return (seed / 0x7fffffff) * 0.2 - 0.1; // Range [-0.1, 0.1]
  };

  const fill = (n: number): number[] => Array.from({ length: n }, () => rand());
  const fill2d = (rows: number, cols: number): number[][] =>
    Array.from({ length: rows }, () => fill(cols));

  return {
    // Conv1D(16->32, kernel=5): weight (32, 16, 5), bias (32)
    conv1_weight: fill2d(32, 16 * 5),
    conv1_bias: fill(32),
    bn1_weight: Array(32).fill(1),
    bn1_bias: fill(32),
    bn1_running_mean: Array(32).fill(0),
    bn1_running_var: Array(32).fill(1),

    // Conv1D(32->64, kernel=5): weight (64, 32, 5), bias (64)
    conv2_weight: fill2d(64, 32 * 5),
    conv2_bias: fill(64),
    bn2_weight: Array(64).fill(1),
    bn2_bias: fill(64),
    bn2_running_mean: Array(64).fill(0),
    bn2_running_var: Array(64).fill(1),

    // Conv1D(64->64, kernel=3): weight (64, 64, 3), bias (64)
    conv3_weight: fill2d(64, 64 * 3),
    conv3_bias: fill(64),
    bn3_weight: Array(64).fill(1),
    bn3_bias: fill(64),
    bn3_running_mean: Array(64).fill(0),
    bn3_running_var: Array(64).fill(1),

    // Dense(64->32): weight (32, 64), bias (32)
    fc1_weight: fill2d(32, 64),
    fc1_bias: fill(32),

    // Dense(32->7): weight (7, 32), bias (7)
    fc2_weight: fill2d(7, 32),
    fc2_bias: fill(7),
  };
})();
