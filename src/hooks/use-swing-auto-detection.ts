import { useRef, useCallback, useEffect, useState } from 'react';
import {
  computeWristVelocity,
  nextSwingState,
  sensitivityToThreshold,
  DEFAULT_SWING_DETECTION_CONFIG,
  INITIAL_SWING_COUNTERS,
} from '@/src/utils/swing-detection';
import type { SwingCounters } from '@/src/utils/swing-detection';
import type { PoseFrame, SwingDetectionState, SwingDetectionConfig, SwingEvent } from '@/src/types/pose';

export type UseSwingAutoDetectionOptions = {
  /** Whether auto-detection is enabled (feature flag + user setting). */
  enabled: boolean;
  /** Latest parsed pose frame from usePoseDetection. */
  latestPose: PoseFrame | null;
  /** Sensitivity from 0 (least) to 1 (most). Defaults to 0.5. */
  sensitivity?: number;
  /** Partial config overrides. */
  config?: Partial<SwingDetectionConfig>;
  /** Called when a swing is detected — triggers startRecording. */
  onSwingStarted: () => void;
  /** Called when a swing ends — triggers stopRecording. */
  onSwingEnded: () => void;
};

export type UseSwingAutoDetectionReturn = {
  /** Current state of the detection state machine. */
  detectionState: SwingDetectionState;
  /** Whether the detector is armed and watching for swings. */
  isArmed: boolean;
  /** Arm the detector (transition from idle to armed). */
  arm: () => void;
  /** Disarm the detector (transition to idle). */
  disarm: () => void;
};

/**
 * Hook that watches pose data and automatically triggers recording
 * when a golf swing is detected via wrist velocity analysis.
 *
 * Uses the pure `nextSwingState` state machine internally.
 *
 * Excluded from hooks barrel — import directly:
 * `import { useSwingAutoDetection } from '@/src/hooks/use-swing-auto-detection'`
 */
export const useSwingAutoDetection = ({
  enabled,
  latestPose,
  sensitivity = 0.5,
  config: configOverrides,
  onSwingStarted,
  onSwingEnded,
}: UseSwingAutoDetectionOptions): UseSwingAutoDetectionReturn => {
  const [detectionState, setDetectionState] = useState<SwingDetectionState>('idle');

  const stateRef = useRef<SwingDetectionState>('idle');
  const countersRef = useRef<SwingCounters>(INITIAL_SWING_COUNTERS);
  const prevPoseRef = useRef<PoseFrame | null>(null);

  // Build effective config with sensitivity-based threshold
  const effectiveConfig: SwingDetectionConfig = {
    ...DEFAULT_SWING_DETECTION_CONFIG,
    ...configOverrides,
    velocityThreshold: sensitivityToThreshold(sensitivity),
  };

  const configRef = useRef(effectiveConfig);
  configRef.current = effectiveConfig;

  const handleSwingEvent = useCallback((event: SwingEvent) => {
    switch (event.type) {
      case 'swingStarted':
        onSwingStarted();
        break;
      case 'swingEnded':
        onSwingEnded();
        break;
      case 'swingCancelled':
        onSwingEnded();
        break;
    }
  }, [onSwingStarted, onSwingEnded]);

  // Process new pose frames through the state machine
  useEffect(() => {
    if (!latestPose || stateRef.current === 'idle') return;

    const prevPose = prevPoseRef.current;
    prevPoseRef.current = latestPose;

    if (!prevPose) return;

    const velocity = computeWristVelocity(prevPose, latestPose);
    const transition = nextSwingState(
      stateRef.current,
      velocity,
      latestPose.timestamp,
      configRef.current,
      countersRef.current,
    );

    stateRef.current = transition.state;
    countersRef.current = transition.counters;
    setDetectionState(transition.state);

    if (transition.event) {
      handleSwingEvent(transition.event);
    }
  }, [latestPose, handleSwingEvent]);

  // Auto-arm when enabled, disarm when disabled
  useEffect(() => {
    if (enabled) {
      stateRef.current = 'armed';
      countersRef.current = INITIAL_SWING_COUNTERS;
      prevPoseRef.current = null;
      setDetectionState('armed');
    } else {
      stateRef.current = 'idle';
      countersRef.current = INITIAL_SWING_COUNTERS;
      prevPoseRef.current = null;
      setDetectionState('idle');
    }
  }, [enabled]);

  const arm = useCallback(() => {
    stateRef.current = 'armed';
    countersRef.current = INITIAL_SWING_COUNTERS;
    prevPoseRef.current = null;
    setDetectionState('armed');
  }, []);

  const disarm = useCallback(() => {
    stateRef.current = 'idle';
    countersRef.current = INITIAL_SWING_COUNTERS;
    prevPoseRef.current = null;
    setDetectionState('idle');
  }, []);

  return {
    detectionState,
    isArmed: detectionState !== 'idle',
    arm,
    disarm,
  };
};
