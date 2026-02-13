import { useRef, useEffect, useState } from 'react';
import {
  checkAddressGeometry,
  computeBodyStillness,
  computeAddressDebugInfo,
  nextAddressState,
  DEFAULT_ADDRESS_CONFIG,
  INITIAL_ADDRESS_COUNTERS,
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
  const prevPoseRef = useRef<PoseFrame | null>(null);

  const effectiveConfig: AddressDetectionConfig = {
    ...DEFAULT_ADDRESS_CONFIG,
    ...configOverrides,
  };
  const configRef = useRef(effectiveConfig);
  configRef.current = effectiveConfig;

  // Process new pose frames through the address state machine
  useEffect(() => {
    if (!enabled || !latestPose) return;

    const config = configRef.current;
    const prevPose = prevPoseRef.current;
    prevPoseRef.current = latestPose;

    // Check geometry on current frame
    const geometryOk = checkAddressGeometry(latestPose, config);

    // Check stillness between consecutive frames
    let isStill: boolean | null = null;
    if (prevPose) {
      const displacement = computeBodyStillness(prevPose, latestPose);
      if (displacement !== null) {
        isStill = displacement <= config.stillnessThreshold;
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
      const debug = computeAddressDebugInfo(latestPose, config);
      const displacementLabel = prevPose
        ? (computeBodyStillness(prevPose, latestPose)?.toFixed(4) ?? 'null')
        : 'no-prev';
      console.log(
        `[AddressDetect] ${prev}→${transition.state}` +
        ` | wristDist=${debug.wristDistance.toFixed(3)}/${config.wristProximityThreshold}` +
        ` vertOff=${debug.wristHipVerticalOffset.toFixed(3)}/${config.wristHipVerticalThreshold}` +
        ` | disp=${displacementLabel}/${config.stillnessThreshold}` +
        ` | geo=${geometryOk} still=${isStill}` +
        ` | confirm=${transition.counters.confirmationCount} exit=${transition.counters.exitCount}` +
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
      prevPoseRef.current = null;
      setAddressState('watching');
    }
  }, [enabled]);

  return {
    isInAddress: addressState === 'in-address',
    addressState,
  };
};
