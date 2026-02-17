/**
 * Hook that runs the 1D CNN swing phase classifier on a sliding window
 * of pose data and manages phase transitions via a simplified state machine.
 *
 * Consumes raw pose data from usePoseDetection, extracts features for
 * the 8 classifier joints, maintains a rolling window buffer, runs
 * inference at ~10Hz, and uses a binary swinging/not-swinging signal
 * for recording control. The raw CNN 7-phase output is still exposed
 * for debug overlay and future per-phase clip analysis.
 *
 * State machine: idle → address → swinging → idle
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
  SWING_PHASES,
  DEFAULT_CLASSIFIER_CONFIG,
  CLASSIFIER_JOINT_INDICES,
} from '@/src/types/swing-classifier';
import { computePoseDisplacement, isPoseStill } from '@/src/utils/pose-stillness';

// ============================================
// DEBUG LOGGING
// ============================================

const JOINT_LABELS = ['lShldr', 'rShldr', 'lElbow', 'rElbow', 'lWrist', 'rWrist', 'lHip', 'rHip'] as const;

/** Extracts per-joint confidence values from raw 72-element pose data for the 8 classifier joints. */
const getJointConfidences = (rawPoseData: readonly number[]): string => {
  return CLASSIFIER_JOINT_INDICES.map((jointIdx, i) => {
    const confidence = rawPoseData[jointIdx * 3 + 2];
    const label = JOINT_LABELS[i];
    const flag = confidence < 0.3 ? '!' : ' ';
    return `${label}=${confidence.toFixed(2)}${flag}`;
  }).join(' ');
};

/** Formats top-2 phase probabilities for compact logging. */
const formatTopPhases = (probabilities: readonly number[]): string => {
  const indexed = probabilities.map((p, i) => ({ phase: SWING_PHASES[i], prob: p }));
  indexed.sort((a, b) => b.prob - a.prob);
  return `${indexed[0].phase}(${(indexed[0].prob * 100).toFixed(0)}%) ${indexed[1].phase}(${(indexed[1].prob * 100).toFixed(0)}%)`;
};

// ============================================
// STATE MACHINE
// ============================================

/** Simplified detection states — binary swinging/not-swinging. */
type DetectionState = 'idle' | 'address' | 'swinging';

/** Minimum confidence to consider a classifier prediction. */
const MIN_CONFIDENCE = 0.3;

/** Frames required to confirm each transition. */
const CONFIRMATION = {
  address: 5,   // idle → address
  swinging: 2,  // address → swinging (any swing phase)
  idle: 8,      // swinging → idle (forgiving — survives mid-swing misclassifications)
  timeout: 10,  // safety reset from any non-idle state
} as const;

/** Returns true if a CNN phase represents active swinging. */
const isSwingPhase = (phase: SwingPhase): boolean =>
  phase === 'backswing' ||
  phase === 'downswing' ||
  phase === 'impact' ||
  phase === 'follow_through' ||
  phase === 'finish';

/** Maps a raw CNN phase to a simplified detection state. */
const toDetectionState = (phase: SwingPhase): DetectionState => {
  if (phase === 'address') return 'address';
  if (isSwingPhase(phase)) return 'swinging';
  return 'idle';
};

export type StateMachineState = {
  /** Current confirmed detection state. */
  detectionState: DetectionState;
  /** Latest raw CNN phase (for debug overlay). */
  rawPhase: SwingPhase;
  /** Consecutive frames confirming a pending transition. */
  confirmCount: number;
  /** The detection state we're counting toward. */
  pendingState: DetectionState;
  /** Timestamp when the swing started (address → swinging). */
  swingStartTimestamp: number | null;
  /** Consecutive idle frames for timeout reset. */
  idleCount: number;
};

const INITIAL_STATE: StateMachineState = {
  detectionState: 'idle',
  rawPhase: 'idle',
  confirmCount: 0,
  pendingState: 'idle',
  swingStartTimestamp: null,
  idleCount: 0,
};

/**
 * Pure state machine transition function.
 *
 * Collapses the CNN's 7-phase output into 3 detection states:
 *   idle → address (5 frames) → swinging (2 frames) → idle (8 frames)
 *
 * Mid-swing phase changes (backswing→downswing→impact etc.) are ignored —
 * all count as "swinging". A stray idle prediction during a swing won't
 * reset unless 8 consecutive idle frames are seen.
 */
