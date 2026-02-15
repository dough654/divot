/**
 * Hook that runs the 1D CNN swing phase classifier on a sliding window
 * of pose data and manages phase transitions via a state machine.
 *
 * Consumes raw pose data from usePoseDetection, extracts features for
 * the 8 classifier joints, maintains a rolling window buffer, runs
 * inference at ~10Hz, and enforces forward-only phase transitions
 * during an active swing.
 *
 * Import directly:
 *   import { useSwingClassifier } from '@/src/hooks/use-swing-classifier';
 */

import { useEffect, useRef, useMemo } from 'react';
import {
  classifyWindow,
  compileWeights,
  extractClassifierFeatures,
  type CompiledWeights,
} from '@/src/utils/swing-classifier';
import { SWING_CLASSIFIER_WEIGHTS, WEIGHTS_ARE_TRAINED } from '@/src/utils/swing-classifier-weights';
import type {
  SwingPhase,
  ClassifierOutput,
  SwingClassifierEvent,
} from '@/src/types/swing-classifier';
import {
  DEFAULT_CLASSIFIER_CONFIG,
  CLASSIFIER_JOINT_INDICES,
} from '@/src/types/swing-classifier';

// ============================================
// STATE MACHINE
// ============================================

/**
 * Phase transition order during an active swing.
 * Once a swing starts (backswing), transitions can only go forward.
 */
const SWING_PHASE_ORDER: readonly SwingPhase[] = [
  'backswing',
  'downswing',
  'impact',
  'follow_through',
  'finish',
];

const phaseOrderIndex = (phase: SwingPhase): number =>
  SWING_PHASE_ORDER.indexOf(phase);

/** Minimum consecutive frames predicting a phase before transitioning. */
const CONFIRMATION_FRAMES: Readonly<Record<SwingPhase, number>> = {
  idle: 10,
  address: 5,
  backswing: 1,
  downswing: 1,
  impact: 1,
  follow_through: 1,
  finish: 1,
};

/** Minimum confidence to consider a classifier prediction. */
const MIN_CONFIDENCE = 0.3;

type StateMachineState = {
  /** Current confirmed phase. */
  currentPhase: SwingPhase;
  /** Phase the classifier is predicting (may not be confirmed yet). */
  pendingPhase: SwingPhase;
  /** Consecutive frames predicting pendingPhase. */
  pendingCount: number;
  /** Whether we're in an active swing (backswing→finish). */
  inSwing: boolean;
  /** Timestamp when the swing started. */
  swingStartTimestamp: number | null;
  /** Consecutive idle frames (for timeout). */
  idleCount: number;
};

const INITIAL_STATE: StateMachineState = {
  currentPhase: 'idle',
  pendingPhase: 'idle',
  pendingCount: 0,
  inSwing: false,
  swingStartTimestamp: null,
  idleCount: 0,
};

/**
 * Pure state machine transition function.
 *
 * Rules:
 * - idle → address: classifier says address for 5+ frames
 * - address → backswing: classifier says backswing (emit swingStarted)
 * - During swing (backswing→finish): transitions only go FORWARD
 * - finish → idle: 3+ frames of idle (emit swingEnded)
 * - any → idle: 10+ frames of idle (timeout/reset)
 */
const nextState = (
  state: StateMachineState,
  prediction: ClassifierOutput,
  timestamp: number,
): { state: StateMachineState; event: SwingClassifierEvent | null } => {
  const predictedPhase = prediction.phase;
  const confidence = prediction.confidence;

  // Clone state
  const next: StateMachineState = { ...state };
  let event: SwingClassifierEvent | null = null;

  // Track idle frames for timeout
  if (predictedPhase === 'idle') {
    next.idleCount = state.idleCount + 1;
  } else {
    next.idleCount = 0;
  }

  // Timeout: 10+ consecutive idle frames resets everything
  if (next.idleCount >= 10 && state.currentPhase !== 'idle') {
    if (state.inSwing && state.swingStartTimestamp) {
      event = {
        type: 'swingEnded',
        timestamp,
        durationMs: timestamp - state.swingStartTimestamp,
      };
    }
    return {
      state: { ...INITIAL_STATE },
      event,
    };
  }

  // Low confidence: don't transition
  if (confidence < MIN_CONFIDENCE) {
    return { state: next, event: null };
  }

  // Track pending phase for confirmation
  if (predictedPhase === state.pendingPhase) {
    next.pendingCount = state.pendingCount + 1;
  } else {
    next.pendingPhase = predictedPhase;
    next.pendingCount = 1;
  }

  const required = CONFIRMATION_FRAMES[predictedPhase] ?? 1;
  const isConfirmed = next.pendingCount >= required;

  if (!isConfirmed) {
    return { state: next, event: null };
  }

  // Phase is confirmed — apply transition rules

  if (!state.inSwing) {
    // Not in swing: allow idle → address → backswing
    if (state.currentPhase === 'idle' && predictedPhase === 'address') {
      next.currentPhase = 'address';
    } else if (state.currentPhase === 'address' && predictedPhase === 'backswing') {
      next.currentPhase = 'backswing';
      next.inSwing = true;
      next.swingStartTimestamp = timestamp;
      event = { type: 'swingStarted', timestamp };
    } else if (predictedPhase === 'idle') {
      next.currentPhase = 'idle';
    }
    // Ignore other transitions outside of swing
  } else {
    // In swing: forward-only transitions
    if (predictedPhase === 'idle' || predictedPhase === 'address') {
      // Swing ending — check if we've reached finish first
      if (state.currentPhase === 'finish' && predictedPhase === 'idle' && next.pendingCount >= 3) {
        next.currentPhase = 'idle';
        next.inSwing = false;
        if (state.swingStartTimestamp) {
          event = {
            type: 'swingEnded',
            timestamp,
            durationMs: timestamp - state.swingStartTimestamp,
          };
        }
        next.swingStartTimestamp = null;
      }
      // Otherwise ignore idle/address during swing
    } else {
      // Check forward-only constraint
      const currentOrder = phaseOrderIndex(state.currentPhase);
      const predictedOrder = phaseOrderIndex(predictedPhase);

      if (predictedOrder > currentOrder) {
        next.currentPhase = predictedPhase;
      }
      // Ignore backward transitions during swing
    }
  }

  return { state: next, event };
};

