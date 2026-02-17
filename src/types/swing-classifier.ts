import type { RotationTrackingState } from '@/src/utils/shoulder-rotation';

/** Swing phases detected by the 1D CNN classifier. */
export type SwingPhase =
  | 'idle'
  | 'address'
  | 'backswing'
  | 'downswing'
  | 'impact'
  | 'follow_through'
  | 'finish';

/** All phases in label order (matches classifier output indices). */
export const SWING_PHASES: readonly SwingPhase[] = [
  'idle',
  'address',
  'backswing',
  'downswing',
  'impact',
  'follow_through',
  'finish',
] as const;

/** Output of a single classifier inference. */
export type ClassifierOutput = {
  /** Predicted phase (argmax of probabilities). */
  phase: SwingPhase;
  /** Confidence of the predicted phase (0-1). */
  confidence: number;
  /** Per-class probabilities (7 values summing to ~1). */
  probabilities: readonly number[];
};

/** Configuration for the swing classifier forward pass. */
export type SwingClassifierConfig = {
  /** Number of frames in each input window. Default: 30. */
  windowSize: number;
  /** Number of input features per frame (8 joints x 2 coords). Default: 16. */
  numFeatures: number;
  /** Number of output classes. Default: 7. */
  numClasses: number;
};

/** Default classifier configuration. */
export const DEFAULT_CLASSIFIER_CONFIG: SwingClassifierConfig = {
  windowSize: 30,
  numFeatures: 16,
  numClasses: 7,
};

/**
 * MediaPipe landmark indices for the 8 classifier joints.
 * Shoulders, elbows, wrists, hips — skip noisy knees/ankles.
 */
export const CLASSIFIER_JOINT_MEDIAPIPE_INDICES = [
  11, // left_shoulder
  12, // right_shoulder
  13, // left_elbow
  14, // right_elbow
  15, // left_wrist
  16, // right_wrist
  23, // left_hip
  24, // right_hip
] as const;

/**
 * Our 14-joint model indices for the 8 classifier joints.
 * Maps to JOINT_NAMES in pose-normalization.ts.
 */
export const CLASSIFIER_JOINT_INDICES = [
  2,  // leftShoulder
  3,  // rightShoulder
  4,  // leftElbow
  5,  // rightElbow
  6,  // leftWrist
  7,  // rightWrist
  8,  // leftHip
  9,  // rightHip
] as const;

/** Events emitted by the swing classifier state machine. */
export type SwingClassifierEvent =
  | { type: 'swingStarted'; timestamp: number }
  | { type: 'swingEnded'; timestamp: number; durationMs: number };

/** Snapshot captured at each state machine transition for analytics. */
export type SwingAnalyticsSnapshot = {
  /** Which transition occurred. */
  transition: 'idle_to_address' | 'address_to_swinging' | 'swinging_to_idle' | 'address_to_idle';
  /** Timestamp of the transition. */
  timestamp: number;
  /** Total frames processed since classifier started. */
  frameCount: number;
  /** Rotation tracking state at the moment of transition (cloned before reset). */
  rotationState: RotationTrackingState | null;
  /** Number of consecutive still frames at transition. */
  stillnessFrameCount: number;
  /** Whether posture check passed at transition. */
  postureCheckPassed: boolean;
  /** Raw CNN phase at transition time. */
  cnnPhase: SwingPhase;
  /** Raw CNN confidence at transition time. */
  cnnConfidence: number;
  /** Duration in ms if exiting swinging state, null otherwise. */
  swingDurationMs: number | null;
  /** How the swinging state was exited. */
  swingExitReason: 'cooldown_timer' | 'timeout_reset' | null;
  /** Frames spent in the state we're leaving. */
  framesInPreviousState: number;
};

