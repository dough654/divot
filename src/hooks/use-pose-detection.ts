import { useState, useEffect, useRef } from 'react';
import { parsePoseArray, POSE_ARRAY_LENGTH } from '@/src/utils/pose-normalization';
import { VisionCameraPoseDetectionModule } from '../../modules/vision-camera-pose-detection/src';
import type { PoseFrame } from '@/src/types/pose';

export type UsePoseDetectionOptions = {
  /** Whether pose detection polling is active. */
  enabled: boolean;
  /** Polling rate in fps. Defaults to 10. */
  pollingFps?: number;
};

export type UsePoseDetectionReturn = {
  /** Parsed pose frame for JS consumers (swing detection). */
  latestPose: PoseFrame | null;
  /** Raw 42-element pose array for overlay rendering. */
  rawPoseData: number[] | null;
};

/**
 * Hook that polls the native pose detection module for the latest results.
 *
 * The native frame processor plugin stores its detection results in a
 * thread-safe static variable. This hook reads that variable via a
 * synchronous Expo module function at the configured polling rate.
 *
 * This approach bypasses the broken `runOnJS` serialization in
 * VisionCamera's frame processor context (missing `_createSerializableNumber`
 * globals in the legacy react-native-worklets serialization path).
 *
 * Import directly: `import { usePoseDetection } from '@/src/hooks/use-pose-detection'`
 */
export const usePoseDetection = ({
  enabled,
  pollingFps = 10,
}: UsePoseDetectionOptions): UsePoseDetectionReturn => {
  const [latestPose, setLatestPose] = useState<PoseFrame | null>(null);
  const [rawPoseData, setRawPoseData] = useState<number[] | null>(null);

  // Track previous raw data to avoid unnecessary state updates
  const prevDataRef = useRef<number[] | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRawPoseData(null);
      setLatestPose(null);
      prevDataRef.current = null;
      return;
    }

    const interval = setInterval(() => {
      try {
        const data = VisionCameraPoseDetectionModule.getLatestPose();

        if (!data || data.length !== POSE_ARRAY_LENGTH) {
          if (prevDataRef.current !== null) {
            prevDataRef.current = null;
            setRawPoseData(null);
            setLatestPose(null);
          }
          return;
        }

        // Skip update if data hasn't changed (same reference from native)
        const prev = prevDataRef.current;
        if (prev && prev.length === data.length && prev[0] === data[0] && prev[1] === data[1]) {
          return;
        }

        prevDataRef.current = data;
        setRawPoseData(data);
        setLatestPose(parsePoseArray(data, Date.now()));
      } catch {
        // Ignore polling errors (module not loaded, etc.)
      }
    }, Math.round(1000 / pollingFps));

    return () => clearInterval(interval);
  }, [enabled, pollingFps]);

  return { latestPose, rawPoseData };
};
