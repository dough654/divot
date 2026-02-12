import { useState, useEffect, useCallback, useRef } from 'react';
import { VisionCameraProxy, Frame } from 'react-native-vision-camera';
import { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { parsePoseArray } from '@/src/utils/pose-normalization';
import type { PoseFrame } from '@/src/types/pose';

// Ensure the native module is loaded so the plugin is registered
import '../../modules/vision-camera-pose-detection/src';

export type UsePoseDetectionOptions = {
  /** Whether pose detection is enabled (gated by feature flag + user setting). */
  enabled: boolean;
  /** Target detection frames per second. Defaults to 10. */
  targetDetectionFps?: number;
};

export type UsePoseDetectionReturn = {
  /** Raw 42-element shared value for the overlay (worklet-accessible). */
  poseSharedValue: SharedValue<number[]>;
  /** Parsed pose frame for JS consumers. Updated at detection fps. */
  latestPose: PoseFrame | null;
  /** Whether the detector is actively running. */
  isDetecting: boolean;
  /** Frame processor callback to inject into VisionCameraRecorder's onFrame. */
  processFrame: ((frame: Frame) => void) | null;
};

/**
 * Hook that manages pose detection via the native "detectPose" frame processor plugin.
 *
 * Returns a shared value for the overlay (worklet-safe) and a parsed PoseFrame
 * for JS consumers (state machine, UI indicators).
 *
 * Excluded from hooks barrel — has native dependency.
 * Import directly: `import { usePoseDetection } from '@/src/hooks/use-pose-detection'`
 */
export const usePoseDetection = ({
  enabled,
  targetDetectionFps = 10,
}: UsePoseDetectionOptions): UsePoseDetectionReturn => {
  const poseSharedValue = useSharedValue<number[]>([]);
  const [latestPose, setLatestPose] = useState<PoseFrame | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Track frame timing for throttling
  const lastDetectionTimeRef = useRef(0);
  const frameIntervalMs = 1000 / targetDetectionFps;

  // Initialize the plugin only when enabled
  const pluginRef = useRef<ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | null>(null);

  useEffect(() => {
    if (enabled) {
      pluginRef.current = VisionCameraProxy.initFrameProcessorPlugin('detectPose', {});
      setIsDetecting(true);
    } else {
      pluginRef.current = null;
      setIsDetecting(false);
      setLatestPose(null);
      poseSharedValue.value = [];
    }
  }, [enabled]);

  // Bridge shared value changes to React state for JS consumers
  const handlePoseUpdate = useCallback((data: number[]) => {
    if (data.length === 42) {
      const parsed = parsePoseArray(data, Date.now());
      setLatestPose(parsed);
    }
  }, []);

  useAnimatedReaction(
    () => poseSharedValue.value,
    (current) => {
      if (current.length === 42) {
        runOnJS(handlePoseUpdate)(current);
      }
    },
    [handlePoseUpdate]
  );

  // Frame processor callback — called from VisionCameraRecorder's onFrame
  const processFrame = useCallback((frame: Frame) => {
    'worklet';
    if (!pluginRef.current) return;

    // Throttle to target fps
    const now = Date.now();
    if (now - lastDetectionTimeRef.current < frameIntervalMs) return;
    lastDetectionTimeRef.current = now;

    const result = pluginRef.current.call(frame);
    if (result && Array.isArray(result)) {
      poseSharedValue.value = result as number[];
    }
  }, [frameIntervalMs]);

  return {
    poseSharedValue,
    latestPose,
    isDetecting,
    processFrame: enabled ? processFrame : null,
  };
};