export const nextState = (
  state: StateMachineState,
  prediction: ClassifierOutput,
  timestamp: number,
): { state: StateMachineState; event: SwingClassifierEvent | null } => {
  const next: StateMachineState = { ...state };
  next.rawPhase = prediction.phase;
  let event: SwingClassifierEvent | null = null;

  // Track consecutive idle frames for timeout
  if (prediction.phase === 'idle') {
    next.idleCount = state.idleCount + 1;
  } else {
    next.idleCount = 0;
  }

  // Timeout: 10+ consecutive idle frames hard-resets to idle
  if (next.idleCount >= CONFIRMATION.timeout && state.detectionState !== 'idle') {
    if (state.detectionState === 'swinging' && state.swingStartTimestamp) {
      event = {
        type: 'swingEnded',
        timestamp,
        durationMs: timestamp - state.swingStartTimestamp,
      };
    }
    return { state: { ...INITIAL_STATE, rawPhase: prediction.phase }, event };
  }

  // Low confidence: keep tracking idle count but don't transition
  if (prediction.confidence < MIN_CONFIDENCE) {
    return { state: next, event: null };
  }

  // Map CNN phase to detection state
  const mapped = toDetectionState(prediction.phase);

  // Track consecutive frames predicting a different detection state
  if (mapped === state.pendingState) {
    next.confirmCount = state.confirmCount + 1;
  } else {
    next.pendingState = mapped;
    next.confirmCount = 1;
  }

  // Apply transitions based on current detection state
  switch (state.detectionState) {
    case 'idle':
      if (mapped === 'address' && next.confirmCount >= CONFIRMATION.address) {
        next.detectionState = 'address';
      }
      break;

    case 'address':
      if (mapped === 'swinging' && next.confirmCount >= CONFIRMATION.swinging) {
        next.detectionState = 'swinging';
        next.swingStartTimestamp = timestamp;
        event = { type: 'swingStarted', timestamp };
      } else if (mapped === 'idle' && next.confirmCount >= CONFIRMATION.timeout) {
        next.detectionState = 'idle';
        next.swingStartTimestamp = null;
      }
      break;

    case 'swinging':
      if (mapped === 'idle' && next.confirmCount >= CONFIRMATION.idle) {
        next.detectionState = 'idle';
        if (state.swingStartTimestamp) {
          event = {
            type: 'swingEnded',
            timestamp,
            durationMs: timestamp - state.swingStartTimestamp,
          };
        }
        next.swingStartTimestamp = null;
      }
      // Stays swinging through any swing phase or address predictions
      break;
  }

  return { state: next, event };
};

// ============================================
// HOOK
// ============================================

/** Pose displacement threshold for stillness (normalized coordinates).
 *  0.02 = 2% of frame dimension — forgiving of per-frame joint jitter. */
const POSE_STILLNESS_THRESHOLD = 0.02;

/** Pose displacement threshold for definite movement (normalized coordinates).
 *  Above this = real body movement (swing, walk, fidget), hard-resets the
 *  stillness counter so the CNN can immediately classify swing phases. */
const POSE_MOVEMENT_THRESHOLD = 0.05;

/** Still-frame count required to enter address (~10Hz → ~1.5s). */
const STILLNESS_FRAMES = 15;

/** Counter penalty per non-still frame in the ambiguous zone (leaky bucket).
 *  Displacement between STILLNESS and MOVEMENT thresholds — could be jitter
 *  or minor fidgeting. Decay drains slowly to avoid false resets. */
const STILLNESS_DECAY = 3;

export type UseSwingClassifierOptions = {
  /** Whether the classifier is active. */
  enabled: boolean;
  /** Raw pose data from usePoseDetection (72-element array, 24 joints x 3). */
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
    detectionState: 'idle' | 'address' | 'swinging';
    confirmCount: number;
    pendingState: 'idle' | 'address' | 'swinging';
  };
};