// ============================================
// HOOK
// ============================================

export type UseSwingClassifierOptions = {
  /** Whether the classifier is active. */
  enabled: boolean;
  /** Raw pose data from usePoseDetection (42-element array). */
  rawPoseData: readonly number[] | null;
  /** Called when a swing is detected (backswing started). */
  onSwingStarted?: () => void;
  /** Called when the swing ends. */
  onSwingEnded?: (durationMs: number) => void;
};

export type UseSwingClassifierReturn = {
  /** Current confirmed swing phase. */
  phase: SwingPhase;
  /** Whether the golfer is in address position (pre-swing). */
  isInAddress: boolean;
  /** Whether a swing is actively in progress. */
  isSwinging: boolean;
  /** Whether the model weights are trained (vs placeholder). */
  isModelTrained: boolean;
  /** Latest classifier output (for debug overlay). */
  classifierOutput: ClassifierOutput | null;
  /** Debug info for the overlay. */
  debugInfo: {
    phase: SwingPhase;
    confidence: number;
    probabilities: readonly number[];
    windowFill: number;
    inSwing: boolean;
  };
};

/**
 * Runs the swing phase classifier on pose data and manages phase transitions.
 *
 * The hook:
 * 1. Extracts 8-joint features from 14-joint pose data
 * 2. Maintains a 30-frame sliding window
 * 3. Runs the 1D CNN forward pass when the window is full
 * 4. Applies the phase transition state machine
 * 5. Emits swingStarted/swingEnded events
 */
export const useSwingClassifier = ({
  enabled,
  rawPoseData,
  onSwingStarted,
  onSwingEnded,
}: UseSwingClassifierOptions): UseSwingClassifierReturn => {
  // Compile weights once
  const compiledWeights = useMemo<CompiledWeights>(
    () => compileWeights(SWING_CLASSIFIER_WEIGHTS),
    [],
  );

  // Sliding window buffer: 30 frames x 16 features
  const windowBufferRef = useRef<Float32Array[]>([]);
  const stateRef = useRef<StateMachineState>({ ...INITIAL_STATE });
  const classifierOutputRef = useRef<ClassifierOutput | null>(null);

  // Stable callback refs
  const onSwingStartedRef = useRef(onSwingStarted);
  const onSwingEndedRef = useRef(onSwingEnded);
  onSwingStartedRef.current = onSwingStarted;
  onSwingEndedRef.current = onSwingEnded;

  // Reset when disabled
  useEffect(() => {
    if (!enabled) {
      windowBufferRef.current = [];
      stateRef.current = { ...INITIAL_STATE };
      classifierOutputRef.current = null;
    }
  }, [enabled]);

  // Process each new pose frame
  useEffect(() => {
    if (!enabled || !rawPoseData || rawPoseData.length < 42) return;

    // Extract 8-joint features (16 values)
    const features = extractClassifierFeatures(rawPoseData, [...CLASSIFIER_JOINT_INDICES]);

    // Push to sliding window
    const buffer = windowBufferRef.current;
    buffer.push(features);

    // Keep only the last 30 frames
    if (buffer.length > DEFAULT_CLASSIFIER_CONFIG.windowSize) {
      buffer.shift();
    }

    // Only classify when we have a full window
    if (buffer.length < DEFAULT_CLASSIFIER_CONFIG.windowSize) return;

    // Flatten window: (30, 16) -> Float32Array of 480
    const windowSize = DEFAULT_CLASSIFIER_CONFIG.windowSize;
    const numFeatures = DEFAULT_CLASSIFIER_CONFIG.numFeatures;
    const flatWindow = new Float32Array(windowSize * numFeatures);
    for (let t = 0; t < windowSize; t++) {
      flatWindow.set(buffer[t], t * numFeatures);
    }

    // Run classifier
    const output = classifyWindow(flatWindow, compiledWeights);
    classifierOutputRef.current = output;

    // Run state machine
    const now = Date.now();
    const { state: newState, event } = nextState(stateRef.current, output, now);
    stateRef.current = newState;

    // Handle events
    if (event) {
      switch (event.type) {
        case 'swingStarted':
          if (__DEV__) {
            console.log('[SwingClassifier] Swing started');
          }
          onSwingStartedRef.current?.();
          break;
        case 'swingEnded':
          if (__DEV__) {
            console.log('[SwingClassifier] Swing ended:', event.durationMs, 'ms');
          }
          onSwingEndedRef.current?.(event.durationMs);
          break;
      }
    }
  }, [enabled, rawPoseData, compiledWeights]);

  const currentState = stateRef.current;
  const currentOutput = classifierOutputRef.current;

  return {
    phase: currentState.currentPhase,
    isInAddress: currentState.currentPhase === 'address',
    isSwinging: currentState.inSwing,
    isModelTrained: WEIGHTS_ARE_TRAINED,
    classifierOutput: currentOutput,
    debugInfo: {
      phase: currentState.currentPhase,
      confidence: currentOutput?.confidence ?? 0,
      probabilities: currentOutput?.probabilities ?? Array(7).fill(0),
      windowFill: windowBufferRef.current.length,
      inSwing: currentState.inSwing,
    },
  };
};
