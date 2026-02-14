/**
 * Types for the frame-differencing + audio impact swing detection pipeline.
 *
 * This replaces the pose-based address/swing detection with a simpler
 * approach: detect still→burst→still motion pattern from raw pixel
 * luminance changes, confirmed by audio impact detection.
 */

/** States for the motion-based swing detection state machine. */
export type MotionSwingState =
  | 'idle'
  | 'watching'
  | 'still'
  | 'armed'
  | 'detecting'
  | 'swing'
  | 'cooldown';

/** Input fed into the state machine each tick. */
export type MotionInput = {
  /** Frame diff magnitude, 0-1. From native module. */
  motionMagnitude: number;
  /** Audio level in linear scale, 0-1. From expo-av metering. */
  audioLevel: number;
  /** Current timestamp in ms. */
  timestamp: number;
};

/** Configuration for the motion swing detection state machine. */
export type MotionSwingConfig = {
  /** Max pixel change to be considered "still". */
  stillnessThreshold: number;
  /** Consecutive still frames required before arming (~1.3s at 15Hz). */
  stillnessFrames: number;
  /** Pixel change threshold for "significant motion". */
  swingThreshold: number;
  /** Multiplier for the initial trigger burst (armed → detecting). */
  initialTriggerMultiplier: number;
  /** Sliding window size for swing confirmation. */
  swingConfirmationWindow: number;
  /** Hits needed in sliding window to confirm swing. */
  swingConfirmationHits: number;
  /** Frames of low motion to end a swing. */
  cooldownFrames: number;
  /** Minimum swing duration in ms to reject very short bursts. */
  minSwingDurationMs: number;
  /** Audio level threshold for impact confirmation (linear 0-1). */
  audioImpactThreshold: number;
  /** Time window in ms to correlate audio with swing. */
  audioWindowMs: number;
};

/** Internal counters for the state machine. */
export type MotionSwingCounters = {
  /** Consecutive frames meeting stillness threshold. */
  stillFrameCount: number;
  /** Sliding window of recent motion magnitudes. */
  recentMotionWindow: number[];
  /** Consecutive low-motion frames during swing (for cooldown). */
  cooldownCount: number;
  /** Timestamp when swing was first detected. */
  swingStartTimestamp: number | null;
  /** Whether audio impact was confirmed during this swing. */
  audioConfirmed: boolean;
};

/** Events emitted by the motion swing state machine. */
export type MotionSwingEvent =
  | { type: 'swingStarted'; timestamp: number }
  | { type: 'swingEnded'; timestamp: number; durationMs: number; audioConfirmed: boolean }
  | { type: 'swingCancelled'; reason: string };

/** Result from a single state machine tick. */
export type MotionSwingResult = {
  /** New state after this tick. */
  state: MotionSwingState;
  /** Updated counters. */
  counters: MotionSwingCounters;
  /** Event emitted this tick, if any. */
  event: MotionSwingEvent | null;
};
