import { useRef, useEffect, useState } from 'react';
import {
  checkAddressGeometry,
  computeBodyStillness,
  computeAddressDebugInfo,
  nextAddressState,
  smoothPoseFrame,
  DEFAULT_ADDRESS_CONFIG,
  INITIAL_ADDRESS_COUNTERS,
  HOLD_RELAXATION,
} from '@/src/utils/address-detection';
import type { AddressCounters } from '@/src/utils/address-detection';
import type { PoseFrame, AddressDetectionState, AddressDetectionConfig } from '@/src/types/pose';

type UseAddressDetectionOptions = {
  /** Whether address detection is enabled. */
  enabled: boolean;
  /** Latest parsed pose frame from usePoseDetection. */
  latestPose: PoseFrame | null;
  /** Partial config overrides. */
  config?: Partial<AddressDetectionConfig>;
};

type UseAddressDetectionReturn = {
  /** Whether the golfer is currently in address position. */
  isInAddress: boolean;
  /** Current state of the address detection state machine. */
  addressState: AddressDetectionState;
};

/**
 * Hook that watches pose data and detects when the golfer enters the
 * address (setup) position — hands together, near hips, body still.
 *
 * Used to gate swing detection: only arm the swing detector after
 * address is confirmed, dramatically reducing false positives.
 *
 * Excluded from hooks barrel — import directly:
 * `import { useAddressDetection } from '@/src/hooks/use-address-detection'`
 */
export const useAddressDetection = ({
  enabled,
  latestPose,
  config: configOverrides,
}: UseAddressDetectionOptions): UseAddressDetectionReturn => {
  const [addressState, setAddressState] = useState<AddressDetectionState>('watching');

  const stateRef = useRef<AddressDetectionState>('watching');
  const countersRef = useRef<AddressCounters>(INITIAL_ADDRESS_COUNTERS);
  const smoothedPoseRef = useRef<PoseFrame | null>(null);

  const effectiveConfig: AddressDetectionConfig = {
    ...DEFAULT_ADDRESS_CONFIG,
    ...configOverrides,
  };
  const configRef = useRef(effectiveConfig);
  configRef.current = effectiveConfig;

  // Process new pose frames through the address state machine.
  // Raw poses are EMA-smoothed first to dampen the confidence bouncing
  // (0.0→0.6→0.0) and position jitter from Apple Vision / ML Kit.
  useEffect(() => {
    if (!enabled || !latestPose) return;

    const config = configRef.current;
    const prevSmoothed = smoothedPoseRef.current;

    // Smooth the raw pose using previous smoothed frame
    const smoothedPose = smoothPoseFrame(latestPose, prevSmoothed);
    smoothedPoseRef.current = smoothedPose;

    // Check geometry on smoothed frame (relax thresholds when already in address)
    const isHolding = stateRef.current === 'in-address';
    const geometryOk = checkAddressGeometry(smoothedPose, config, isHolding);

    // Check stillness between consecutive smoothed frames
    // Relax stillness threshold in hold mode to prevent flicker
    const stillnessThreshold = isHolding
      ? config.stillnessThreshold * HOLD_RELAXATION
      : config.stillnessThreshold;
    let isStill: boolean | null = null;
    if (prevSmoothed) {
      const displacement = computeBodyStillness(prevSmoothed, smoothedPose);
      if (displacement !== null) {
        isStill = displacement <= stillnessThreshold;
      }
    }

    const transition = nextAddressState(
      stateRef.current,
      geometryOk,
      isStill,
      countersRef.current,
      config,
    );

    if (__DEV__) {
      const prev = stateRef.current;
      const debug = computeAddressDebugInfo(smoothedPose, config);
      const displacementLabel = prevSmoothed
        ? (computeBodyStillness(prevSmoothed, smoothedPose)?.toFixed(4) ?? 'null')
        : 'no-prev';
      console.log(
        `[AddressDetect] ${prev}→${transition.state}` +
        ` | wConf=${debug.wristConfidence.left.toFixed(2)}/${debug.wristConfidence.right.toFixed(2)}` +
        ` wDist=${debug.wristDistance.toFixed(3)}/${config.wristProximityThreshold}` +
        ` | disp=${displacementLabel}/${config.stillnessThreshold}` +
        ` | geo=${geometryOk} still=${isStill}` +
        ` | confirm=${transition.counters.confirmationCount} miss=${transition.counters.missCount} exit=${transition.counters.exitCount}` +
        (transition.event ? ` | EVENT: ${transition.event.type}` : ''),
      );
    }

    stateRef.current = transition.state;
    countersRef.current = transition.counters;
    setAddressState(transition.state);
  }, [enabled, latestPose]);

  // Reset when disabled
  useEffect(() => {
    if (!enabled) {
      stateRef.current = 'watching';
      countersRef.current = INITIAL_ADDRESS_COUNTERS;
      smoothedPoseRef.current = null;
      setAddressState('watching');
    }
  }, [enabled]);

  return {
    isInAddress: addressState === 'in-address',
    addressState,
  };
};
