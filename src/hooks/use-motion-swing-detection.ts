import { useEffect, useRef } from 'react';
import {
  nextMotionSwingState,
  DEFAULT_MOTION_SWING_CONFIG,
  INITIAL_MOTION_SWING_COUNTERS,
  motionSensitivityToThreshold,
} from '@/src/utils/motion-swing-detection';
import type {
  MotionSwingState,
  MotionSwingCounters,
  MotionSwingConfig,
} from '@/src/types/motion-detection';

export type UseMotionSwingDetectionOptions = {
  /** Whether the detection pipeline is active. */
  enabled: boolean;
  /** Latest frame diff magnitude, 0-1. From useMotionDetection. */
  motionMagnitude: number | null;
  /** Latest audio level, 0-1. From useAudioMetering. */
  audioLevel: number | null;
  /** Detection sensitivity, 0-1. Maps to swingThreshold. */
  sensitivity?: number;
  /** Config overrides. */
  config?: Partial<MotionSwingConfig>;
  /** Called when a swing is detected (burst confirmed). */
  onSwingStarted?: () => void;
  /** Called when the swing ends. */
  onSwingEnded?: (audioConfirmed: boolean) => void;
};

export type UseMotionSwingDetectionReturn = {
  /** Whether the scene is confirmed still (golfer in address-like position). */
  isStill: boolean;
  /** Current state machine state. */
  detectionState: MotionSwingState;
  /** Debug info for the overlay. */
  debugInfo: {
    motionMagnitude: number;
    audioLevel: number;
    state: MotionSwingState;
    stillFrameCount: number;
    audioConfirmed: boolean;
    swingThreshold: number;
    stillnessThreshold: number;
  };
};

/**
 * Orchestrates the motion + audio swing detection pipeline.
 *
 * Takes raw motion magnitude and audio level from their respective hooks,
 * feeds them into the pure state machine, and exposes the results.
 *
 * Import directly: `import { useMotionSwingDetection } from '@/src/hooks/use-motion-swing-detection'`
 */
export const useMotionSwingDetection = ({
  enabled,
  motionMagnitude,
  audioLevel,
  sensitivity = 0.5,
  config: configOverrides,
  onSwingStarted,
  onSwingEnded,
}: UseMotionSwingDetectionOptions): UseMotionSwingDetectionReturn => {
  const stateRef = useRef<MotionSwingState>('idle');
  const countersRef = useRef<MotionSwingCounters>(INITIAL_MOTION_SWING_COUNTERS);

  // Stable callback refs to avoid re-creating effects
  const onSwingStartedRef = useRef(onSwingStarted);
  const onSwingEndedRef = useRef(onSwingEnded);
  onSwingStartedRef.current = onSwingStarted;
  onSwingEndedRef.current = onSwingEnded;

  // Build config with sensitivity-based threshold
  const swingThreshold = motionSensitivityToThreshold(sensitivity);
  const mergedConfig: MotionSwingConfig = {
    ...DEFAULT_MOTION_SWING_CONFIG,
    swingThreshold,
    ...configOverrides,
  };
  const configRef = useRef(mergedConfig);
  configRef.current = mergedConfig;

  // Reset when disabled
  useEffect(() => {
    if (!enabled) {
      stateRef.current = 'idle';
      countersRef.current = INITIAL_MOTION_SWING_COUNTERS;
    }
  }, [enabled]);

  // Run state machine on each new input
  useEffect(() => {
    if (!enabled || motionMagnitude === null) return;

    const input = {
      motionMagnitude,
      audioLevel: audioLevel ?? 0,
      timestamp: Date.now(),
    };

    const result = nextMotionSwingState(
      stateRef.current,
      countersRef.current,
      input,
      configRef.current,
    );

    stateRef.current = result.state;
    countersRef.current = result.counters;

    // Handle events
    if (result.event) {
      switch (result.event.type) {
        case 'swingStarted':
          if (__DEV__) {
            console.log('[MotionSwing] Swing started at', result.event.timestamp);
          }
          onSwingStartedRef.current?.();
          break;
        case 'swingEnded':
          if (__DEV__) {
            console.log(
              '[MotionSwing] Swing ended:',
              result.event.durationMs, 'ms,',
              'audio:', result.event.audioConfirmed,
            );
          }
          onSwingEndedRef.current?.(result.event.audioConfirmed);
          break;
        case 'swingCancelled':
          if (__DEV__) {
            console.log('[MotionSwing] Swing cancelled:', result.event.reason);
          }
          break;
      }
    }
  }, [enabled, motionMagnitude, audioLevel]);

  const isStill = stateRef.current === 'armed' || stateRef.current === 'detecting' || stateRef.current === 'swing' || stateRef.current === 'cooldown';
  const detectionState = stateRef.current;

  const debugInfo = {
    motionMagnitude: motionMagnitude ?? 0,
    audioLevel: audioLevel ?? 0,
    state: stateRef.current,
    stillFrameCount: countersRef.current.stillFrameCount,
    audioConfirmed: countersRef.current.audioConfirmed,
    swingThreshold: mergedConfig.swingThreshold,
    stillnessThreshold: mergedConfig.stillnessThreshold,
  };

  return { isStill, detectionState, debugInfo };
};