/**
 * Runs the swing phase classifier on pose data and manages phase transitions.
 *
 * The hook:
 * 1. Extracts 8-joint features from 24-joint pose data
 * 2. Maintains a 30-frame sliding window
 * 3. Runs the 1D CNN forward pass when the window is full
 * 4. Applies the simplified 3-state detection machine (idle/address/swinging)
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
  const frameCountRef = useRef(0);
  const windowFilledRef = useRef(false);

  // Pose-based stillness detection — immune to background motion
  const stillCountRef = useRef(0);
  const previousPoseRef = useRef<readonly number[] | null>(null);

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
      frameCountRef.current = 0;
      windowFilledRef.current = false;
      stillCountRef.current = 0;
      previousPoseRef.current = null;
    }
  }, [enabled]);

  // Process each new pose frame
  useEffect(() => {
    if (!enabled || !rawPoseData || rawPoseData.length < 72) return;

    // Extract 8-joint features (16 values) — low-confidence joints zeroed out
    const features = extractClassifierFeatures(rawPoseData);

    // Push to sliding window
    const buffer = windowBufferRef.current;
    buffer.push(features);

    // Keep only the last 30 frames
    if (buffer.length > DEFAULT_CLASSIFIER_CONFIG.windowSize) {
      buffer.shift();
    }

    // Only classify when we have a full window
    if (buffer.length < DEFAULT_CLASSIFIER_CONFIG.windowSize) return;

    // Log once when window first fills
    if (__DEV__ && !windowFilledRef.current) {
      windowFilledRef.current = true;
      console.log('[SwingClassifier] Window buffer full (30 frames) — classifier active');
    }

    frameCountRef.current += 1;

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

    // Pose-based address detection: use joint displacement instead of frame differencing.
    // Immune to background motion (TVs, wind, other people) — only measures whether
    // the golfer's body is still. The CNN struggles with address detection from selfie
    // camera (arm occlusion), but reliably detects swing phases once motion starts.
    const prevPose = previousPoseRef.current;
    let poseDisplacement = 0;
    if (prevPose) {
      const displacementResult = computePoseDisplacement(rawPoseData, prevPose);
      poseDisplacement = displacementResult.displacement;
      if (isPoseStill(displacementResult, POSE_STILLNESS_THRESHOLD)) {
        stillCountRef.current += 1;
      } else if (displacementResult.jointCount >= 4 && poseDisplacement >= POSE_MOVEMENT_THRESHOLD) {
        // Definite movement — hard reset so CNN can classify swing phases immediately
        stillCountRef.current = 0;
      } else {
        // Ambiguous zone (jitter or insufficient joints) — leaky decay
        stillCountRef.current = Math.max(0, stillCountRef.current - STILLNESS_DECAY);
      }
    }
    previousPoseRef.current = rawPoseData;

    // When still enough AND not already swinging, feed synthetic "address" prediction
    // to the state machine. This keeps us in address (preventing CNN idle from resetting)
    // until motion starts and the CNN can detect actual swing phases.
    const isPoseBasedStill = stillCountRef.current >= STILLNESS_FRAMES;
    const currentDetection = stateRef.current.detectionState;
    const shouldForceAddress = isPoseBasedStill &&
      (currentDetection === 'idle' || currentDetection === 'address');

    const effectivePrediction = shouldForceAddress
      ? { phase: 'address' as SwingPhase, confidence: 0.9, probabilities: output.probabilities }
      : output;

    // Run state machine
    const now = Date.now();
    const prevState = stateRef.current;
    const { state: newState, event } = nextState(prevState, effectivePrediction, now);
    stateRef.current = newState;

    if (__DEV__) {
      const motionTag = shouldForceAddress ? ` [POSE→addr still=${stillCountRef.current}]` : '';

      // Log state transitions
      if (newState.detectionState !== prevState.detectionState) {
        console.log(
          `[SwingClassifier] STATE: ${prevState.detectionState} → ${newState.detectionState}` +
          ` | cnn=${output.phase} conf=${(output.confidence * 100).toFixed(0)}%` +
          ` | top: ${formatTopPhases(output.probabilities)}` +
          motionTag +
          `\n  joints: ${getJointConfidences(rawPoseData)}`,
        );
      }

      // Periodic summary every 30 frames (~3s at 10Hz)
      if (frameCountRef.current % 30 === 0) {
        console.log(
          `[SwingClassifier] tick #${frameCountRef.current}` +
          ` | state=${newState.detectionState} cnn=${output.phase} conf=${(output.confidence * 100).toFixed(0)}%` +
          ` | top: ${formatTopPhases(output.probabilities)}` +
          ` | pending=${newState.pendingState} confirm=${newState.confirmCount}` +
          ` | disp=${poseDisplacement.toFixed(4)} still=${stillCountRef.current}/${STILLNESS_FRAMES}` +
          motionTag +
          `\n  joints: ${getJointConfidences(rawPoseData)}`,
        );
      }
    }

    // Handle events
    if (event) {
      switch (event.type) {
        case 'swingStarted':
          if (__DEV__) {
            console.log(
              `[SwingClassifier] >>> SWING STARTED` +
              ` | phase=${output.phase} conf=${(output.confidence * 100).toFixed(0)}%` +
              `\n  joints: ${getJointConfidences(rawPoseData)}`,
            );
          }
          onSwingStartedRef.current?.();
          break;
        case 'swingEnded':
          if (__DEV__) {
            console.log(
              `[SwingClassifier] <<< SWING ENDED: ${event.durationMs}ms` +
              ` | phase=${output.phase} conf=${(output.confidence * 100).toFixed(0)}%`,
            );
          }
          onSwingEndedRef.current?.(event.durationMs);
          break;
      }
    }
  }, [enabled, rawPoseData, compiledWeights]);

  const currentState = stateRef.current;
  const currentOutput = classifierOutputRef.current;

  return {
    phase: currentState.rawPhase,
    isInAddress: currentState.detectionState === 'address',
    isSwinging: currentState.detectionState === 'swinging',
    isModelTrained: WEIGHTS_ARE_TRAINED,
    classifierOutput: currentOutput,
    debugInfo: {
      phase: currentState.rawPhase,
      confidence: currentOutput?.confidence ?? 0,
      probabilities: currentOutput?.probabilities ?? Array(7).fill(0),
      windowFill: windowBufferRef.current.length,
      inSwing: currentState.detectionState === 'swinging',
      detectionState: currentState.detectionState,
      confirmCount: currentState.confirmCount,
      pendingState: currentState.pendingState,
    },
  };
};
