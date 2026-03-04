import { useRef, useState, useEffect } from 'react';
import type { CameraAngle } from '@/src/types/recording';
import {
  classifyCameraAngle,
  createAngleAccumulator,
  updateAngleAccumulator,
  getDetectedAngle,
  type AngleAccumulator,
} from '@/src/utils/camera-angle-detection';

type UseCameraAngleDetectionOptions = {
  /** Whether detection is active. Resets accumulator on off→on transition. */
  enabled: boolean;
  /** Raw 72-element flat pose array from pose detection. */
  rawPoseData: readonly number[] | null;
};

type UseCameraAngleDetectionReturn = {
  /** Detected angle, or null until consensus is reached. */
  detectedAngle: CameraAngle | null;
  /** True while accumulating frames before first detection. */
  isDetecting: boolean;
};

/**
 * Auto-detects camera angle (DTL vs face-on) from pose shoulder geometry.
 * Uses a sliding window so detection can update as the user changes position
 * (e.g. walking to camera face-on, then getting into a DTL stance).
 */
export const useCameraAngleDetection = ({
  enabled,
  rawPoseData,
}: UseCameraAngleDetectionOptions): UseCameraAngleDetectionReturn => {
  const accumulatorRef = useRef<AngleAccumulator>(createAngleAccumulator());
  const [detectedAngle, setDetectedAngle] = useState<CameraAngle | null>(null);

  // Reset when enabled transitions off→on
  useEffect(() => {
    if (enabled) {
      accumulatorRef.current = createAngleAccumulator();
      setDetectedAngle(null);
    }
  }, [enabled]);

  // Process each new pose frame — no lock, detection stays live
  useEffect(() => {
    if (!enabled || rawPoseData === null) return;

    const signal = classifyCameraAngle(rawPoseData);
    accumulatorRef.current = updateAngleAccumulator(accumulatorRef.current, signal);

    const result = getDetectedAngle(accumulatorRef.current);
    if (result !== null) {
      setDetectedAngle(result);
    }
  }, [enabled, rawPoseData]);

  return {
    detectedAngle,
    isDetecting: enabled && detectedAngle === null,
  };
};
