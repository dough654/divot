import { useState, useEffect, useRef } from 'react';
import { VisionCameraClubDetectionModule } from '../../modules/vision-camera-club-detection/src';

/** Parsed club keypoints with named fields. */
export type ClubKeypoints = {
  grip: { x: number; y: number; confidence: number };
  shaftMid: { x: number; y: number; confidence: number };
  head: { x: number; y: number; confidence: number };
};

/** Expected length of the raw club detection array (3 keypoints × 3 values). */
const CLUB_ARRAY_LENGTH = 9;

export type UseClubDetectionOptions = {
  /** Whether club detection polling is active. Only true when isInAddress. */
  enabled: boolean;
  /** Polling rate in fps. Defaults to 3. */
  pollingFps?: number;
};

export type UseClubDetectionReturn = {
  /** Parsed club keypoints, or null if no club detected. */
  clubKeypoints: ClubKeypoints | null;
  /** Camera frame aspect ratio (width/height), used for preview cover-crop correction. */
  cameraAspectRatio: number | null;
};

/**
 * Hook that polls the native club detection module for the latest results.
 *
 * Same architecture as usePoseDetection: the native frame processor plugin
 * stores detection results in a thread-safe static variable, and this hook
 * reads it via a synchronous Expo module function at the configured polling rate.
 *
 * Import directly: `import { useClubDetection } from '@/src/hooks/use-club-detection'`
 */
export const useClubDetection = ({
  enabled,
  pollingFps = 3,
}: UseClubDetectionOptions): UseClubDetectionReturn => {
  const [clubKeypoints, setClubKeypoints] = useState<ClubKeypoints | null>(null);
  const [cameraAspectRatio, setCameraAspectRatio] = useState<number | null>(null);

  // Track previous raw data to avoid unnecessary state updates
  const prevDataRef = useRef<number[] | null>(null);

  // Grace period before clearing — club detection at 3fps is slow,
  // so we tolerate a few missed frames before clearing.
  const consecutiveNullsRef = useRef(0);
  const GRACE_POLLS = 2; // ~660ms at 3fps before clearing

  useEffect(() => {
    if (!enabled) {
      // Don't clear keypoints on disable — we want the line to persist
      // after address exits. The camera screen manages clearing.
      prevDataRef.current = null;
      consecutiveNullsRef.current = 0;
      return;
    }

    const interval = setInterval(() => {
      try {
        const data = VisionCameraClubDetectionModule.getLatestClub();

        if (!data || data.length < CLUB_ARRAY_LENGTH) {
          consecutiveNullsRef.current++;
          if (consecutiveNullsRef.current >= GRACE_POLLS && prevDataRef.current !== null) {
            prevDataRef.current = null;
            setClubKeypoints(null);
          }
          return;
        }

        consecutiveNullsRef.current = 0;

        // Skip update if data hasn't changed
        const prev = prevDataRef.current;
        if (prev && prev.length === data.length && prev[0] === data[0] && prev[1] === data[1]) {
          return;
        }

        prevDataRef.current = data;

        // Extract frame aspect ratio from native (positions 9-10: frameWidth, frameHeight)
        if (data.length >= 11 && data[10] > 0) {
          setCameraAspectRatio(data[9] / data[10]);
        }

        if (__DEV__) {
          const frameDims = data.length >= 11 ? `${data[9]}×${data[10]}` : 'N/A';
          console.log(
            `[ClubDetect] raw=[${data.slice(0, 9).map(v => v.toFixed(3)).join(', ')}]` +
            ` frame=${frameDims}`,
          );
        }

        // Model keypoint indices: 0=head, 1=shaftMid, 2=grip
        // (confirmed via on-device testing — index 0 is at the bottom
        // near the ground, index 2 is at the top near the hands)
        setClubKeypoints({
          grip: { x: data[6], y: data[7], confidence: data[8] },
          shaftMid: { x: data[3], y: data[4], confidence: data[5] },
          head: { x: data[0], y: data[1], confidence: data[2] },
        });
      } catch {
        // Ignore polling errors (module not loaded, etc.)
      }
    }, Math.round(1000 / pollingFps));

    return () => clearInterval(interval);
  }, [enabled, pollingFps]);

  return { clubKeypoints, cameraAspectRatio };
};
