/**
 * Pure state machine for frame-differencing + audio impact swing detection.
 *
 * States: idle → watching → still → armed → detecting → swing → cooldown → armed
 *
 * No React, no native imports — fully testable with vitest.
 */
import type {
  MotionSwingState,
  MotionSwingConfig,
  MotionSwingCounters,
  MotionInput,
  MotionSwingResult,
} from '../types/motion-detection';

/** Default config — values are initial guesses, tune on device with debug overlay. */
export const DEFAULT_MOTION_SWING_CONFIG: MotionSwingConfig = {
  stillnessThreshold: 0.01,
  stillnessFrames: 20,
  swingThreshold: 0.04,
  initialTriggerMultiplier: 1.5,
  swingConfirmationWindow: 5,
  swingConfirmationHits: 3,
  cooldownFrames: 5,
  minSwingDurationMs: 500,
  audioImpactThreshold: 0.5,
  audioWindowMs: 2000,
};

/** Initial counter state. */
export const INITIAL_MOTION_SWING_COUNTERS: MotionSwingCounters = {
  stillFrameCount: 0,
  recentMotionWindow: [],
  cooldownCount: 0,
  swingStartTimestamp: null,
  audioConfirmed: false,
};

/**
 * Maps a 0-1 sensitivity slider value to a motion threshold.
 * Higher sensitivity → lower threshold (easier to trigger).
 *
 * sensitivity 0.0 → threshold 0.08 (hard to trigger)
 * sensitivity 0.5 → threshold 0.04 (default)
 * sensitivity 1.0 → threshold 0.015 (very sensitive)
 */
export const motionSensitivityToThreshold = (sensitivity: number): number => {
  const clamped = Math.max(0, Math.min(1, sensitivity));
  const maxThreshold = 0.08;
  const minThreshold = 0.015;
  return maxThreshold - clamped * (maxThreshold - minThreshold);
};

/**
 * Pure state machine tick. Takes current state + counters + input, returns
 * new state + counters + optional event. No side effects.
 */
export const nextMotionSwingState = (
  currentState: MotionSwingState,
  counters: MotionSwingCounters,
  input: MotionInput,
  config: MotionSwingConfig = DEFAULT_MOTION_SWING_CONFIG,
): MotionSwingResult => {
  const { motionMagnitude, audioLevel, timestamp } = input;
  const isStill = motionMagnitude < config.stillnessThreshold;
  const isMotion = motionMagnitude > config.swingThreshold;
  const isBurst = motionMagnitude > config.swingThreshold * config.initialTriggerMultiplier;

  switch (currentState) {
    case 'idle': {
      return {
        state: 'watching',
        counters: { ...INITIAL_MOTION_SWING_COUNTERS },
        event: null,
      };
    }

    case 'watching': {
      if (isStill) {
        return {
          state: 'still',
          counters: { ...counters, stillFrameCount: 1, recentMotionWindow: [] },
          event: null,
        };
      }
      return { state: 'watching', counters, event: null };
    }

    case 'still': {
      if (!isStill) {
        // Motion broke the stillness streak — back to watching
        return {
          state: 'watching',
          counters: { ...counters, stillFrameCount: 0 },
          event: null,
        };
      }
      const newStillCount = counters.stillFrameCount + 1;
      if (newStillCount >= config.stillnessFrames) {
        return {
          state: 'armed',
          counters: {
            ...counters,
            stillFrameCount: newStillCount,
            recentMotionWindow: [],
            audioConfirmed: false,
          },
          event: null,
        };
      }
      return {
        state: 'still',
        counters: { ...counters, stillFrameCount: newStillCount },
        event: null,
      };
    }

    case 'armed': {
      if (isBurst) {
        return {
          state: 'detecting',
          counters: {
            ...counters,
            recentMotionWindow: [motionMagnitude],
            swingStartTimestamp: timestamp,
            cooldownCount: 0,
            audioConfirmed: false,
          },
          event: null,
        };
      }
      // If motion but not a burst, stay armed (could be noise)
      // If still, stay armed (good)
      return { state: 'armed', counters, event: null };
    }

    case 'detecting': {
      // Add to sliding window
      const updatedWindow = [...counters.recentMotionWindow, motionMagnitude];
      // Keep only the last N frames
      const trimmedWindow = updatedWindow.slice(-config.swingConfirmationWindow);
      const hits = trimmedWindow.filter((m) => m > config.swingThreshold).length;

      if (hits >= config.swingConfirmationHits) {
        // Confirmed swing
        const audioHit = audioLevel >= config.audioImpactThreshold;
        return {
          state: 'swing',
          counters: {
            ...counters,
            recentMotionWindow: trimmedWindow,
            cooldownCount: 0,
            audioConfirmed: audioHit,
          },
          event: { type: 'swingStarted', timestamp: counters.swingStartTimestamp ?? timestamp },
        };
      }

      // If the window is full and we don't have enough hits, cancel
      if (trimmedWindow.length >= config.swingConfirmationWindow && hits < config.swingConfirmationHits) {
        return {
          state: 'armed',
          counters: {
            ...counters,
            recentMotionWindow: [],
            swingStartTimestamp: null,
          },
          event: { type: 'swingCancelled', reason: 'insufficient motion hits in confirmation window' },
        };
      }

      // Still accumulating
      return {
        state: 'detecting',
        counters: { ...counters, recentMotionWindow: trimmedWindow },
        event: null,
      };
    }

    case 'swing': {
      // Check audio confirmation
      let audioConfirmed = counters.audioConfirmed;
      if (!audioConfirmed && audioLevel >= config.audioImpactThreshold) {
        audioConfirmed = true;
      }

      if (!isMotion) {
        const newCooldownCount = counters.cooldownCount + 1;
        if (newCooldownCount >= config.cooldownFrames) {
          const swingStart = counters.swingStartTimestamp ?? timestamp;
          const durationMs = timestamp - swingStart;

          // Reject very short bursts
          if (durationMs < config.minSwingDurationMs) {
            return {
              state: 'armed',
              counters: {
                ...INITIAL_MOTION_SWING_COUNTERS,
                stillFrameCount: config.stillnessFrames, // stay armed
              },
              event: { type: 'swingCancelled', reason: `too short (${durationMs}ms)` },
            };
          }

          return {
            state: 'cooldown',
            counters: {
              ...counters,
              cooldownCount: newCooldownCount,
              audioConfirmed,
            },
            event: { type: 'swingEnded', timestamp, durationMs, audioConfirmed },
          };
        }
        return {
          state: 'swing',
          counters: { ...counters, cooldownCount: newCooldownCount, audioConfirmed },
          event: null,
        };
      }

      // Still swinging — reset cooldown counter
      return {
        state: 'swing',
        counters: { ...counters, cooldownCount: 0, audioConfirmed },
        event: null,
      };
    }

    case 'cooldown': {
      // Immediately re-arm
      return {
        state: 'armed',
        counters: {
          ...INITIAL_MOTION_SWING_COUNTERS,
          stillFrameCount: config.stillnessFrames, // stay armed (already proven still)
        },
        event: null,
      };
    }

    default: {
      return { state: 'watching', counters: INITIAL_MOTION_SWING_COUNTERS, event: null };
    }
  }
};
