import { useState, useEffect, useRef } from 'react';
import { getLatestMotion } from '../../modules/vision-camera-frame-diff/src';

export type UseMotionDetectionOptions = {
  /** Whether motion detection polling is active. */
  enabled: boolean;
  /** Polling rate in fps. Defaults to 15. */
  pollingFps?: number;
};

export type UseMotionDetectionReturn = {
  /** Latest frame diff magnitude, 0-1. Null when disabled or no data. */
  motionMagnitude: number | null;
};

/**
 * Hook that polls the native frame diff module for the latest motion magnitude.
 *
 * Same polling pattern as usePoseDetection: the native frame processor plugin
 * stores its result in a thread-safe static variable, and this hook reads it
 * via a synchronous Expo module function.
 *
 * Import directly: `import { useMotionDetection } from '@/src/hooks/use-motion-detection'`
 */
export const useMotionDetection = ({
  enabled,
  pollingFps = 15,
}: UseMotionDetectionOptions): UseMotionDetectionReturn => {
  const [motionMagnitude, setMotionMagnitude] = useState<number | null>(null);
  const prevValueRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMotionMagnitude(null);
      prevValueRef.current = null;
      return;
    }

    const interval = setInterval(() => {
      try {
        const value = getLatestMotion();

        if (value === null || value === undefined) {
          if (prevValueRef.current !== null) {
            prevValueRef.current = null;
            setMotionMagnitude(null);
          }
          return;
        }

        // Skip update if value hasn't changed meaningfully
        if (prevValueRef.current !== null && Math.abs(value - prevValueRef.current) < 0.0001) {
          return;
        }

        prevValueRef.current = value;
        setMotionMagnitude(value);
      } catch {
        // Ignore polling errors (module not loaded, etc.)
      }
    }, Math.round(1000 / pollingFps));

    return () => clearInterval(interval);
  }, [enabled, pollingFps]);

  return { motionMagnitude };
};
